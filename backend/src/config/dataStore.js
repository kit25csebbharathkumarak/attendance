const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const studentsFile = path.join(dataDir, 'students.json');
const attendanceFile = path.join(dataDir, 'attendance.json');

// Generate initial 65 students if file doesn't exist
const firstNames = ['Alex', 'Sophia', 'Liam', 'Emma', 'Noah', 'Olivia', 'Ethan', 'Ava', 'Mason', 'Isabella', 'William', 'Mia', 'James', 'Harper', 'Benjamin', 'Evelyn', 'Lucas', 'Abigail', 'Henry', 'Emily', 'Alexander', 'Ella', 'Daniel', 'Elizabeth', 'Matthew', 'Camila', 'Aiden', 'Luna', 'David', 'Sofia', 'Joseph', 'Avery', 'Samuel', 'Mila', 'Sebastian', 'Aria', 'Jackson', 'Scarlett', 'Owen', 'Penelope', 'Gabriel', 'Layla', 'Carter', 'Chloe', 'Jayden', 'Victoria', 'John', 'Madison', 'Luke', 'Eleanor', 'Anthony', 'Grace', 'Isaac', 'Nora', 'Dylan', 'Riley', 'Wyatt', 'Zoey', 'Andrew', 'Hannah', 'Joshua', 'Hazel', 'Christopher', 'Lily', 'Julian'];
const lastNames = ['Johnson', 'Chen', 'Patel', 'Davis', 'Wilson', 'Martinez', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Thompson', 'Garcia', 'Robinson', 'Clark', 'Rodriguez', 'Lewis', 'Lee', 'Walker', 'Hall', 'Allen', 'Young', 'Hernandez', 'King', 'Wright', 'Lopez', 'Hill', 'Scott', 'Green', 'Adams', 'Baker', 'Gonzalez', 'Nelson', 'Carter', 'Mitchell', 'Perez', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Sanchez', 'Morris', 'Rogers', 'Reed', 'Cook', 'Morgan', 'Bell', 'Murphy', 'Bailey', 'Rivera', 'Cooper', 'Richardson', 'Cox', 'Howard', 'Ward', 'Torres', 'Peterson', 'Gray'];

let memoryStudents = [];

if (fs.existsSync(studentsFile)) {
  try {
    memoryStudents = JSON.parse(fs.readFileSync(studentsFile, 'utf8'));
    console.log(`[DataStore] Loaded ${memoryStudents.length} enrolled students from ${studentsFile}`);
  } catch (e) {
    console.error('[DataStore] Error reading students.json, recreating...');
  }
}

if (memoryStudents.length === 0) {
  for (let i = 1; i <= 65; i++) {
    const idStr = `STU${String(i).padStart(3, '0')}`;
    const firstName = firstNames[(i - 1) % firstNames.length];
    const lastName = lastNames[(i - 1) % lastNames.length];
    memoryStudents.push({
      studentId: idStr,
      name: `${firstName} ${lastName}`,
      department: 'Computer Science',
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@university.edu`,
      faceEmbeddings: [Array.from({ length: 512 }, () => Math.random() * 0.2 - 0.1)],
      createdAt: new Date(Date.now() - (65 - i) * 3600000),
    });
  }
  fs.writeFileSync(studentsFile, JSON.stringify(memoryStudents, null, 2));
}

let memoryAttendanceLogs = [];
if (fs.existsSync(attendanceFile)) {
  try {
    memoryAttendanceLogs = JSON.parse(fs.readFileSync(attendanceFile, 'utf8'));
  } catch (e) {
    memoryAttendanceLogs = [];
  }
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

const isMongoConnected = () => mongoose.connection.readyState === 1;

module.exports = {
  isMongoConnected,
  memoryStudents,
  memoryAttendanceLogs,
  saveStudentsToFile,
  saveAttendanceToFile,
};
