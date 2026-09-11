const { spawn, exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { clearAttendanceData, isMongoConnected } = require('../config/dataStore');
const { clearRecentMatchCache } = require('./attendanceController');
const Student = require('../models/Student');
const AttendanceLog = require('../models/AttendanceLog');

let workerProcess = null;
let workerLogs = [];
let activeCameraSource = '0';

const pushLog = (line) => {
  if (!line) return;
  workerLogs.push(line);
  if (workerLogs.length > 50) {
    workerLogs.shift();
  }
};

const killExistingWorker = () => {
  if (workerProcess) {
    const pid = workerProcess.pid;
    if (process.platform === 'win32') {
      try { execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' }); } catch (e) {}
    } else {
      try { workerProcess.kill('SIGKILL'); } catch (e) {}
    }
    workerProcess = null;
  }

  // Also check ml_worker.lock PID if file exists
  try {
    const lockPath = path.resolve(__dirname, '../../../ml-engine/ml_worker.lock');
    if (fs.existsSync(lockPath)) {
      const pid = parseInt(fs.readFileSync(lockPath, 'utf8').trim(), 10);
      if (pid && !isNaN(pid)) {
        if (process.platform === 'win32') {
          try { execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' }); } catch (e) {}
        } else {
          try { process.kill(pid, 'SIGKILL'); } catch (e) {}
        }
      }
      try { fs.unlinkSync(lockPath); } catch (e) {}
    }
  } catch (e) {}

  // Allow Windows DirectShow driver 150ms to release hardware handle
  if (process.platform === 'win32') {
    const start = Date.now();
    while (Date.now() - start < 150) {}
  }
};

/**
 * @route   POST /api/worker/start
 * @desc    Start the python ml_worker.py process from the dashboard
 */
const startWorker = (req, res) => {
  try {
    const requestedCamera = (req.body && req.body.cameraSource !== undefined && String(req.body.cameraSource).trim() !== '')
      ? String(req.body.cameraSource).trim()
      : (activeCameraSource || '0');

    if (workerProcess && requestedCamera === activeCameraSource) {
      return res.status(200).json({
        success: true,
        message: `Worker is already running on Camera ${activeCameraSource}.`,
        pid: workerProcess.pid,
        cameraSource: activeCameraSource,
      });
    }

    // Always clean up any previously running instance before starting
    killExistingWorker();

    activeCameraSource = requestedCamera;
    const cwd = path.resolve(__dirname, '../../../ml-engine');

    console.log(`[Worker Manager] Spawning Python worker in: ${cwd} (Camera: ${activeCameraSource})`);
    workerLogs = [`[System] Starting Python ML Worker on camera [${activeCameraSource}] at ${new Date().toLocaleTimeString()}...`];

    // Use 'py -3.11' on Windows to force Python 3.11 (tensorflow/torch/deepface require 3.11 or lower).
    // Python 3.14 (the system default) does NOT support these ML libraries.
    // If py launcher is not available, falls back to 'python3.11' or 'python'.
    const pythonCmd = process.platform === 'win32' ? 'py' : 'python3.11';
    const pythonArgs = process.platform === 'win32' ? ['-3.11', 'ml_worker.py'] : ['ml_worker.py'];

    workerProcess = spawn(pythonCmd, pythonArgs, {
      cwd,
      env: {
        ...process.env,
        CAMERA_SOURCE: activeCameraSource,
        SHOW_DISPLAY_WINDOW: 'false',
        PYTHONUNBUFFERED: '1',
      },
      shell: true,
    });

    const pid = workerProcess.pid;
    console.log(`[Worker Manager] Worker started with PID: ${pid} (Camera: ${activeCameraSource})`);

    workerProcess.stdout.on('data', (data) => {
      const str = data.toString().trim();
      console.log(`[ML Worker] ${str}`);
      pushLog(str);
    });

    workerProcess.stderr.on('data', (data) => {
      const str = data.toString().trim();
      console.warn(`[ML Worker] ${str}`);
      pushLog(str);
    });

    workerProcess.on('close', (code) => {
      console.log(`[Worker Manager] Worker process exited with code: ${code}`);
      pushLog(`[System] Worker process stopped (exit code: ${code})`);
      workerProcess = null;

      const io = req.app.get('io');
      if (io) {
        io.emit('worker_status', { running: false, pid: null, cameraSource: activeCameraSource });
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('worker_status', { running: true, pid, cameraSource: activeCameraSource });
    }

    return res.status(200).json({
      success: true,
      message: `ML Camera Worker started successfully on Camera ${activeCameraSource}.`,
      pid,
      cameraSource: activeCameraSource,
    });
  } catch (error) {
    console.error('[Worker Manager Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to start ML Worker.',
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/worker/stop
 * @desc    Stop the running python ml_worker.py process
 */
const stopWorker = (req, res) => {
  try {
    killExistingWorker();

    const io = req.app.get('io');
    if (io) {
      io.emit('worker_status', { running: false, pid: null, cameraSource: activeCameraSource });
    }

    return res.status(200).json({
      success: true,
      message: 'ML Worker stopped successfully.',
      cameraSource: activeCameraSource,
    });
  } catch (error) {
    console.error('[Stop Worker Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to stop worker.',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/worker/status
 * @desc    Get current status of ML worker
 */
const getWorkerStatus = (req, res) => {
  return res.status(200).json({
    success: true,
    running: Boolean(workerProcess),
    pid: workerProcess ? workerProcess.pid : null,
    cameraSource: activeCameraSource,
    logs: workerLogs.slice(-10),
  });
};

/**
 * @route   GET /api/worker/cameras
 * @desc    Get detected and available camera sources
 */
const getAvailableCameras = (req, res) => {
  return res.status(200).json({
    success: true,
    activeCamera: activeCameraSource,
    cameras: [
      { id: '0', label: 'Camera 0 (Default Laptop Webcam)' },
      { id: '1', label: 'Camera 1 (Phone Link / Virtual Camera)' },
      { id: '2', label: 'Camera 2 (Phone Link / Secondary Device)' },
      { id: '3', label: 'Camera 3 (External Camera)' },
    ],
  });
};

/**
 * @route   POST /api/system/reset
 * @desc    Clear all demo data (students & attendance logs) for fresh real enrollments
 */
const resetSystemData = async (req, res) => {
  try {
    console.log('[System Reset] Clearing attendance records...');
    clearAttendanceData();
    clearRecentMatchCache();

    if (isMongoConnected()) {
      try {
        await AttendanceLog.deleteMany({});
      } catch (e) {
        console.warn('[System Reset] MongoDB deleteMany error:', e.message);
      }
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('data_reset', { timestamp: Date.now() });
    }

    return res.status(200).json({
      success: true,
      message: 'Today\'s attendance logs cleared successfully.',
    });
  } catch (error) {
    console.error('[Reset Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset system data.',
      error: error.message,
    });
  }
};

module.exports = {
  startWorker,
  stopWorker,
  getWorkerStatus,
  getAvailableCameras,
  resetSystemData,
};
