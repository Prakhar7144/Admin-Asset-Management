import mongoose from 'mongoose';
import { connectToDatabase } from '../config/db.js';
import { Employee } from '../models/employeeModel.js';
import { InventoryItem } from '../models/inventoryModel.js';
import { AccessCard } from '../models/accessCardModel.js';

async function clearDb() {
  await connectToDatabase();

  const empResult = await Employee.deleteMany({});
  const itemResult = await InventoryItem.deleteMany({});
  const cardResult = await AccessCard.deleteMany({});

  console.log('Deleted employees:', empResult.deletedCount);
  console.log('Deleted inventory items:', itemResult.deletedCount);
  console.log('Deleted access cards:', cardResult.deletedCount);

  await mongoose.disconnect();
}

clearDb().catch((error) => {
  console.error('Failed to clear database:', error.message || error);
  process.exit(1);
});
