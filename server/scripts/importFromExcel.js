import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { connectToDatabase } from '../config/db.js';
import { Employee } from '../models/employeeModel.js';
import { AccessCard } from '../models/accessCardModel.js';
import { InventoryItem } from '../models/inventoryModel.js';
import { isDateOfLeavingPastOrToday, parseDateSafe } from '../utils/dateUtils.js';

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
const REQUIRED_HEADERS = ['employeeCode', 'name', 'assetType', 'serialNumber'];

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

function findHeaderRow(sheet) {
  let bestMatch = null;

  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const headerMap = new Map();

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = findHeaderKey(cell.value);
      if (key && !headerMap.has(colNumber)) {
        headerMap.set(colNumber, key);
      }
    });

    const detectedHeaders = new Set(headerMap.values());
    const requiredHeaderCount = REQUIRED_HEADERS.filter((key) => detectedHeaders.has(key)).length;
    const score = (requiredHeaderCount * 100) + detectedHeaders.size;

    // A partial row (for example, a report title containing "Employee Code")
    // must not be mistaken for a header. The real import header has all of the
    // core fields needed to identify an employee and their assigned asset.
    if (requiredHeaderCount === REQUIRED_HEADERS.length && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { rowNumber, headerMap, score };
    }
  }

  if (!bestMatch) {
    throw new Error(`Could not find a header row containing all required columns: ${REQUIRED_HEADERS.join(', ')}.`);
  }

  return bestMatch;
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

function buildReturnedHistoryEntry(employee) {
  const returnedAt = parseDateSafe(employee.dateOfLeaving);
  return {
    employeeId: employee._id,
    employeeCode: employee.empCode || '',
    employeeName: employee.empName || '',
    assignedAt: returnedAt,
    returnedAt,
    status: 'Returned',
  };
}

async function unassignAccessCardsForEmployee(employee) {
  await AccessCard.updateMany({
    status: 'Assigned',
    $or: [
      { employeeId: employee._id },
      { employeeCode: employee.empCode },
    ],
  }, {
    $set: {
      employeeId: null,
      employeeCode: null,
      employeeName: null,
      status: 'Unassigned',
      returnedAt: parseDateSafe(employee.dateOfLeaving),
    },
  });

  if (employee.accessCard) {
    employee.accessCard = '';
    await employee.save();
  }
}

async function findOrCreateEmployee(data, options = {}) {
  const hasLeft = Boolean(options.hasLeft);
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
      status: hasLeft ? 'Released' : 'Active',
      assets: [],
    });
    logInfo(`Created employee ${empCode}${hasLeft ? ' (Released — date of leaving has passed)' : ''}`);
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
    if (hasLeft && employee.status !== 'Released') {
      employee.status = 'Released';
      changed = true;
    }
    if (changed) {
      await employee.save();
      logInfo(`Updated employee ${empCode}`);
    }
  }

  if (hasLeft) {
    await unassignAccessCardsForEmployee(employee);
  }

  return employee;
}

