const express = require('express');
const router = express.Router();

const {
  enrollStudent,
  getStudents,
  getStudentEmbeddings,
} = require('../controllers/enrollmentController');

const {
  getTodayAttendance,
  recordMatchWebhook,
  getTodayStats,
} = require('../controllers/attendanceController');

// Enrollment Routes
router.post('/enroll', enrollStudent);
router.get('/students', getStudents);
router.get('/students/embeddings', getStudentEmbeddings);

// Attendance Routes
router.get('/attendance/today', getTodayAttendance);
router.get('/attendance/stats', getTodayStats);

// Python ML Worker Ingestion Webhook
router.post('/webhook/match', recordMatchWebhook);

module.exports = router;
