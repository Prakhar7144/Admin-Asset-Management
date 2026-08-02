import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { connectToDatabase } from '../config/db.js';
import { Employee } from '../models/employeeModel.js';
import { AccessCard } from '../models/accessCardModel.js';
import { InventoryItem } from '../models/inventoryModel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.join(__dirname, '..', 'import-excel.log');

function appendLog(text) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_PATH, `[${timestamp}] ${text}\n`, { encoding: 'utf8' });
}

function logInfo(message) {
  console.log(message);
  appendLog(`INFO: ${message}`);
}

function logWarn(message) {
  console.warn(message);
  appendLog(`WARN: ${message}`);
}

function logError(message) {
  console.error(message);
  appendLog(`ERROR: ${message}`);
}

const HEADER_MAP = [
  { key: 'employeeCode', match: ['employee code', 'employeeid', 'emp code', 'empcode'] },
  { key: 'name', match: ['name', 'employee name', 'emp name'] },
  { key: 'accessCardNo', match: ['access card no', 'access card number', 'access card', 'card no'] },
  { key: 'dateOfLeaving', match: ['date of leaving', 'date of leaving (mm/dd/yyyy)', 'leaving date'] },
  { key: 'make', match: ['make'] },
  { key: 'model', match: ['model'] },
  { key: 'assetType', match: ['asset type', 'item type'] },
  { key: 'serialNumber', match: ['serial no / quantity', 'serial no', 'serial number', 'quantity'] },
  { key: 'otherAssets', match: ['other assets', 'other asset', 'other assets (keyboard, mouse, cables, etc)'] },
];

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');
}

function findHeaderKey(value) {
  const normalized = normalizeHeader(value);
  for (const entry of HEADER_MAP) {
    for (const pattern of entry.match) {
      if (normalized.includes(normalizeHeader(pattern))) {
        return entry.key;
      }
    }
  }
  return null;
}

function parseRow(row, headerMap) {
  const values = {};
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const key = headerMap.get(colNumber);
    if (!key) return;
    values[key] = cell.value != null ? String(cell.value).trim() : '';
  });
  return values;
}

function buildHistoryEntry(employee) {
  return {
    employeeId: employee._id,
    employeeCode: employee.empCode || '',
    employeeName: employee.empName || '',
    assignedAt: new Date(),
    returnedAt: null,
    status: 'Assigned',
  };
}

async function findOrCreateEmployee(data) {
  const empCode = String(data.employeeCode || '').trim();
  if (!empCode) {
    throw new Error('Employee Code is required');
  }

  let employee = await Employee.findOne({ empCode });
  if (!employee) {
    employee = await Employee.create({
      appId: crypto.randomUUID(),
      empCode,
      empName: String(data.name || '').trim() || 'Unknown',
      accessCard: '',
      dateOfLeaving: String(data.dateOfLeaving || '').trim(),
      isArchived: false,
      status: 'Active',
      assets: [],
    });
    logInfo(`Created employee ${empCode}`);
  } else {
    let changed = false;
    if (data.name && data.name.trim() && employee.empName !== data.name.trim()) {
      employee.empName = data.name.trim();
      changed = true;
    }
    if (data.dateOfLeaving && employee.dateOfLeaving !== data.dateOfLeaving.trim()) {
      employee.dateOfLeaving = data.dateOfLeaving.trim();
      changed = true;
    }
    if (changed) {
      await employee.save();
      logInfo(`Updated employee ${empCode}`);
    }
  }

  return employee;
}

async function createOrUpdateAccessCard(cardNumber, employee) {
  const normalizedCardNumber = String(cardNumber || '').trim();
  if (!normalizedCardNumber) {
    return null;
  }

  let card = await AccessCard.findOne({ cardNumber: normalizedCardNumber });
  if (!card) {
    card = await AccessCard.create({
      cardNumber: normalizedCardNumber,
      employeeId: employee._id,
      employeeCode: employee.empCode,
      employeeName: employee.empName,
      status: 'Assigned',
      assignedAt: new Date(),
      returnedAt: null,
    });
    logInfo(`Created access card ${normalizedCardNumber}`);
  } else {
    const update = {};
    if (!card.employeeId || !card.employeeId.equals(employee._id)) {
      update.employeeId = employee._id;
      update.employeeCode = employee.empCode;
      update.employeeName = employee.empName;
      update.status = 'Assigned';
      update.assignedAt = card.assignedAt || new Date();
      update.returnedAt = null;
    }
    if (Object.keys(update).length) {
      Object.assign(card, update);
      await card.save();
      logInfo(`Updated access card ${normalizedCardNumber}`);
    }
  }

  if (employee.accessCard !== normalizedCardNumber) {
    employee.accessCard = normalizedCardNumber;
    await employee.save();
  }

  return card;
}

