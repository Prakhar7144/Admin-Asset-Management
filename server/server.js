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

function syncInventory(data) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const employees = Array.isArray(data.employees) ? data.employees : [];
  const inventory = Array.isArray(data.inventory) ? data.inventory : [];
  const currentEmployeeIds = new Set(employees.map((employee) => employee.id));

  const normalizedEmployees = employees.map((employee) => {
    const leavingDate = parseDateInput(employee.dateOfLeaving);
    const hasPassed = Boolean(leavingDate && leavingDate < today);

    return {
      ...employee,
      assets: (employee.assets || []).map((asset) => ({
        ...asset,
        status: hasPassed ? 'Unallocated' : 'Assigned',
      })),
      status: hasPassed ? 'Released' : 'Active',
    };
  });

  const filteredInventory = inventory.filter((item) => !currentEmployeeIds.has(item.employeeId));
  const releasedAssets = [];

  normalizedEmployees.forEach((employee) => {
    if (employee.status !== 'Released') return;
    employee.assets.forEach((asset) => {
      releasedAssets.push({
        ...asset,
        id: asset.id || crypto.randomUUID(),
        employeeId: employee.id,
        employeeCode: employee.empCode,
        employeeName: employee.empName,
        status: 'Unallocated',
      });
    });
  });

  return {
    employees: normalizedEmployees,
    inventory: [...filteredInventory, ...releasedAssets],
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
  res.json(synced.inventory);
});

app.post('/api/employees', (req, res) => {
  const data = readData();
  const employee = {
    id: crypto.randomUUID(),
    empCode: req.body.empCode,
    empName: req.body.empName,
    accessCard: req.body.accessCard,
    dateOfLeaving: req.body.dateOfLeaving || '',
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

app.delete('/api/employees/:id', (_req, res) => {
  const data = readData();
  const remainingEmployees = data.employees.filter((employee) => employee.id !== _req.params.id);
  const synced = syncInventory({ ...data, employees: remainingEmployees });
  writeData(synced);
  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