async function createOrUpdateAccessCard(cardNumber, employee, options = {}) {
  const hasLeft = Boolean(options.hasLeft);
  const normalizedCardNumber = String(cardNumber || '').trim();
  if (!normalizedCardNumber) {
    return null;
  }

  let card = await AccessCard.findOne({ cardNumber: normalizedCardNumber });
  if (!card) {
    card = await AccessCard.create({
      cardNumber: normalizedCardNumber,
      employeeId: hasLeft ? null : employee._id,
      employeeCode: hasLeft ? null : employee.empCode,
      employeeName: hasLeft ? null : employee.empName,
      status: hasLeft ? 'Unassigned' : 'Assigned',
      assignedAt: new Date(),
      returnedAt: hasLeft ? parseDateSafe(employee.dateOfLeaving) : null,
    });
    logInfo(`Created access card ${normalizedCardNumber}`);
  } else {
    const update = {};
    if (hasLeft) {
      if (card.employeeId?.equals(employee._id) || card.employeeCode === employee.empCode) {
        update.employeeId = null;
        update.employeeCode = null;
        update.employeeName = null;
        update.status = 'Unassigned';
        update.returnedAt = parseDateSafe(employee.dateOfLeaving);
      }
    } else if (!card.employeeId || !card.employeeId.equals(employee._id)) {
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

  if (!hasLeft && employee.accessCard !== normalizedCardNumber) {
    employee.accessCard = normalizedCardNumber;
    await employee.save();
  }

  return card;
}

async function reassignExistingAsset(existing, employee, options = {}) {
  existing.itemType = options.itemType || existing.itemType;
  existing.make = options.make !== undefined ? options.make : existing.make;
  existing.model = options.model !== undefined ? options.model : existing.model;

  existing.history = Array.isArray(existing.history) ? existing.history : [];
  const lastEntry = existing.history[existing.history.length - 1];
  if (lastEntry && !lastEntry.returnedAt) {
    lastEntry.returnedAt = new Date();
    lastEntry.status = 'Returned';
  }

  if (options.hasLeft) {
    existing.history.push(buildReturnedHistoryEntry(employee));
    existing.status = 'Unallocated';
    existing.employeeId = null;
    existing.employeeCode = null;
    existing.employeeName = null;
    existing.allocatedTo = null;
  } else {
    existing.history.push(buildHistoryEntry(employee));
    existing.status = 'Assigned';
    existing.employeeId = employee._id;
    existing.employeeCode = employee.empCode;
    existing.employeeName = employee.empName;
    existing.allocatedTo = employee._id;

    employee.assets = Array.isArray(employee.assets) ? employee.assets : [];
    if (!employee.assets.some((assetId) => assetId.equals(existing._id))) {
      employee.assets.push(existing._id);
      await employee.save();
    }
  }

  await existing.save();
  logInfo(`Reassigned asset ${existing.serialNumber} to ${employee.empCode}${options.hasLeft ? ' as Unallocated (employee already left)' : ''}`);
  return existing;
}

async function createInventoryAsset(data, employee, options = { other: false, hasLeft: false }) {
  const trimmedSerial = String(data.serialNumber || '').trim();
  const hasSerial = Boolean(trimmedSerial);
  const assetType = options.other ? 'Other' : (String(data.assetType || '').trim() || 'Unknown');
  const make = String(data.make || '').trim() || null;
  const model = String(data.model || '').trim() || null;
  const description = options.other ? String(data.otherAssets || '').trim() || null : null;
  const category = options.other ? 'Others' : 'IT Asset';

  if (!options.other && !hasSerial) {
    logWarn(`Serial number missing for employee ${employee.empCode}; generating a placeholder so the record is still inserted.`);
  }

  if (!options.other && hasSerial) {
    const existing = await InventoryItem.findOne({ serialNumber: trimmedSerial });
    if (existing) {
      if (existing.status === 'Assigned' && existing.employeeId) {
        if (existing.employeeId.equals(employee._id)) {
          logWarn(`Asset ${trimmedSerial} is already assigned to ${employee.empCode}; skipping duplicate row.`);
          return null;
        }
        logWarn(`Skipping asset serial ${trimmedSerial} for employee ${employee.empCode}: still assigned to ${existing.employeeName || existing.employeeCode || 'another employee'}.`);
        return null;
      }

      return reassignExistingAsset(existing, employee, { itemType: assetType, make, model, hasLeft: options.hasLeft });
    }
  }

  const serialNumber = options.other
    ? `OTHER-${crypto.randomUUID()}`
    : hasSerial
      ? trimmedSerial
      : `NA-${crypto.randomUUID()}`;

  const item = await InventoryItem.create({
    itemType: assetType,
    serialNumber,
    category,
    make,
    model,
    description,
    status: options.hasLeft ? 'Unallocated' : 'Assigned',
    employeeId: options.hasLeft ? null : employee._id,
    employeeCode: options.hasLeft ? null : employee.empCode,
    employeeName: options.hasLeft ? null : employee.empName,
    allocatedTo: options.hasLeft ? null : employee._id,
    history: [options.hasLeft ? buildReturnedHistoryEntry(employee) : buildHistoryEntry(employee)],
  });

  if (!options.hasLeft) {
    employee.assets = Array.isArray(employee.assets) ? employee.assets : [];
    employee.assets.push(item._id);
    await employee.save();
  }

  logInfo(`Created ${options.other ? 'other asset' : 'asset'} ${item.serialNumber} for ${employee.empCode}${options.hasLeft ? ' as Unallocated (employee already left)' : ''}`);
  return item;
}

function isAccessCardAsset(assetType) {
  return normalizeHeader(assetType) === 'access card';
}

async function createUnassignedInventoryAsset(data, options = { other: false }) {
  const trimmedSerial = String(data.serialNumber || '').trim();
  const assetType = options.other ? 'Other' : (String(data.assetType || '').trim() || 'Unknown');
  const serialNumber = options.other
    ? `OTHER-${crypto.randomUUID()}`
    : trimmedSerial || `NA-${crypto.randomUUID()}`;

  if (!options.other && trimmedSerial) {
    const existing = await InventoryItem.findOne({ serialNumber: trimmedSerial });
    if (existing) {
      logWarn(`Skipping unassigned asset ${trimmedSerial}: an inventory record with that serial number already exists.`);
      return null;
    }
  }

  const item = await InventoryItem.create({
    itemType: assetType,
    serialNumber,
    category: options.other ? 'Others' : 'IT Asset',
    make: String(data.make || '').trim() || null,
    model: String(data.model || '').trim() || null,
    description: options.other ? String(data.otherAssets || '').trim() || null : null,
    status: 'Unallocated',
    employeeId: null,
    employeeCode: null,
    employeeName: null,
    allocatedTo: null,
    history: [],
  });

  logInfo(`Created unassigned ${options.other ? 'other asset' : 'asset'} ${item.serialNumber}.`);
  return item;
}

async function createUnassignedAccessCard(data) {
  const cardNumber = String(data.accessCardNo || data.serialNumber || '').trim() || `CARD-${crypto.randomUUID()}`;
  const existing = await AccessCard.findOne({ cardNumber });
  if (existing) {
    logWarn(`Skipping unassigned access card ${cardNumber}: a card with that number already exists.`);
    return null;
  }

  const card = await AccessCard.create({
    cardNumber,
    employeeId: null,
    employeeCode: null,
    employeeName: null,
    status: 'Unassigned',
    assignedAt: null,
    returnedAt: null,
  });

  logInfo(`Created unassigned access card ${card.cardNumber}.`);
  return card;
}

export async function importExcel(filePath) {
  if (!filePath) {
    throw new Error('Excel file path is required. Run: node scripts/importFromExcel.js <file-path>');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error('No worksheet found in Excel file.');
  }

  const { rowNumber: headerRowNumber, headerMap } = findHeaderRow(sheet);
  logInfo(`Detected row ${headerRowNumber} as the header row.`);

  const missing = REQUIRED_HEADERS.filter((field) => !Array.from(headerMap.values()).includes(field));
  if (missing.length) {
    logWarn(`Warning: missing required headers: ${missing.join(', ')}`);
  }

  let processed = 0;
  let skipped = 0;
  let createdEmployees = 0;
  let createdAssets = 0;
  let createdOthers = 0;

  for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
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

    try {
      if (!employeeCode) {
        if (isAccessCardAsset(assetType)) {
          await createUnassignedAccessCard(rowData);
          processed += 1;
          continue;
        }

        if (assetType || serialNumber) {
          const asset = await createUnassignedInventoryAsset(rowData);
          if (asset) {
            createdAssets += 1;
          }
          processed += 1;
          continue;
        }

        if (otherAssetsText) {
          const otherAsset = await createUnassignedInventoryAsset(rowData, { other: true });
          if (otherAsset) {
            createdOthers += 1;
          }
          processed += 1;
          continue;
        }

        logWarn(`Skipping row ${rowNumber}: it has no employee or inventory information.`);
        skipped += 1;
        continue;
      }

      if (!name) {
        logWarn(`Row ${rowNumber}: Name is missing for employee ${employeeCode}; continuing with the fields that are present.`);
      }

      const hasLeft = isDateOfLeavingPastOrToday(rowData.dateOfLeaving);
      const beforeCount = await Employee.countDocuments({ empCode: employeeCode });
      const employee = await findOrCreateEmployee(rowData, { hasLeft });
      const afterCount = await Employee.countDocuments({ empCode: employeeCode });
      if (afterCount > beforeCount) {
        createdEmployees += 1;
      }

      if (rowData.accessCardNo) {
        await createOrUpdateAccessCard(rowData.accessCardNo, employee, { hasLeft });
      }

      if (assetType || serialNumber) {
        const asset = await createInventoryAsset(rowData, employee, { other: false, hasLeft });
        if (asset) {
          createdAssets += 1;
        }
      }

      if (otherAssetsText) {
        const otherAsset = await createInventoryAsset(rowData, employee, { other: true, hasLeft });
        if (otherAsset) {
          createdOthers += 1;
        }
      }

      processed += 1;
    } catch (error) {
      logError(`Row ${rowNumber} (employee ${employeeCode}) failed: ${error.message || error}. Continuing with the remaining rows.`);
      skipped += 1;
    }
  }

  logInfo('Import complete.');
  logInfo(`Rows processed: ${processed}`);
  logInfo(`Employees created: ${createdEmployees}`);
  logInfo(`Assets created: ${createdAssets}`);
  logInfo(`Other assets created: ${createdOthers}`);
  logInfo(`Rows skipped: ${skipped}`);

  return { processed, skipped, createdEmployees, createdAssets, createdOthers };
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

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main();
}