async function createInventoryAsset(data, employee, options = { other: false }) {
  const trimmedSerial = String(data.serialNumber || '').trim();
  const hasSerial = Boolean(trimmedSerial);
  const assetType = String(data.assetType || '').trim() || (options.other ? 'Other' : 'Unknown');
  const make = String(data.make || '').trim() || null;
  const model = String(data.model || '').trim() || null;
  const description = options.other ? String(data.otherAssets || '').trim() || null : null;
  const category = options.other ? 'Others' : 'IT Asset';

  if (!options.other && !hasSerial) {
    logWarn(`Skipping main asset for employee ${employee.empCode} because serial number is missing.`);
  }

  if (!options.other) {
    const existing = await InventoryItem.findOne({ serialNumber: trimmedSerial });
    if (existing) {
      logWarn(`Skipping duplicate main asset serial ${trimmedSerial} for employee ${employee.empCode}.`);
      return null;
    }
  }

  const serialNumber = options.other ? `OTHER-${crypto.randomUUID()}` : trimmedSerial;

  const item = await InventoryItem.create({
    itemType: assetType,
    serialNumber,
    category,
    make,
    model,
    description,
    status: 'Assigned',
    employeeId: employee._id,
    employeeCode: employee.empCode,
    employeeName: employee.empName,
    allocatedTo: employee._id,
    history: [buildHistoryEntry(employee)],
  });

  employee.assets = Array.isArray(employee.assets) ? employee.assets : [];
  employee.assets.push(item._id);
  await employee.save();

  logInfo(`Created ${options.other ? 'other asset' : 'asset'} ${item.serialNumber} for ${employee.empCode}`);
  return item;
}

async function importExcel(filePath) {
  if (!filePath) {
    throw new Error('Excel file path is required. Run: node scripts/importFromExcel.js <file-path>');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error('No worksheet found in Excel file.');
  }

  const headerRow = sheet.getRow(1);
  const headerMap = new Map();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = findHeaderKey(cell.value);
    if (key) {
      headerMap.set(colNumber, key);
    }
  });

  const requiredHeaders = ['employeeCode', 'name', 'assetType', 'serialNumber'];
  const missing = requiredHeaders.filter((field) => !Array.from(headerMap.values()).includes(field));
  if (missing.length) {
    logWarn(`Warning: missing required headers: ${missing.join(', ')}`);
  }

  let processed = 0;
  let skipped = 0;
  let createdEmployees = 0;
  let createdAssets = 0;
  let createdOthers = 0;

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const rowData = parseRow(row, headerMap);
    const employeeCode = String(rowData.employeeCode || '').trim();
    const name = String(rowData.name || '').trim();
    const assetType = String(rowData.assetType || '').trim();
    const serialNumber = String(rowData.serialNumber || '').trim();
    const otherAssetsText = String(rowData.otherAssets || '').trim();

    if (!employeeCode && !name && !assetType && !serialNumber && !otherAssetsText) {
      continue;
    }

    if (!employeeCode) {
      logWarn(`Skipping row ${rowNumber}: missing Employee Code.`);
      skipped += 1;
      continue;
    }

    if (!name) {
      logWarn(`Skipping row ${rowNumber}: missing Name for employee ${employeeCode}.`);
      skipped += 1;
      continue;
    }

    const beforeCount = await Employee.countDocuments({ empCode: employeeCode });
    const employee = await findOrCreateEmployee(rowData);
    const afterCount = await Employee.countDocuments({ empCode: employeeCode });
    if (afterCount > beforeCount) {
      createdEmployees += 1;
    }

    if (rowData.accessCardNo) {
      await createOrUpdateAccessCard(rowData.accessCardNo, employee);
    }

    const asset = await createInventoryAsset(rowData, employee, { other: false });
    if (asset) {
      createdAssets += 1;
    }

    if (otherAssetsText) {
      const otherAsset = await createInventoryAsset(rowData, employee, { other: true });
      if (otherAsset) {
        createdOthers += 1;
      }
    }

    processed += 1;
  }

  logInfo('Import complete.');
  logInfo(`Rows processed: ${processed}`);
  logInfo(`Employees created: ${createdEmployees}`);
  logInfo(`Assets created: ${createdAssets}`);
  logInfo(`Other assets created: ${createdOthers}`);
  logInfo(`Rows skipped: ${skipped}`);
}

async function main() {
  try {
    await connectToDatabase();
    const filePath = process.argv[2];
    await importExcel(filePath);
    await mongoose.disconnect();
  } catch (error) {
    logError('Import failed: ' + (error.message || error));
    process.exit(1);
  }
}

main();
