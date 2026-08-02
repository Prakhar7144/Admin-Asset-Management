import express from 'express';
import {
  healthHandler,
  exportExcelHandler,
  listEmployeesHandler,
  listInventoryHandler,
  createEmployeeHandler,
  updateEmployeeHandler,
  deleteEmployeeHandler,
  createAccessCardHandler,
  deleteAccessCardHandler,
  createItAssetHandler,
  deleteItAssetHandler,
} from '../controllers/assetController.js';

const router = express.Router();

router.get('/health', healthHandler);
router.get('/export/excel', exportExcelHandler);
router.get('/employees', listEmployeesHandler);
router.get('/inventory', listInventoryHandler);
router.post('/employees', createEmployeeHandler);
router.put('/employees/:id', updateEmployeeHandler);
router.delete('/employees/:id', deleteEmployeeHandler);
router.post('/inventory/access-cards', createAccessCardHandler);
router.delete('/inventory/access-cards/:id', deleteAccessCardHandler);
router.post('/inventory/it-assets', createItAssetHandler);
router.delete('/inventory/it-assets/:id', deleteItAssetHandler);

export default router;
