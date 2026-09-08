const { spawn, exec } = require('child_process');
const path = require('path');
const { clearAllData } = require('../config/dataStore');
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

/**
 * @route   POST /api/worker/start
 * @desc    Start the python ml_worker.py process from the dashboard
 */
const startWorker = (req, res) => {
  try {
    const requestedCamera = (req.body && req.body.cameraSource !== undefined && String(req.body.cameraSource).trim() !== '')
      ? String(req.body.cameraSource).trim()
      : (activeCameraSource || '0');

    if (workerProcess) {
      // If the camera source is unchanged, worker is already running on it
      if (requestedCamera === activeCameraSource) {
        return res.status(200).json({
          success: true,
          message: `Worker is already running on Camera ${activeCameraSource}.`,
          pid: workerProcess.pid,
          cameraSource: activeCameraSource,
        });
      }

      // Camera source changed while running - terminate old process first to switch
      console.log(`[Worker Manager] Camera switch requested: ${activeCameraSource} -> ${requestedCamera}`);
      const oldPid = workerProcess.pid;
      if (process.platform === 'win32') {
        exec(`taskkill /pid ${oldPid} /T /F`);
      } else {
        workerProcess.kill('SIGTERM');
      }
      workerProcess = null;
    }

    activeCameraSource = requestedCamera;
    const cwd = path.resolve(__dirname, '../../../ml-engine');

    console.log(`[Worker Manager] Spawning Python worker in: ${cwd} (Camera: ${activeCameraSource})`);
    workerLogs = [`[System] Starting Python ML Worker on camera [${activeCameraSource}] at ${new Date().toLocaleTimeString()}...`];

    // Spawn python process inside ml-engine working directory with specified CAMERA_SOURCE
    workerProcess = spawn('python', ['ml_worker.py'], {
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
    if (!workerProcess) {
      return res.status(200).json({
        success: true,
        message: 'Worker is not currently running.',
        cameraSource: activeCameraSource,
      });
    }

    const pid = workerProcess.pid;
    console.log(`[Worker Manager] Stopping worker PID: ${pid}`);

    // On Windows, use taskkill to terminate tree
    if (process.platform === 'win32') {
      exec(`taskkill /pid ${pid} /T /F`, (err) => {
        if (err) {
          console.warn(`[Worker Manager] Taskkill warning: ${err.message}`);
        }
      });
    } else {
      workerProcess.kill('SIGTERM');
    }

    workerProcess = null;

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
    console.log('[System Reset] Clearing all demo students and attendance records...');
    clearAllData();

    try {
      await Student.deleteMany({});
      await AttendanceLog.deleteMany({});
    } catch (e) {
      // MongoDB might not be running
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('data_reset', { timestamp: Date.now() });
    }

    return res.status(200).json({
      success: true,
      message: 'All demo students and attendance logs cleared! Ready for fresh real enrollment.',
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
