const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const studentsFile = path.join(dataDir, 'students.json');
const attendanceFile = path.join(dataDir, 'attendance.json');

let memoryStudents = [];
if (fs.existsSync(studentsFile)) {
  try {
    memoryStudents = JSON.parse(fs.readFileSync(studentsFile, 'utf8'));
    console.log(`[DataStore] Loaded ${memoryStudents.length} enrolled students from ${studentsFile}`);
  } catch (e) {
    memoryStudents = [];
  }
} else {
  fs.writeFileSync(studentsFile, JSON.stringify([], null, 2));
}

let memoryAttendanceLogs = [];
if (fs.existsSync(attendanceFile)) {
  try {
    memoryAttendanceLogs = JSON.parse(fs.readFileSync(attendanceFile, 'utf8'));
  } catch (e) {
    memoryAttendanceLogs = [];
  }
} else {
  fs.writeFileSync(attendanceFile, JSON.stringify([], null, 2));
}

const saveStudentsToFile = () => {
  try {
    fs.writeFileSync(studentsFile, JSON.stringify(memoryStudents, null, 2));
  } catch (e) {
    console.error('[DataStore] Failed to save students.json:', e);
  }
};

const saveAttendanceToFile = () => {
  try {
    fs.writeFileSync(attendanceFile, JSON.stringify(memoryAttendanceLogs, null, 2));
  } catch (e) {
    console.error('[DataStore] Failed to save attendance.json:', e);
  }
};

const clearAttendanceData = () => {
  memoryAttendanceLogs.length = 0;
  try {
    fs.writeFileSync(attendanceFile, JSON.stringify([], null, 2));
    console.log('[DataStore] Today\'s attendance logs have been cleared.');
  } catch (e) {
    console.error('[DataStore] Error clearing attendance file:', e);
  }
};

const clearAllData = () => {
  memoryStudents.length = 0;
  memoryAttendanceLogs.length = 0;
  try {
    fs.writeFileSync(studentsFile, JSON.stringify([], null, 2));
    fs.writeFileSync(attendanceFile, JSON.stringify([], null, 2));
    console.log('[DataStore] All student profiles and attendance logs have been cleared.');
  } catch (e) {
    console.error('[DataStore] Error clearing files:', e);
  }
};

const isMongoConnected = () => mongoose.connection.readyState === 1;

module.exports = {
  isMongoConnected,
  memoryStudents,
  memoryAttendanceLogs,
  saveStudentsToFile,
  saveAttendanceToFile,
  clearAttendanceData,
  clearAllData,
};
