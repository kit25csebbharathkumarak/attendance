const { spawn, exec } = require('child_process');
const path = require('path');
const { clearAllData } = require('../config/dataStore');
const Student = require('../models/Student');
const AttendanceLog = require('../models/AttendanceLog');

let workerProcess = null;
let workerLogs = [];

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
    if (workerProcess) {
      return res.status(200).json({
        success: true,
        message: 'Worker is already running.',
        pid: workerProcess.pid,
      });
    }

    const scriptPath = path.resolve(__dirname, '../../../ml-engine/ml_worker.py');
    const cwd = path.resolve(__dirname, '../../../ml-engine');

    console.log(`[Worker Manager] Spawning Python worker: ${scriptPath}`);
    workerLogs = [`[System] Starting Python ML Worker at ${new Date().toLocaleTimeString()}...`];

    // Spawn python process
    workerProcess = spawn('python', [scriptPath], {
      cwd,
      env: { ...process.env, SHOW_DISPLAY_WINDOW: 'true', PYTHONUNBUFFERED: '1' },
      shell: true,
    });

    const pid = workerProcess.pid;
    console.log(`[Worker Manager] Worker started with PID: ${pid}`);

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
        io.emit('worker_status', { running: false, pid: null });
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('worker_status', { running: true, pid });
    }

    return res.status(200).json({
      success: true,
      message: 'ML Camera Worker started successfully.',
      pid,
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
      io.emit('worker_status', { running: false, pid: null });
    }

    return res.status(200).json({
      success: true,
      message: 'ML Worker stopped successfully.',
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
    logs: workerLogs.slice(-10),
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
  resetSystemData,
};
