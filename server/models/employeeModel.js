import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema({
  appId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  empCode: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  empName: {
    type: String,
    required: true,
    trim: true,
  },
  accessCard: {
    type: String,
    default: '',
    trim: true,
  },
  dateOfLeaving: {
    type: String,
    default: '',
  },
  isArchived: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['Active', 'Released', 'Archived'],
    default: 'Active',
  },
  assets: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryItem',
    default: [],
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

employeeSchema.pre('save', function setDefaults(next) {
  if (!this.status) {
    this.status = this.isArchived ? 'Archived' : 'Active';
  }
  next();
});

export const Employee = mongoose.model('Employee', employeeSchema);
