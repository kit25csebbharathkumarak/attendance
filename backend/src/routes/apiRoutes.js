const express = require('express');
const router = express.Router();

const {
  enrollStudent,
  getStudents,
  getStudentEmbeddings,
  deleteStudent,
  clearAllStudents,
} = require('../controllers/enrollmentController');

const {
  getTodayAttendance,
  recordMatchWebhook,
  getTodayStats,
  broadcastCameraFrame,
} = require('../controllers/attendanceController');

const {
  startWorker,
  stopWorker,
  getWorkerStatus,
  getAvailableCameras,
  resetSystemData,
} = require('../controllers/workerController');

// Enrollment Routes
router.post('/enroll', enrollStudent);
router.get('/students', getStudents);
router.get('/students/embeddings', getStudentEmbeddings);
router.delete('/students/:studentId', deleteStudent);
router.delete('/students', clearAllStudents);

// Attendance Routes
router.get('/attendance/today', getTodayAttendance);
router.get('/attendance/stats', getTodayStats);

// Python ML Worker Ingestion Webhooks
router.post('/webhook/match', recordMatchWebhook);
router.post('/webhook/frame', broadcastCameraFrame);

// ML Worker Process Control & System Reset
router.post('/worker/start', startWorker);
router.post('/worker/stop', stopWorker);
router.get('/worker/status', getWorkerStatus);
router.get('/worker/cameras', getAvailableCameras);
router.post('/system/reset', resetSystemData);

module.exports = router;
