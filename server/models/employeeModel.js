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
    enum: ['Active', 'Pending Release', 'Released', 'Archived'],
    default: 'Active',
  },
  assets: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryItem',
    default: [],
  }],
  releaseSnapshot: {
    assetIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryItem',
    }],
    accessCard: {
      type: String,
      default: '',
      trim: true,
    },
    releasedAt: {
      type: Date,
      default: null,
    },
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

employeeSchema.pre('save', function setDefaults(next) {
  if (!this.status) {
    this.status = this.isArchived ? 'Archived' : 'Active';
  }

  if (this.isArchived) {
    this.status = 'Archived';
  } else if (!this.dateOfLeaving || !String(this.dateOfLeaving).trim()) {
    this.status = 'Active';
  } else {
    const leavingDateValue = new Date(this.dateOfLeaving);
    if (!Number.isNaN(leavingDateValue.getTime())) {
      const today = new Date();
      const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const leavingMidnight = new Date(leavingDateValue.getFullYear(), leavingDateValue.getMonth(), leavingDateValue.getDate());
      // Do not turn an employee into Released merely because time has passed.
      // That transition is completed only by the IT NOC workflow.
      if (this.status !== 'Released') {
        this.status = leavingMidnight > todayMidnight ? 'Active' : 'Pending Release';
      }
    }
  }
  next();
});

export const Employee = mongoose.model('Employee', employeeSchema);
