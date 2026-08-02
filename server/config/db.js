import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { markDatabaseReady } from '../models/appState.js';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/employee-asset-management';

export async function connectToDatabase() {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    markDatabaseReady();
    console.log('MongoDB connected');
  } catch (error) {
    console.warn('MongoDB connection unavailable, using in-memory state:', error.message);
  }
}

export { mongoUri };
