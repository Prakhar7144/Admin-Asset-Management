import mongoose from 'mongoose';

const accessCardSchema = new mongoose.Schema({
  cardNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
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
  status: {
    type: String,
    enum: ['Assigned', 'Returned', 'Unassigned'],
    default: 'Unassigned',
  },
  assignedAt: {
    type: Date,
    default: null,
  },
  returnedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
  },
  toObject: {
    virtuals: true,
  },
});

export const AccessCard = mongoose.model('AccessCard', accessCardSchema);
