const AttendanceLog = require('../models/AttendanceLog');
const Student = require('../models/Student');
const { isMongoConnected, memoryStudents, memoryAttendanceLogs, saveAttendanceToFile } = require('../config/dataStore');

// In-memory debounce cache to prevent duplicate queries under high frame rate
// Map: studentId -> lastTimestamp (ms)
const recentMatchCache = new Map();

/**
 * Clean up cache periodically (every 10 minutes)
 */
setInterval(() => {
  const now = Date.now();
  const maxAge = (parseInt(process.env.COOLDOWN_MINUTES, 10) || 30) * 60 * 1000;
  for (const [studentId, timestamp] of recentMatchCache.entries()) {
    if (now - timestamp > maxAge) {
      recentMatchCache.delete(studentId);
    }
  }
}, 10 * 60 * 1000);

/**
 * @route   GET /api/attendance/today
 * @desc    Fetch today's attendance logs (from 00:00:00 to 23:59:59)
 */
const getTodayAttendance = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;

    if (isMongoConnected()) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const query = {
        timestamp: { $gte: startOfDay, $lte: endOfDay },
      };

      if (req.query.matchType) {
        query.matchType = req.query.matchType;
      }

      const logs = await AttendanceLog.find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      return res.status(200).json({
        success: true,
        count: logs.length,
        data: logs,
      });
    }

    // Fallback: In-memory store
    let filtered = [...memoryAttendanceLogs];
    if (req.query.matchType) {
      filtered = filtered.filter((l) => l.matchType === req.query.matchType);
    }
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.status(200).json({
      success: true,
      count: filtered.slice(0, limit).length,
      data: filtered.slice(0, limit),
    });
  } catch (error) {
    console.error('[Get Attendance Error]', error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch today's attendance.",
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/webhook/match
 * @desc    ML Worker webhook endpoint to record a recognized student at entrance
 */
const recordMatchWebhook = async (req, res) => {
  try {
    const { studentId, matchType = 'Multimodal', confidence } = req.body;

    if (!studentId || confidence === undefined) {
      return res.status(400).json({
        success: false,
        message: 'studentId and confidence are required.',
      });
    }

    const validTypes = ['Face', 'Body', 'Multimodal'];
    const sanitizedMatchType = validTypes.includes(matchType) ? matchType : 'Multimodal';
    const parsedConfidence = parseFloat(confidence);

    const cooldownMinutes = parseInt(process.env.COOLDOWN_MINUTES, 10) || 30;
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const now = Date.now();
    const cleanId = studentId.trim();

    // 1. Fast in-memory debounce check
    const lastSeen = recentMatchCache.get(cleanId);
    if (lastSeen && now - lastSeen < cooldownMs) {
      const minutesAgo = Math.round((now - lastSeen) / 60000);
      return res.status(200).json({
        success: true,
        debounced: true,
        message: `Student ${cleanId} was already marked ${minutesAgo}m ago (Cooldown: ${cooldownMinutes}m).`,
      });
    }

    let studentName = `Student ${cleanId}`;
    let department = 'Computer Science';
    let newLogRecord;

    if (isMongoConnected()) {
      // Database verification check for today
      const startOfCooldown = new Date(now - cooldownMs);
      const existingLog = await AttendanceLog.findOne({
        studentId: cleanId,
        timestamp: { $gte: startOfCooldown },
      }).lean();

      if (existingLog) {
        recentMatchCache.set(cleanId, new Date(existingLog.timestamp).getTime());
        return res.status(200).json({
          success: true,
          debounced: true,
          message: `Student ${cleanId} was already marked in recent window.`,
        });
      }

      // Resolve student name from Student collection
      const student = await Student.findOne({ studentId: cleanId }).lean();
      if (student) {
        studentName = student.name;
        department = student.department;
      }

      const created = await AttendanceLog.create({
        studentId: cleanId,
        studentName,
        timestamp: new Date(),
        matchType: sanitizedMatchType,
        confidence: parsedConfidence,
        doorLocation: req.body.doorLocation || 'Classroom Entrance Main Door',
      });

      newLogRecord = {
        _id: created._id,
        studentId: created.studentId,
        studentName: created.studentName,
        department,
        timestamp: created.timestamp,
        matchType: created.matchType,
        confidence: created.confidence,
        doorLocation: created.doorLocation,
        photo: req.body.photo || student?.avatarUrl || null,
      };
    } else {
      // In-Memory store fallback
      const student = memoryStudents.find((s) => s.studentId === cleanId);
      if (student) {
        studentName = student.name;
        department = student.department;
      }

      newLogRecord = {
        _id: 'mem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        studentId: cleanId,
        studentName,
        department,
        timestamp: new Date(),
        matchType: sanitizedMatchType,
        confidence: parsedConfidence,
        doorLocation: req.body.doorLocation || 'Classroom Entrance Main Door',
        photo: req.body.photo || student?.avatarUrl || null,
      };

      memoryAttendanceLogs.unshift(newLogRecord);
      saveAttendanceToFile();

    }

    // Update in-memory cache
    recentMatchCache.set(cleanId, now);

    // Emit Socket.IO event to all connected React clients
    const io = req.app.get('io');
    if (io) {
      io.emit('new_attendance', newLogRecord);
      console.log(`[Socket.IO Broadcast] new_attendance for ${studentName} (${cleanId}) [${sanitizedMatchType}, ${(parsedConfidence * 100).toFixed(1)}%]`);
    }

    return res.status(201).json({
      success: true,
      message: 'Attendance recorded and broadcasted successfully.',
      data: newLogRecord,
    });
  } catch (error) {
    console.error('[Webhook Match Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to record attendance match.',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/attendance/stats
 * @desc    Get summary metrics for today (Total, Multimodal count, Face count, Avg confidence)
 */
const getTodayStats = async (req, res) => {
  try {
    let logs = [];
    if (isMongoConnected()) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      logs = await AttendanceLog.find({
        timestamp: { $gte: startOfDay, $lte: endOfDay },
      }).lean();
    } else {
      logs = memoryAttendanceLogs;
    }

    const total = logs.length;
    let multimodalCount = 0;
    let faceCount = 0;
    let bodyCount = 0;
    let sumConfidence = 0;

    for (const log of logs) {
      sumConfidence += log.confidence || 0;
      if (log.matchType === 'Multimodal') multimodalCount++;
      else if (log.matchType === 'Face') faceCount++;
      else if (log.matchType === 'Body') bodyCount++;
    }

    const avgConfidence = total > 0 ? sumConfidence / total : 0;

    return res.status(200).json({
      success: true,
      data: {
        totalPresent: total,
        multimodalCount,
        faceCount,
        bodyCount,
        avgConfidence: Number(avgConfidence.toFixed(3)),
      },
    });
  } catch (error) {
    console.error('[Get Stats Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance stats.',
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/webhook/frame
 * @desc    Broadcast live camera frame from Python ML worker to React dashboard via Socket.IO
 */
const broadcastCameraFrame = (req, res) => {
  const { frame } = req.body;
  if (!frame) {
    return res.status(400).json({ success: false, message: 'Frame data is required' });
  }

  const io = req.app.get('io');
  if (io) {
    io.emit('live_frame', { frame, timestamp: Date.now() });
  }

  return res.status(200).json({ success: true });
};

module.exports = {
  getTodayAttendance,
  recordMatchWebhook,
  getTodayStats,
  broadcastCameraFrame,
};

