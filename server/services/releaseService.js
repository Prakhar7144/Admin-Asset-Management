import { Employee } from '../models/employeeModel.js';
import { InventoryItem } from '../models/inventoryModel.js';
import { AccessCard } from '../models/accessCardModel.js';
import { parseDateSafe } from '../utils/dateUtils.js';

export function getReleaseCandidates(employees = [], referenceDate = new Date()) {
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  return employees.filter((employee) => {
    if (!employee || employee.isArchived || !employee.dateOfLeaving) {
      return false;
    }

    if (employee.status === 'Released') {
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
    if (!employee || employee.status === 'Released' || employee.isArchived) {
      continue;
    }

    const inventoryItems = await InventoryItem.find({ employeeId: employee._id });

    if (employee.status !== 'Pending Release') {
      employee.status = 'Pending Release';
      await employee.save();
    }
    for (const item of inventoryItems) {
      if (item.status === 'Assigned') {
        item.status = 'Pending IT NOC';
        await item.save();
      }
    }

    await AccessCard.updateMany(
      {
        $or: [{ employeeId: employee._id }, { employeeCode: employee.empCode }],
      },
      {
        $set: {
          status: 'Pending IT NOC',
        },
      }
    );
  }

  return releaseCandidates.length;
}
