import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectToDatabase } from './config/db.js';
import assetRoutes from './routes/assetRoutes.js';
import './models/employeeModel.js';
import './models/inventoryModel.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/api', assetRoutes);

export { app };

if (process.env.NODE_ENV !== 'test') {
  await connectToDatabase();
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}
