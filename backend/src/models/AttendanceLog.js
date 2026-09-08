const mongoose = require('mongoose');

const AttendanceLogSchema = new mongoose.Schema(
  {
    studentId: {
      type: String,
      required: [true, 'Student ID is required'],
      index: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    matchType: {
      type: String,
      enum: {
        values: ['Face', 'Body', 'Multimodal'],
        message: '{VALUE} is not a valid matchType',
      },
      required: [true, 'matchType is required'],
      default: 'Multimodal',
    },
    confidence: {
      type: Number,
      required: [true, 'Confidence score is required'],
      min: 0,
      max: 1,
    },
    // Enriched metadata for fast lookups
    studentName: {
      type: String,
      default: 'Unknown Student',
    },
    doorLocation: {
      type: String,
      default: 'Classroom Entrance Main Door',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying a student's logs for today efficiently
AttendanceLogSchema.index({ studentId: 1, timestamp: -1 });

module.exports = mongoose.model('AttendanceLog', AttendanceLogSchema);
