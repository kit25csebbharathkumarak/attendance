const mongoose = require('mongoose');

// Generate 65 realistic student names for the cohort demo
const firstNames = ['Alex', 'Sophia', 'Liam', 'Emma', 'Noah', 'Olivia', 'Ethan', 'Ava', 'Mason', 'Isabella', 'William', 'Mia', 'James', 'Harper', 'Benjamin', 'Evelyn', 'Lucas', 'Abigail', 'Henry', 'Emily', 'Alexander', 'Ella', 'Daniel', 'Elizabeth', 'Matthew', 'Camila', 'Aiden', 'Luna', 'David', 'Sofia', 'Joseph', 'Avery', 'Samuel', 'Mila', 'Sebastian', 'Aria', 'Jackson', 'Scarlett', 'Owen', 'Penelope', 'Gabriel', 'Layla', 'Carter', 'Chloe', 'Jayden', 'Victoria', 'John', 'Madison', 'Luke', 'Eleanor', 'Anthony', 'Grace', 'Isaac', 'Nora', 'Dylan', 'Riley', 'Wyatt', 'Zoey', 'Andrew', 'Hannah', 'Joshua', 'Hazel', 'Christopher', 'Lily', 'Julian'];
const lastNames = ['Johnson', 'Chen', 'Patel', 'Davis', 'Wilson', 'Martinez', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Thompson', 'Garcia', 'Robinson', 'Clark', 'Rodriguez', 'Lewis', 'Lee', 'Walker', 'Hall', 'Allen', 'Young', 'Hernandez', 'King', 'Wright', 'Lopez', 'Hill', 'Scott', 'Green', 'Adams', 'Baker', 'Gonzalez', 'Nelson', 'Carter', 'Mitchell', 'Perez', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Sanchez', 'Morris', 'Rogers', 'Reed', 'Cook', 'Morgan', 'Bell', 'Murphy', 'Bailey', 'Rivera', 'Cooper', 'Richardson', 'Cox', 'Howard', 'Ward', 'Torres', 'Peterson', 'Gray'];

const memoryStudents = [];
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

const memoryAttendanceLogs = [];

const isMongoConnected = () => mongoose.connection.readyState === 1;

module.exports = {
  isMongoConnected,
  memoryStudents,
  memoryAttendanceLogs,
};
