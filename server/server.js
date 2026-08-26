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

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ success: false, message: err.message || 'Request failed.' });
});

export { app };

if (process.env.NODE_ENV !== 'test') {
  await connectToDatabase();
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}
