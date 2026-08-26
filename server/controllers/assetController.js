import fs from 'fs';
import {
  listEmployees,
  listInventory,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  createAccessCard,
  deleteAccessCard,
  createItAsset,
  deleteItAsset,
  exportExcel,
} from '../services/assetService.js';
import { importExcel } from '../scripts/importFromExcel.js';

export async function healthHandler(_req, res) {
  res.json({ status: 'ok' });
}

export async function exportExcelHandler(_req, res) {
  await exportExcel(res);
}

export async function importExcelHandler(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded. Attach an .xlsx file.' });
  }

  try {
    const summary = await importExcel(req.file.path);
    res.json({ success: true, ...summary });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Import failed.' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
}

export async function listEmployeesHandler(_req, res) {
  const employees = await listEmployees();
  res.json(employees);
}

export async function listInventoryHandler(_req, res) {
  const inventory = await listInventory();
  res.json(inventory);
}

export async function createEmployeeHandler(req, res) {
  const employee = await createEmployee(req.body);
  res.status(201).json(employee);
}

export async function updateEmployeeHandler(req, res) {
  const updatedEmployee = await updateEmployee(req.params.id, req.body);
  if (!updatedEmployee) {
    return res.status(404).json({ message: 'Employee not found' });
  }

  res.json(updatedEmployee);
}

export async function deleteEmployeeHandler(req, res) {
  const deleted = await deleteEmployee(req.params.id);
  if (!deleted) {
    return res.status(404).json({ message: 'Employee not found' });
  }

  res.json({ success: true, deleted: true });
}

export async function createAccessCardHandler(req, res) {
  const card = await createAccessCard(req.body);
  res.status(201).json(card);
}

export async function deleteAccessCardHandler(req, res) {
  const deleted = await deleteAccessCard(req.params.id);
  if (!deleted) {
    return res.status(404).json({ message: 'Access card not found' });
  }

  res.json({ success: true, deleted: true });
}

export async function createItAssetHandler(req, res) {
  const item = await createItAsset(req.body);
  res.status(201).json(item);
}

export async function deleteItAssetHandler(req, res) {
  const deleted = await deleteItAsset(req.params.id);
  if (!deleted) {
    return res.status(404).json({ message: 'Asset not found' });
  }

  res.json({ success: true, deleted: true });
}
