import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = process.env.PORT || 5000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataFile = path.join(__dirname, 'data', 'store.json');

app.use(cors());
app.use(express.json());

function readData() {
  if (!fs.existsSync(dataFile)) {
    return { employees: [], inventory: [] };
  }
  const data = fs.readFileSync(dataFile, 'utf8');
  return JSON.parse(data);
}

function writeData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
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
      if (lastEntry && !lastEntry.returnedAt && lastEntry.employeeId !== currentEmployee.id) {
        history[history.length - 1] = {
          ...lastEntry,
          returnedAt: employee?.dateOfLeaving || now,
          status: 'Returned',
        };
      }
      history.push(createHistoryEntry(currentEmployee, now));
    }
  } else if (lastEntry && !lastEntry.returnedAt) {
    history[history.length - 1] = {
      ...lastEntry,
      returnedAt: employee?.dateOfLeaving || now,
      status: 'Returned',
    };
  }

  return {
    ...base,
    id: base.id || crypto.randomUUID(),
    itemType: base.itemType || fallback.itemType || 'Laptop',
    serialNumber: base.serialNumber || fallback.serialNumber || '',
    category: base.category || fallback.category || 'IT Asset',
    status: currentEmployee ? 'Assigned' : 'Unallocated',
    employeeId: currentEmployee?.id || null,
    employeeCode: currentEmployee?.empCode || null,
    employeeName: currentEmployee?.empName || null,
    allocatedTo: currentEmployee?.id || null,
    history,
  };
}

function syncInventory(data) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const employees = Array.isArray(data.employees) ? data.employees : [];
  const inventory = Array.isArray(data.inventory) ? data.inventory : [];

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
        status: status === 'Released' || status === 'Archived' ? 'Unallocated' : 'Assigned',
      })),
    };
  });

  const inventoryByKey = new Map();
  inventory.forEach((item) => {
    const key = item.id || `serial:${item.serialNumber}`;
    if (key) inventoryByKey.set(key, item);
  });

  const seen = new Set();
  const mergedInventory = [];

  normalizedEmployees.forEach((employee) => {
    employee.assets.forEach((asset) => {
      const key = asset.id || `serial:${asset.serialNumber}`;
      const existing = inventoryByKey.get(key) || inventoryByKey.get(`serial:${asset.serialNumber}`) || {};
      const normalized = normalizeAsset(asset, employee, existing);
      mergedInventory.push(normalized);
      seen.add(key);
    });
  });

  inventory.forEach((item) => {
    const key = item.id || `serial:${item.serialNumber}`;
    if (seen.has(key)) return;
    const normalized = normalizeAsset(item, null, item);
    mergedInventory.push(normalized);
    seen.add(key);
  });

  const uniqueInventory = [];
  const inventoryIds = new Set();
  mergedInventory.forEach((item) => {
    const key = item.id || `serial:${item.serialNumber}`;
    if (inventoryIds.has(key)) return;
    inventoryIds.add(key);
    uniqueInventory.push(item);
  });

  const accessCards = normalizedEmployees
    .filter((employee) => Boolean(employee.accessCard))
    .map((employee) => ({
      id: `access-${employee.id}`,
      cardNumber: employee.accessCard,
      employeeId: employee.id,
      employeeCode: employee.empCode,
      employeeName: employee.empName,
      status: employee.status === 'Released' || employee.status === 'Archived' ? 'Returned' : 'Assigned',
      assignedAt: employee.createdAt || null,
      returnedAt: employee.dateOfLeaving || null,
    }));

  return {
    employees: normalizedEmployees,
    inventory: uniqueInventory,
    accessCards,
    itAssets: uniqueInventory.filter((item) => item.category !== 'Access Card'),
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/employees', (_req, res) => {
  const data = readData();
  const synced = syncInventory(data);
  writeData(synced);
  res.json(synced.employees);
});

app.get('/api/inventory', (_req, res) => {
  const data = readData();
  const synced = syncInventory(data);
  writeData(synced);
  res.json({ accessCards: synced.accessCards, itAssets: synced.itAssets });
});

app.post('/api/employees', (req, res) => {
  const data = readData();
  const employee = {
    id: crypto.randomUUID(),
    empCode: req.body.empCode,
    empName: req.body.empName,
    accessCard: req.body.accessCard,
    dateOfLeaving: req.body.dateOfLeaving || '',
    isArchived: false,
    assets: (req.body.assets || []).map((asset) => ({
      id: crypto.randomUUID(),
      itemType: asset.itemType,
      serialNumber: asset.serialNumber,
      status: 'Assigned',
    })),
  };

  const synced = syncInventory({ ...data, employees: [...data.employees, employee] });
  writeData(synced);
  res.status(201).json(employee);
});

app.put('/api/employees/:id', (req, res) => {
  const data = readData();
  const employeeIndex = data.employees.findIndex((employee) => employee.id === req.params.id);
  if (employeeIndex === -1) {
    return res.status(404).json({ message: 'Employee not found' });
  }

  const updatedEmployee = {
    ...data.employees[employeeIndex],
    empCode: req.body.empCode,
    empName: req.body.empName,
    accessCard: req.body.accessCard,
    dateOfLeaving: req.body.dateOfLeaving || '',
    isArchived: Boolean(data.employees[employeeIndex].isArchived),
    assets: (req.body.assets || data.employees[employeeIndex].assets || []).map((asset) => ({
      ...asset,
      id: asset.id || crypto.randomUUID(),
      status: 'Assigned',
    })),
  };

  const employees = [...data.employees];
  employees[employeeIndex] = updatedEmployee;
  const synced = syncInventory({ ...data, employees });
  writeData(synced);
  res.json(updatedEmployee);
});

app.delete('/api/employees/:id', (req, res) => {
  const data = readData();
  const employeeIndex = data.employees.findIndex((employee) => employee.id === req.params.id);
  if (employeeIndex === -1) {
    return res.status(404).json({ message: 'Employee not found' });
  }

  const employees = [...data.employees];
  employees[employeeIndex] = {
    ...employees[employeeIndex],
    isArchived: true,
    dateOfLeaving: employees[employeeIndex].dateOfLeaving || new Date().toISOString().slice(0, 10),
  };

  const synced = syncInventory({ ...data, employees });
  writeData(synced);
  res.json({ success: true, archived: true });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
