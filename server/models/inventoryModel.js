import mongoose from 'mongoose';

const inventoryItemSchema = new mongoose.Schema({
  itemType: {
    type: String,
    required: true,
    trim: true,
  },
  serialNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  category: {
    type: String,
    enum: ['IT Asset', 'Access Card', 'Others', 'Laptop', 'Headphone', 'Monitor', 'Docking Station', 'Mouse', 'Speaker', 'Key Board'],
    default: 'IT Asset',
  },
  make: {
    type: String,
    default: null,
    trim: true,
  },
  model: {
    type: String,
    default: null,
    trim: true,
  },
  description: {
    type: String,
    default: null,
    trim: true,
  },
  status: {
    type: String,
    enum: ['Assigned', 'Pending IT NOC', 'Unallocated', 'Returned', 'Damaged', 'Missing'],
    default: 'Unallocated',
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    default: null,
  },
  employeeCode: {
    type: String,
    default: null,
    trim: true,
  },
  employeeName: {
    type: String,
    default: null,
    trim: true,
  },
  allocatedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    default: null,
  },
  history: [{
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    employeeCode: { type: String, default: '' },
    employeeName: { type: String, default: '' },
    assignedAt: { type: Date, default: Date.now },
    returnedAt: { type: Date, default: null },
    status: { type: String, enum: ['Assigned', 'Returned', 'Damaged', 'Missing'], default: 'Assigned' },
  }],
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
  },
  toObject: {
    virtuals: true,
  },
});

export const InventoryItem = mongoose.model('InventoryItem', inventoryItemSchema);
