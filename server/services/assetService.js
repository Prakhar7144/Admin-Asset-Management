import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import { Employee } from '../models/employeeModel.js';
import { InventoryItem } from '../models/inventoryModel.js';
import { AccessCard } from '../models/accessCardModel.js';
import { getEmployeeStatus, isDateOfLeavingPastOrToday, parseDateSafe } from '../utils/dateUtils.js';

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

function buildReturnedHistoryEntry(employee) {
  const returnedAt = parseDateSafe(employee.dateOfLeaving);
  return {
    employeeId: employee._id || null,
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
  }
}

async function createInventoryItemFromAsset(asset, employee, options = {}) {
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

function closeAssetHistory(item, employee, outcome) {
  item.history = Array.isArray(item.history) ? item.history : [];
  const lastEntry = item.history[item.history.length - 1];
  if (lastEntry && !lastEntry.returnedAt) {
    lastEntry.returnedAt = new Date();
    lastEntry.status = outcome;
  } else {
    item.history.push({ ...buildHistoryEntry(employee), returnedAt: new Date(), status: outcome });
  }
}

export async function listItNoc() {
  const employees = await Employee.find({ status: 'Pending Release', isArchived: false }).lean();
  const dueEmployees = employees.filter((employee) => isDateOfLeavingPastOrToday(employee.dateOfLeaving));
  const employeeIds = dueEmployees.map((employee) => employee._id);
  const [assets, cards] = await Promise.all([
    InventoryItem.find({ employeeId: { $in: employeeIds }, status: 'Pending IT NOC' }).lean(),
    AccessCard.find({ employeeId: { $in: employeeIds }, status: 'Pending IT NOC' }).lean(),
  ]);

  return dueEmployees.map((employee) => ({
    id: employee._id.toString(),
    empCode: employee.empCode,
    empName: employee.empName,
    dateOfLeaving: employee.dateOfLeaving,
    assets: assets.filter((asset) => asset.employeeId?.toString() === employee._id.toString()).map(toInventoryResponse),
    accessCards: cards.filter((card) => card.employeeId?.toString() === employee._id.toString()).map((card) => ({
      id: card._id.toString(), cardNumber: card.cardNumber, status: card.status,
    })),
  })).filter((entry) => entry.assets.length || entry.accessCards.length);
}

export async function completeItNoc(id, input = {}) {
  const employee = await Employee.findOne(mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { appId: id });
  if (!employee) return { error: 'not_found' };
  if (employee.status !== 'Pending Release' || !isDateOfLeavingPastOrToday(employee.dateOfLeaving)) return { error: 'not_due' };

  const [assets, cards] = await Promise.all([
    InventoryItem.find({ employeeId: employee._id, status: 'Pending IT NOC' }),
    AccessCard.find({ employeeId: employee._id, status: 'Pending IT NOC' }),
  ]);
  const assetOutcomes = new Map((input.assets || []).map((entry) => [String(entry.id), entry.outcome]));
  const cardOutcomes = new Map((input.accessCards || []).map((entry) => [String(entry.id), entry.outcome]));
  const allowed = new Set(['Returned', 'Damaged', 'Missing']);
  if (assets.some((item) => !allowed.has(assetOutcomes.get(item._id.toString()))) || cards.some((card) => !allowed.has(cardOutcomes.get(card._id.toString()))) || assetOutcomes.size !== assets.length || cardOutcomes.size !== cards.length) {
    return { error: 'incomplete' };
  }

  const snapshotAssetIds = assets.map((item) => item._id);
  const snapshotAccessCard = employee.accessCard || cards[0]?.cardNumber || '';
  for (const item of assets) {
    const outcome = assetOutcomes.get(item._id.toString());
    item.status = outcome === 'Returned' ? 'Unallocated' : outcome;
    closeAssetHistory(item, employee, outcome);
    item.employeeId = null; item.employeeCode = null; item.employeeName = null; item.allocatedTo = null;
    await item.save();
  }
  for (const card of cards) {
    const outcome = cardOutcomes.get(card._id.toString());
    card.status = outcome === 'Returned' ? 'Unassigned' : outcome;
    card.employeeId = null; card.employeeCode = null; card.employeeName = null; card.returnedAt = new Date();
    await card.save();
  }
  employee.status = 'Released';
  employee.accessCard = '';
  employee.releaseSnapshot = { assetIds: snapshotAssetIds, accessCard: snapshotAccessCard, releasedAt: new Date() };
  await employee.save();
  return { success: true, releasedEmployeeId: employee._id.toString() };
}

export async function createEmployee(input) {
  const hasLeft = isDateOfLeavingPastOrToday(input.dateOfLeaving);

  const employee = await Employee.create({
    appId: input.appId || input.id || crypto.randomUUID(),
    empCode: input.empCode,
    empName: input.empName,
    accessCard: input.accessCard || '',
    dateOfLeaving: input.dateOfLeaving || '',
    isArchived: Boolean(input.isArchived),
    status: getEmployeeStatus(input.dateOfLeaving, Boolean(input.isArchived)),
  });

  const assetIds = [];
  for (const asset of input.assets || []) {
    const createdItem = await createInventoryItemFromAsset(asset, employee, { hasLeft });
    if (employee.status !== 'Released') {
      assetIds.push(createdItem._id);
    }
  }

  employee.assets = assetIds;
  await employee.save();

  const savedEmployee = await Employee.findById(employee._id).populate('assets').lean();
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
  const hasLeft = isDateOfLeavingPastOrToday(employee.dateOfLeaving);
  employee.isArchived = Boolean(input.isArchived);
  employee.status = getEmployeeStatus(employee.dateOfLeaving, employee.isArchived);

  const previousAssetIds = (employee.assets || []).map((assetId) => assetId.toString());

  const nextAssetIds = [];

  for (const asset of input.assets || []) {
    const existingAssetId = asset.id && mongoose.Types.ObjectId.isValid(asset.id) ? asset.id : null;
    let inventoryItem = existingAssetId ? await InventoryItem.findById(existingAssetId) : null;

    if (!inventoryItem) {
      inventoryItem = await createInventoryItemFromAsset(asset, employee, { hasLeft });
    } else if (employee.status !== 'Released') {
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
    // When hasLeft is true and the item already existed, it's left untouched here and
    // excluded from nextAssetIds below, so the removedAssetIds cleanup unassigns it and
    // closes its history with a Returned entry dated to the employee's leaving date.

    if (employee.status !== 'Released') {
      nextAssetIds.push(inventoryItem._id);
    }
  }

  const nextAssetIdSet = new Set(nextAssetIds.map((assetId) => assetId.toString()));
  const removedAssetIds = previousAssetIds.filter((assetId) => !nextAssetIdSet.has(assetId));
  const removalReturnedAt = hasLeft ? parseDateSafe(employee.dateOfLeaving) : new Date();

  for (const removedAssetId of removedAssetIds) {
    const removedItem = await InventoryItem.findById(removedAssetId);
    if (!removedItem) continue;

    if (Array.isArray(removedItem.history) && removedItem.history.length) {
      const lastEntry = removedItem.history[removedItem.history.length - 1];
      if (!lastEntry.returnedAt) {
        lastEntry.returnedAt = removalReturnedAt;
        lastEntry.status = 'Returned';
      }
    }
    removedItem.employeeId = null;
    removedItem.employeeCode = null;
    removedItem.employeeName = null;
    removedItem.allocatedTo = null;
    removedItem.status = 'Unallocated';
    await removedItem.save();
  }

  employee.assets = nextAssetIds;
  await employee.save();

  const savedEmployee = await Employee.findById(employee._id).populate('assets').lean();
  return toEmployeeResponse(savedEmployee);
}

export async function reactivateEmployee(id) {
  const employee = await Employee.findOne(mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { appId: id });
  if (!employee) {
    return { error: 'not_found' };
  }

  if (employee.status !== 'Released') {
    return { error: 'not_released' };
  }

  const snapshot = employee.releaseSnapshot;
  if (!snapshot || !snapshot.releasedAt) {
    return { error: 'no_snapshot' };
  }

  const snapshotAssetIds = Array.isArray(snapshot.assetIds) ? snapshot.assetIds : [];
  const snapshotAccessCard = snapshot.accessCard || '';

  employee.dateOfLeaving = '';
  employee.isArchived = false;
  employee.status = 'Active';

  const restoredAssetIds = [];
  const skippedAssets = [];

  for (const assetId of snapshotAssetIds) {
    const item = await InventoryItem.findById(assetId);
    if (!item) {
      skippedAssets.push({ id: assetId.toString(), reason: 'missing' });
      continue;
    }

    const assignedElsewhere = item.status === 'Assigned'
      && item.employeeId
      && item.employeeId.toString() !== employee._id.toString();
    if (assignedElsewhere) {
      skippedAssets.push({
        id: item._id.toString(),
        serialNumber: item.serialNumber,
        reason: 'reassigned',
        employeeName: item.employeeName || null,
      });
      continue;
    }

    item.status = 'Assigned';
    item.employeeId = employee._id;
    item.employeeCode = employee.empCode;
    item.employeeName = employee.empName;
    item.allocatedTo = employee._id;
    item.history = Array.isArray(item.history) ? item.history : [];
    item.history.push(buildHistoryEntry(employee));
    await item.save();
    restoredAssetIds.push(item._id);
  }

  let restoredCard = null;
  let skippedCard = null;

  if (snapshotAccessCard) {
    const card = await AccessCard.findOne({ cardNumber: snapshotAccessCard });
    if (!card) {
      skippedCard = { cardNumber: snapshotAccessCard, reason: 'missing' };
    } else {
      const cardAssignedElsewhere = card.status === 'Assigned'
        && card.employeeId
        && card.employeeId.toString() !== employee._id.toString();
      if (cardAssignedElsewhere) {
        skippedCard = {
          cardNumber: card.cardNumber,
          reason: 'reassigned',
          employeeName: card.employeeName || null,
        };
      } else {
        card.employeeId = employee._id;
        card.employeeCode = employee.empCode;
        card.employeeName = employee.empName;
        card.status = 'Assigned';
        card.assignedAt = new Date();
        card.returnedAt = null;
        await card.save();
        employee.accessCard = card.cardNumber;
        restoredCard = card.cardNumber;
      }
    }
  }

  employee.assets = restoredAssetIds;
  employee.releaseSnapshot = { assetIds: [], accessCard: '', releasedAt: null };
  await employee.save();

  const savedEmployee = await Employee.findById(employee._id).populate('assets').lean();
  return {
    employee: toEmployeeResponse(savedEmployee),
    summary: {
      restoredAssets: restoredAssetIds.length,
      skippedAssets,
      restoredCard,
      skippedCard,
    },
  };
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
  const employeeObjectId = input.employeeId ? toObjectId(input.employeeId) : null;
  const employee = employeeObjectId ? await Employee.findById(employeeObjectId) : null;
  const employeeHasLeft = employee && ['Released', 'Archived'].includes(employee.status);

  const card = await AccessCard.create({
    cardNumber: input.cardNumber || input.serialNumber || crypto.randomUUID(),
    employeeId: employee && !employeeHasLeft ? employee._id : null,
    employeeCode: employee && !employeeHasLeft ? employee.empCode : null,
    employeeName: employee && !employeeHasLeft ? employee.empName : null,
    status: employeeHasLeft ? 'Unassigned' : (employee ? 'Assigned' : 'Unassigned'),
    assignedAt: employee && !employeeHasLeft ? new Date() : null,
    returnedAt: employeeHasLeft ? parseDateSafe(employee.dateOfLeaving) : null,
  });

  if (employee && !employeeHasLeft) {
    employee.accessCard = card.cardNumber;
    await employee.save();
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
  const employeeObjectId = input.employeeId ? toObjectId(input.employeeId) : null;
  const employee = employeeObjectId ? await Employee.findById(employeeObjectId) : null;

  const item = await InventoryItem.create({
    itemType: input.itemType,
    serialNumber: input.serialNumber || crypto.randomUUID(),
    category: input.category || 'IT Asset',
    make: input.make || null,
    model: input.model || null,
    description: input.description || null,
    status: employee ? 'Assigned' : 'Unallocated',
    employeeId: employee ? employee._id : null,
    employeeCode: employee ? employee.empCode : null,
    employeeName: employee ? employee.empName : null,
    allocatedTo: employee ? employee._id : null,
    history: employee ? [buildHistoryEntry(employee)] : [],
  });

  if (employee) {
    employee.assets = Array.isArray(employee.assets) ? employee.assets : [];
    employee.assets.push(item._id);
    await employee.save();
  }

  return toInventoryResponse(item.toObject());
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
      category: asset.category || '',
      make: asset.make || '',
      model: asset.model || '',
      description: asset.description || '',
      status: asset.status || 'Unallocated',
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
