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
    status: currentEmployee ? 'Assigned' : 'Unallocated',
    employeeId: currentEmployee?.id || base.employeeId || fallback.employeeId || null,
    employeeCode: currentEmployee?.empCode || base.employeeCode || fallback.employeeCode || null,
    employeeName: currentEmployee?.empName || base.employeeName || fallback.employeeName || null,
    allocatedTo: currentEmployee?.id || base.allocatedTo || fallback.allocatedTo || null,
    history,
  };
}

function syncInventory(data) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const employees = Array.isArray(data.employees) ? data.employees : [];
  const inventory = Array.isArray(data.inventory) ? data.inventory : [];
  const persistedAccessCards = Array.isArray(data.accessCards) ? data.accessCards : [];
  const persistedItAssets = Array.isArray(data.itAssets) ? data.itAssets : [];

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

  const inventorySource = [...persistedItAssets, ...inventory];
  const inventoryByKey = new Map();
  // Index existing inventory preferring a canonical serial (trimmed + lowercased)
  inventorySource.forEach((item) => {
    const canonicalSerial = item && item.serialNumber ? String(item.serialNumber).trim().toLowerCase() : null;
    const key = canonicalSerial ? `serial:${canonicalSerial}` : item.id || null;
    if (key) inventoryByKey.set(key, item);
  });

  // Normalize all items (from employees and persisted inventory) then merge
  // them into a single map keyed by canonical serial (trim + lowercase).
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
    // Merge histories: combine and collapse entries that belong to the same
    // employee into a single record. For each employee keep the earliest
    // assignedAt and latest returnedAt, and mark status accordingly.
    const combined = [...(existing.history || []), ...(item.history || [])];
    const grouped = new Map();
    combined.forEach((h) => {
      const empKey = h.employeeId || `${h.employeeCode || ''}:${h.employeeName || ''}`;
      if (!grouped.has(empKey)) {
        // track presence of any open (not returned) entry
        grouped.set(empKey, { ...h, _hasOpen: !h.returnedAt });
        return;
      }
      const cur = grouped.get(empKey);
      // assignedAt: pick earliest non-null
      if (h.assignedAt && (!cur.assignedAt || new Date(h.assignedAt) < new Date(cur.assignedAt))) {
        cur.assignedAt = h.assignedAt;
      }
      // returnedAt: pick latest non-null
      if (h.returnedAt && (!cur.returnedAt || new Date(h.returnedAt) > new Date(cur.returnedAt))) {
        cur.returnedAt = h.returnedAt;
      }
      // if any fragment has no returnedAt, keep it open
      if (!h.returnedAt) cur._hasOpen = true;
      grouped.set(empKey, cur);
    });
    // preserve chronological order by assignedAt
    const uniqueHistory = Array.from(grouped.values()).map((h) => {
      const copy = { ...h };
      // if any fragment was open, ensure returnedAt is cleared and status shows Assigned
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

    // If one of the records is currently assigned, prefer that as the current state
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

app.post('/api/inventory/access-cards', (req, res) => {
  const data = readData();
  const card = {
    id: `access-${crypto.randomUUID()}`,
    cardNumber: req.body.cardNumber,
    employeeId: req.body.employeeId || null,
    employeeCode: req.body.employeeCode || null,
    employeeName: req.body.employeeName || null,
    status: req.body.status || 'Assigned',
    assignedAt: req.body.assignedAt || null,
    returnedAt: req.body.returnedAt || null,
  };

  const nextData = {
    ...data,
    accessCards: [...(data.accessCards || []), card],
  };
  const synced = syncInventory(nextData);
  writeData(synced);
  res.status(201).json(card);
});

app.post('/api/inventory/it-assets', (req, res) => {
  const data = readData();
  const item = {
    id: req.body.id || crypto.randomUUID(),
    itemType: req.body.itemType,
    serialNumber: req.body.serialNumber,
    category: 'IT Asset',
    status: req.body.status || 'Unallocated',
    employeeId: req.body.employeeId || null,
    employeeCode: req.body.employeeCode || null,
    employeeName: req.body.employeeName || null,
    allocatedTo: req.body.employeeId || null,
    history: Array.isArray(req.body.history) ? req.body.history : [],
  };

  const nextData = {
    ...data,
    inventory: [...(data.inventory || []), item],
  };
  const synced = syncInventory(nextData);
  writeData(synced);
  res.status(201).json(item);
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
