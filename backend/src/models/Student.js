const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema(
  {
    studentId: {
      type: String,
      required: [true, 'Student ID is required'],
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Student name is required'],
      trim: true,
    },
    department: {
      type: String,
      trim: true,
      default: 'Computer Science',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    // Array of numbers (e.g. 512-d FaceNet / DeepFace embedding vector)
    // Can also store multiple pose arrays (e.g. [[...], [...]])
    faceEmbeddings: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      default: [],
    },
    avatarUrl: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Student', StudentSchema);
