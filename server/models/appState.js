import mongoose from 'mongoose';
import ExcelJS from 'exceljs';

const appStateSchema = new mongoose.Schema({
  employees: { type: [mongoose.Schema.Types.Mixed], default: [] },
  inventory: { type: [mongoose.Schema.Types.Mixed], default: [] },
  accessCards: { type: [mongoose.Schema.Types.Mixed], default: [] },
  itAssets: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });

export const AppState = mongoose.model('AppState', appStateSchema);

export function createDefaultState() {
  return {
    employees: [],
    inventory: [],
    accessCards: [],
    itAssets: [],
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

let memoryState = createDefaultState();
let databaseReady = false;

export function markDatabaseReady() {
  databaseReady = true;
}

export async function readData() {
  if (!databaseReady) {
    return cloneState(memoryState);
  }

  const document = await AppState.findOne({}).lean();
  if (!document) {
    return createDefaultState();
  }

  return {
    employees: Array.isArray(document.employees) ? document.employees : [],
    inventory: Array.isArray(document.inventory) ? document.inventory : [],
    accessCards: Array.isArray(document.accessCards) ? document.accessCards : [],
    itAssets: Array.isArray(document.itAssets) ? document.itAssets : [],
  };
}

export async function writeData(data) {
  const normalized = {
    ...createDefaultState(),
    ...data,
    employees: Array.isArray(data?.employees) ? data.employees : [],
    inventory: Array.isArray(data?.inventory) ? data.inventory : [],
    accessCards: Array.isArray(data?.accessCards) ? data.accessCards : [],
    itAssets: Array.isArray(data?.itAssets) ? data.itAssets : [],
  };

  memoryState = cloneState(normalized);

  if (!databaseReady) {
    return;
  }

  await AppState.findOneAndUpdate(
    {},
    { $set: normalized },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

function parseDateInput(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function createHistoryEntry(employee, assignedAt = null) {
  return {
    employeeId: employee?.id || null,
    employeeCode: employee?.empCode || '',
    employeeName: employee?.empName || '',
    assignedAt: assignedAt || new Date().toISOString(),
    returnedAt: null,
    status: 'Assigned',
  };
}

function normalizeAsset(asset, employee = null, fallback = {}) {
  const base = { ...fallback, ...asset };
  const history = Array.isArray(base.history) ? base.history.map((entry) => ({ ...entry })) : [];
  const currentEmployee = employee && employee.status !== 'Released' && employee.status !== 'Archived' ? employee : null;
  const now = new Date().toISOString();
  const lastEntry = history[history.length - 1];

  if (currentEmployee) {
    if (!lastEntry || lastEntry.employeeId !== currentEmployee.id || lastEntry.returnedAt) {
      if (lastEntry && !lastEntry.returnedAt) {
        history[history.length - 1] = {
          ...lastEntry,
          returnedAt: now,
          status: 'Returned',
        };
      }
      history.push(createHistoryEntry(currentEmployee, now));
    }
  } else if (lastEntry && !lastEntry.returnedAt) {
    history[history.length - 1] = {
      ...lastEntry,
      returnedAt: now,
      status: 'Returned',
    };
  }

  return {
    ...base,
    id: base.id || crypto.randomUUID(),
    itemType: base.itemType || fallback.itemType || 'Laptop',
    serialNumber: base.serialNumber || fallback.serialNumber || '',
    category: base.category || fallback.category || 'IT Asset',
    make: base.make || fallback.make || null,
    model: base.model || fallback.model || null,
    description: base.description || fallback.description || null,
    status: currentEmployee ? 'Assigned' : 'Unallocated',
    employeeId: currentEmployee?.id || base.employeeId || fallback.employeeId || null,
    employeeCode: currentEmployee?.empCode || base.employeeCode || fallback.employeeCode || null,
    employeeName: currentEmployee?.empName || base.employeeName || fallback.employeeName || null,
    allocatedTo: currentEmployee?.id || base.allocatedTo || fallback.allocatedTo || null,
    history,
  };
}

export function syncInventory(data) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const employees = Array.isArray(data?.employees) ? data.employees : [];
  const inventory = Array.isArray(data?.inventory) ? data.inventory : [];
  const persistedAccessCards = Array.isArray(data?.accessCards) ? data.accessCards : [];
  const persistedItAssets = Array.isArray(data?.itAssets) ? data.itAssets : [];

  const normalizedEmployees = employees.map((employee) => {
    const leavingDate = parseDateInput(employee.dateOfLeaving);
    const hasPassed = Boolean(leavingDate && leavingDate < today);
    const status = employee.isArchived ? 'Archived' : hasPassed ? 'Released' : 'Active';

    return {
      ...employee,
      status,
      assets: (employee.assets || []).map((asset) => ({
        ...asset,
        id: asset.id || crypto.randomUUID(),
        itemType: asset.itemType || 'Laptop',
        serialNumber: asset.serialNumber || '',
        category: asset.category || 'IT Asset',
        make: asset.make || null,
        model: asset.model || null,
        description: asset.description || null,
        status: status === 'Released' || status === 'Archived' ? 'Unallocated' : 'Assigned',
      })),
    };
  });

  const inventorySource = [...persistedItAssets, ...inventory];
  const allNormalized = [];
  normalizedEmployees.forEach((employee) => {
    employee.assets.forEach((asset) => {
      allNormalized.push(normalizeAsset(asset, employee, {}));
    });
  });
  inventorySource.forEach((item) => {
    allNormalized.push(normalizeAsset(item, null, {}));
  });

  const mergedBySerial = new Map();
  allNormalized.forEach((item) => {
    const canonicalSerial = item && item.serialNumber ? String(item.serialNumber).trim().toLowerCase() : null;
    const key = canonicalSerial ? `serial:${canonicalSerial}` : item.id || null;
    if (!key) return;

    if (!mergedBySerial.has(key)) {
      mergedBySerial.set(key, { ...item, history: Array.isArray(item.history) ? [...item.history] : [] });
      return;
    }

    const existing = mergedBySerial.get(key);
    const combined = [...(existing.history || []), ...(item.history || [])];
    const grouped = new Map();
    combined.forEach((h) => {
      const empKey = h.employeeId || `${h.employeeCode || ''}:${h.employeeName || ''}`;
      if (!grouped.has(empKey)) {
        grouped.set(empKey, { ...h, _hasOpen: !h.returnedAt });
        return;
      }
      const cur = grouped.get(empKey);
      if (h.assignedAt && (!cur.assignedAt || new Date(h.assignedAt) < new Date(cur.assignedAt))) {
        cur.assignedAt = h.assignedAt;
      }
      if (h.returnedAt && (!cur.returnedAt || new Date(h.returnedAt) > new Date(cur.returnedAt))) {
        cur.returnedAt = h.returnedAt;
      }
      if (!h.returnedAt) cur._hasOpen = true;
      grouped.set(empKey, cur);
    });
    const uniqueHistory = Array.from(grouped.values()).map((h) => {
      const copy = { ...h };
      if (copy._hasOpen) {
        copy.returnedAt = null;
        copy.status = 'Assigned';
      } else {
        copy.status = copy.returnedAt ? 'Returned' : 'Assigned';
      }
      delete copy._hasOpen;
      return copy;
    }).sort((a, b) => (a.assignedAt || '').localeCompare(b.assignedAt || ''));
    existing.history = uniqueHistory;

    if (item.status === 'Assigned') {
      existing.status = 'Assigned';
      existing.employeeId = item.employeeId || existing.employeeId;
      existing.employeeCode = item.employeeCode || existing.employeeCode;
      existing.employeeName = item.employeeName || existing.employeeName;
      existing.allocatedTo = item.allocatedTo || existing.allocatedTo;
    }

    mergedBySerial.set(key, existing);
  });

  const dedupedInventory = Array.from(mergedBySerial.values()).filter((item) => item && item.serialNumber);

  const accessCardIndex = new Map();
  const registerCard = (card) => {
    const key = card.id || card.cardNumber;
    if (!key) return null;
    const existing = accessCardIndex.get(key) || persistedAccessCards.find((entry) => entry.id === card.id || entry.cardNumber === card.cardNumber) || {};
    const normalized = {
      ...existing,
      ...card,
      id: card.id || existing.id || `access-${crypto.randomUUID()}`,
      cardNumber: card.cardNumber || existing.cardNumber || '',
      employeeId: card.employeeId || existing.employeeId || null,
      employeeCode: card.employeeCode || existing.employeeCode || null,
      employeeName: card.employeeName || existing.employeeName || null,
      status: card.status || existing.status || 'Assigned',
      assignedAt: card.assignedAt || existing.assignedAt || null,
      returnedAt: card.returnedAt || existing.returnedAt || null,
    };
    accessCardIndex.set(key, normalized);
    return normalized;
  };

  normalizedEmployees
    .filter((employee) => Boolean(employee.accessCard))
    .forEach((employee) => {
      registerCard({
        id: `access-${employee.id}`,
        cardNumber: employee.accessCard,
        employeeId: employee.id,
        employeeCode: employee.empCode,
        employeeName: employee.empName,
        status: employee.status === 'Released' || employee.status === 'Archived' ? 'Returned' : 'Assigned',
        assignedAt: employee.createdAt || null,
        returnedAt: employee.dateOfLeaving || null,
      });
    });

  persistedAccessCards.forEach((card) => registerCard(card));

  const accessCards = Array.from(accessCardIndex.values());

  return {
    employees: normalizedEmployees,
    inventory: dedupedInventory,
    accessCards,
    itAssets: dedupedInventory.filter((item) => item.category !== 'Access Card'),
  };
}

export async function exportExcel(data, res) {
  const synced = syncInventory(data);
  await writeData(synced);

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

  synced.employees.forEach((employee) => {
    employeesSheet.addRow({
      id: employee.id,
      empCode: employee.empCode || '',
      empName: employee.empName || '',
      accessCard: employee.accessCard || '',
      status: employee.status || 'Active',
      dateOfLeaving: employee.dateOfLeaving || '',
      isArchived: employee.isArchived ? 'Yes' : 'No',
      assetsCount: employee.assets?.length || 0,
    });
  });

  const assetsSheet = workbook.addWorksheet('Assets');
  assetsSheet.columns = [
    { header: 'Asset ID', key: 'id', width: 24 },
    { header: 'Item Type', key: 'itemType', width: 20 },
    { header: 'Serial Number', key: 'serialNumber', width: 24 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Employee ID', key: 'employeeId', width: 24 },
    { header: 'Employee Code', key: 'employeeCode', width: 16 },
    { header: 'Employee Name', key: 'employeeName', width: 24 },
    { header: 'Allocated To', key: 'allocatedTo', width: 24 },
    { header: 'History', key: 'history', width: 60 },
  ];

  (synced.itAssets || []).forEach((asset) => {
    assetsSheet.addRow({
      id: asset.id,
      itemType: asset.itemType || '',
      serialNumber: asset.serialNumber || '',
      category: asset.category || '',
      status: asset.status || 'Unallocated',
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
