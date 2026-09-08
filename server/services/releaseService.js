import { Employee } from '../models/employeeModel.js';
import { InventoryItem } from '../models/inventoryModel.js';
import { AccessCard } from '../models/accessCardModel.js';
import { getEmployeeStatus, parseDateSafe } from '../utils/dateUtils.js';

export function getReleaseCandidates(employees = [], referenceDate = new Date()) {
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  return employees.filter((employee) => {
    if (!employee || employee.isArchived || !employee.dateOfLeaving) {
      return false;
    }

    const status = getEmployeeStatus(employee.dateOfLeaving, Boolean(employee.isArchived));
    if (status !== 'Released') {
      return false;
    }

    const releaseDate = parseDateSafe(employee.dateOfLeaving, today);
    return new Date(releaseDate.getFullYear(), releaseDate.getMonth(), releaseDate.getDate()) <= today;
  });
}

export async function processScheduledReleases() {
  const employees = await Employee.find({ isArchived: false }).lean();
  const releaseCandidates = getReleaseCandidates(employees);

  for (const candidate of releaseCandidates) {
    const employee = await Employee.findById(candidate._id);
    if (!employee || employee.status === 'Released') {
      continue;
    }

    const releaseDate = parseDateSafe(employee.dateOfLeaving, new Date());

    const inventoryItems = await InventoryItem.find({ employeeId: employee._id });
    const snapshotAssetIds = inventoryItems.map((item) => item._id);
    const snapshotAccessCard = employee.accessCard || '';

    employee.status = 'Released';
    employee.accessCard = '';
    employee.releaseSnapshot = {
      assetIds: snapshotAssetIds,
      accessCard: snapshotAccessCard,
      releasedAt: releaseDate,
    };
    await employee.save();

    for (const item of inventoryItems) {
      item.status = 'Unallocated';
      item.employeeId = null;
      item.employeeCode = null;
      item.employeeName = null;
      item.allocatedTo = null;
      item.history = Array.isArray(item.history) ? item.history : [];
      item.history.push({
        employeeId: employee._id,
        employeeCode: employee.empCode || '',
        employeeName: employee.empName || '',
        assignedAt: releaseDate,
        returnedAt: releaseDate,
        status: 'Returned',
      });
      await item.save();
    }

    await AccessCard.updateMany(
      {
        $or: [{ employeeId: employee._id }, { employeeCode: employee.empCode }],
      },
      {
        $set: {
          employeeId: null,
          employeeCode: null,
          employeeName: null,
          status: 'Unassigned',
          returnedAt: releaseDate,
        },
      }
    );
  }

  return releaseCandidates.length;
}
