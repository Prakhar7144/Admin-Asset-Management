import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import { Employee } from '../models/employeeModel.js';
import { InventoryItem } from '../models/inventoryModel.js';
import { AccessCard } from '../models/accessCardModel.js';

function toObjectId(value) {
  if (!value) return null;
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;
}

function toInventoryResponse(item) {
  return {
    id: item._id?.toString?.() || item.id,
    itemType: item.itemType,
    serialNumber: item.serialNumber,
    category: item.category,
    make: item.make || null,
    model: item.model || null,
    description: item.description || null,
    status: item.status,
    employeeId: item.employeeId ? item.employeeId.toString() : null,
    employeeCode: item.employeeCode || null,
    employeeName: item.employeeName || null,
    allocatedTo: item.allocatedTo ? item.allocatedTo.toString() : null,
    history: Array.isArray(item.history)
      ? item.history.map((entry) => ({
          ...entry,
          employeeId: entry.employeeId ? entry.employeeId.toString() : null,
        }))
      : [],
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toEmployeeResponse(employee) {
  const assets = Array.isArray(employee.assets)
    ? employee.assets.map((asset) => toInventoryResponse(asset))
    : [];

  return {
    id: employee._id?.toString?.() || employee.id,
    appId: employee.appId,
    empCode: employee.empCode,
    empName: employee.empName,
    accessCard: employee.accessCard || '',
    dateOfLeaving: employee.dateOfLeaving || '',
    isArchived: Boolean(employee.isArchived),
    status: employee.status || (employee.isArchived ? 'Archived' : 'Active'),
    assets,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}

function buildHistoryEntry(employee, assignedAt = null) {
  return {
    employeeId: employee._id || null,
    employeeCode: employee.empCode || '',
    employeeName: employee.empName || '',
    assignedAt: assignedAt || new Date(),
    returnedAt: null,
    status: 'Assigned',
  };
}

async function createInventoryItemFromAsset(asset, employee) {
  const item = await InventoryItem.create({
    itemType: asset.itemType || 'Laptop',
    serialNumber: asset.serialNumber || crypto.randomUUID(),
    category: asset.category || 'IT Asset',
    make: asset.make || null,
    model: asset.model || null,
    description: asset.description || null,
    status: 'Assigned',
    employeeId: employee._id,
    employeeCode: employee.empCode,
    employeeName: employee.empName,
    allocatedTo: employee._id,
    history: [buildHistoryEntry(employee)],
  });

  return item;
}

export async function listEmployees() {
  const employees = await Employee.find().populate('assets').lean();
  return employees.map((employee) => toEmployeeResponse(employee));
}

export async function listInventory() {
  const items = await InventoryItem.find().lean();
  const cards = await AccessCard.find().lean();
  return {
    accessCards: cards.map((card) => ({
      id: card._id?.toString?.() || card.id,
      cardNumber: card.cardNumber,
      employeeId: card.employeeId ? card.employeeId.toString() : null,
      employeeCode: card.employeeCode || null,
      employeeName: card.employeeName || null,
      status: card.status,
      assignedAt: card.assignedAt,
      returnedAt: card.returnedAt,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    })),
    itAssets: items.filter((item) => item.category !== 'Access Card').map((item) => toInventoryResponse(item)),
  };
}

export async function createEmployee(input) {
  const employee = await Employee.create({
    appId: input.appId || input.id || crypto.randomUUID(),
    empCode: input.empCode,
    empName: input.empName,
    accessCard: input.accessCard || '',
    dateOfLeaving: input.dateOfLeaving || '',
    isArchived: Boolean(input.isArchived),
    status: input.isArchived ? 'Archived' : 'Active',
  });

  const assetIds = [];
  for (const asset of input.assets || []) {
    const createdItem = await createInventoryItemFromAsset(asset, employee);
    assetIds.push(createdItem._id);
  }

  employee.assets = assetIds;
  await employee.save();

  const savedEmployee = await Employee.findById(employee._id).populate('assets');
  return toEmployeeResponse(savedEmployee);
}

export async function updateEmployee(id, input) {
  const employee = await Employee.findOne(mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { appId: id });
  if (!employee) {
    return null;
  }

  employee.empCode = input.empCode;
  employee.empName = input.empName;
  employee.accessCard = input.accessCard || '';
  employee.dateOfLeaving = input.dateOfLeaving || '';
  employee.isArchived = Boolean(input.isArchived);
  employee.status = employee.isArchived ? 'Archived' : 'Active';

  const previousAssetIds = (employee.assets || []).map((assetId) => assetId.toString());
  const nextAssetIds = [];

  for (const asset of input.assets || []) {
    const existingAssetId = asset.id && mongoose.Types.ObjectId.isValid(asset.id) ? asset.id : null;
    let inventoryItem = existingAssetId ? await InventoryItem.findById(existingAssetId) : null;

    if (!inventoryItem) {
      inventoryItem = await createInventoryItemFromAsset(asset, employee);
    } else {
      inventoryItem.itemType = asset.itemType || inventoryItem.itemType;
      inventoryItem.serialNumber = asset.serialNumber || inventoryItem.serialNumber;
      inventoryItem.category = asset.category || inventoryItem.category || 'IT Asset';
      inventoryItem.make = asset.make || inventoryItem.make || null;
      inventoryItem.model = asset.model || inventoryItem.model || null;
      inventoryItem.description = asset.description || inventoryItem.description || null;
      inventoryItem.status = 'Assigned';
      inventoryItem.employeeId = employee._id;
      inventoryItem.employeeCode = employee.empCode;
      inventoryItem.employeeName = employee.empName;
      inventoryItem.allocatedTo = employee._id;
      if (!inventoryItem.history || !inventoryItem.history.length) {
        inventoryItem.history = [buildHistoryEntry(employee)];
      }
      await inventoryItem.save();
    }

    nextAssetIds.push(inventoryItem._id);
  }

  await InventoryItem.updateMany(
    { _id: { $in: previousAssetIds.map((assetId) => new mongoose.Types.ObjectId(assetId)) } },
    { $set: { employeeId: null, employeeCode: null, employeeName: null, allocatedTo: null, status: 'Unallocated' } }
  );

  employee.assets = nextAssetIds;
  await employee.save();

  const savedEmployee = await Employee.findById(employee._id).populate('assets');
  return toEmployeeResponse(savedEmployee);
}

export async function deleteEmployee(id) {
  const employee = await Employee.findOne(mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { appId: id });
  if (!employee) {
    return false;
  }

  await InventoryItem.deleteMany({ employeeId: employee._id });
  await Employee.deleteOne({ _id: employee._id });
  return true;
}

export async function createAccessCard(input) {
  const card = await AccessCard.create({
    cardNumber: input.cardNumber || input.serialNumber || crypto.randomUUID(),
    employeeId: input.employeeId ? toObjectId(input.employeeId) : null,
    employeeCode: input.employeeCode || null,
    employeeName: input.employeeName || null,
    status: input.status || 'Assigned',
    assignedAt: input.assignedAt || new Date(),
    returnedAt: input.returnedAt || null,
  });

  if (input.employeeId) {
    await Employee.findByIdAndUpdate(input.employeeId, { accessCard: card.cardNumber });
  }

  return {
    id: card._id?.toString?.() || card.id,
    cardNumber: card.cardNumber,
    employeeId: card.employeeId ? card.employeeId.toString() : null,
    employeeCode: card.employeeCode || null,
    employeeName: card.employeeName || null,
    status: card.status,
    assignedAt: card.assignedAt,
    returnedAt: card.returnedAt,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

export async function deleteAccessCard(id) {
  const card = await AccessCard.findById(id);
  if (!card) {
    return false;
  }

  await AccessCard.deleteOne({ _id: card._id });
  await Employee.updateMany(
    { accessCard: card.cardNumber },
    { $set: { accessCard: '' } }
  );
  return true;
}

export async function createItAsset(input) {
  const item = await InventoryItem.create({
    itemType: input.itemType,
    serialNumber: input.serialNumber || crypto.randomUUID(),
    category: input.category || 'IT Asset',
    make: input.make || null,
    model: input.model || null,
    description: input.description || null,
    status: input.status || 'Unallocated',
    employeeId: input.employeeId ? toObjectId(input.employeeId) : null,
    employeeCode: input.employeeCode || null,
    employeeName: input.employeeName || null,
    allocatedTo: input.employeeId ? toObjectId(input.employeeId) : null,
    history: input.employeeId ? [{ employeeId: toObjectId(input.employeeId), employeeCode: input.employeeCode || '', employeeName: input.employeeName || '', assignedAt: new Date(), returnedAt: null, status: 'Assigned' }] : [],
  });

  return toInventoryResponse(item);
}

export async function deleteItAsset(id) {
  const item = await InventoryItem.findById(id);
  if (!item) {
    return false;
  }

  await InventoryItem.deleteOne({ _id: item._id });
  await Employee.updateMany({ assets: item._id }, { $pull: { assets: item._id } });
  return true;
}

export async function exportExcel(res) {
  const employees = await Employee.find().populate('assets').lean();
  const inventoryItems = await InventoryItem.find().lean();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Employee Asset Portal';
  workbook.lastModifiedBy = 'Employee Asset Portal';
  workbook.created = new Date();
  workbook.modified = new Date();

  const employeesSheet = workbook.addWorksheet('Employees');
  employeesSheet.columns = [
    { header: 'Employee ID', key: 'id', width: 24 },
    { header: 'Employee Code', key: 'empCode', width: 16 },
    { header: 'Employee Name', key: 'empName', width: 24 },
    { header: 'Access Card', key: 'accessCard', width: 18 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Leaving Date', key: 'dateOfLeaving', width: 16 },
    { header: 'Archived', key: 'isArchived', width: 12 },
    { header: 'Assets Count', key: 'assetsCount', width: 14 },
  ];

  employees.forEach((employee) => {
    employeesSheet.addRow({
      id: employee._id?.toString?.() || employee.id,
      empCode: employee.empCode || '',
      empName: employee.empName || '',
      accessCard: employee.accessCard || '',
      status: employee.status || 'Active',
      dateOfLeaving: employee.dateOfLeaving || '',
      isArchived: employee.isArchived ? 'Yes' : 'No',
      assetsCount: Array.isArray(employee.assets) ? employee.assets.length : 0,
    });
  });

  const assetsSheet = workbook.addWorksheet('Assets');
  assetsSheet.columns = [
    { header: 'Asset ID', key: 'id', width: 24 },
    { header: 'Item Type', key: 'itemType', width: 20 },
    { header: 'Serial Number', key: 'serialNumber', width: 24 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Make', key: 'make', width: 18 },
    { header: 'Model', key: 'model', width: 18 },
    { header: 'Description', key: 'description', width: 36 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Employee ID', key: 'employeeId', width: 24 },
    { header: 'Employee Code', key: 'employeeCode', width: 16 },
    { header: 'Employee Name', key: 'employeeName', width: 24 },
    { header: 'Allocated To', key: 'allocatedTo', width: 24 },
    { header: 'History', key: 'history', width: 60 },
  ];

  inventoryItems.filter((item) => item.category !== 'Access Card').forEach((asset) => {
    assetsSheet.addRow({
      id: asset._id?.toString?.() || asset.id,
      itemType: asset.itemType || '',
      serialNumber: asset.serialNumber || '',
      category: asset.category || '',      make: asset.make || '',
      model: asset.model || '',
      description: asset.description || '',      status: asset.status || 'Unallocated',
      employeeId: asset.employeeId || '',
      employeeCode: asset.employeeCode || '',
      employeeName: asset.employeeName || '',
      allocatedTo: asset.allocatedTo || '',
      history: Array.isArray(asset.history) ? asset.history.map((entry) => `${entry.employeeName || entry.employeeCode || 'Unknown'} (${entry.status || 'Assigned'})`).join(' | ') : '',
    });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="employee-assets-export-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}
