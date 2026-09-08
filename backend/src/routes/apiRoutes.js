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
  broadcastCameraFrame,
} = require('../controllers/attendanceController');

// Enrollment Routes
router.post('/enroll', enrollStudent);
router.get('/students', getStudents);
router.get('/students/embeddings', getStudentEmbeddings);

// Attendance Routes
router.get('/attendance/today', getTodayAttendance);
router.get('/attendance/stats', getTodayStats);

// Python ML Worker Ingestion Webhooks
router.post('/webhook/match', recordMatchWebhook);
router.post('/webhook/frame', broadcastCameraFrame);

module.exports = router;

