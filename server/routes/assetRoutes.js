import express from 'express';
import multer from 'multer';
import {
  healthHandler,
  exportExcelHandler,
  importExcelHandler,
  listEmployeesHandler,
  listInventoryHandler,
  createEmployeeHandler,
  updateEmployeeHandler,
  reactivateEmployeeHandler,
  deleteEmployeeHandler,
  createAccessCardHandler,
  deleteAccessCardHandler,
  createItAssetHandler,
  markItAssetRepairedHandler,
  deleteItAssetHandler,
  listItNocHandler,
  completeItNocHandler,
} from '../controllers/assetController.js';

const router = express.Router();

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isExcel = /\.xlsx$/i.test(file.originalname);
    if (!isExcel) {
      return cb(new Error('Only .xlsx files are supported.'));
    }
    cb(null, true);
  },
});

router.get('/health', healthHandler);
router.get('/export/excel', exportExcelHandler);
router.post('/import/excel', upload.single('file'), importExcelHandler);
router.get('/employees', listEmployeesHandler);
router.get('/inventory', listInventoryHandler);
router.get('/it-noc', listItNocHandler);
router.post('/it-noc/:employeeId/complete', completeItNocHandler);
router.post('/employees', createEmployeeHandler);
router.put('/employees/:id', updateEmployeeHandler);
router.post('/employees/:id/reactivate', reactivateEmployeeHandler);
router.delete('/employees/:id', deleteEmployeeHandler);
router.post('/inventory/access-cards', createAccessCardHandler);
router.delete('/inventory/access-cards/:id', deleteAccessCardHandler);
router.post('/inventory/it-assets', createItAssetHandler);
router.patch('/inventory/it-assets/:id/repair', markItAssetRepairedHandler);
router.delete('/inventory/it-assets/:id', deleteItAssetHandler);

export default router;
