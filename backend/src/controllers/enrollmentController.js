const Student = require('../models/Student');
const { isMongoConnected, memoryStudents } = require('../config/dataStore');

/**
 * @route   POST /api/enroll
 * @desc    Enroll or update a student with facial embeddings
 */
const enrollStudent = async (req, res) => {
  try {
    const { studentId, name, faceEmbeddings, department, email, avatarUrl } = req.body;

    if (!studentId || !name) {
      return res.status(400).json({
        success: false,
        message: 'studentId and name are required fields.',
      });
    }

    const cleanId = studentId.trim();
    const cleanName = name.trim();
    const cleanDept = department || 'Computer Science';
    const cleanEmail = email || '';

    if (isMongoConnected()) {
      const student = await Student.findOneAndUpdate(
        { studentId: cleanId },
        {
          studentId: cleanId,
          name: cleanName,
          faceEmbeddings: faceEmbeddings || [],
          department: cleanDept,
          email: cleanEmail,
          avatarUrl: avatarUrl || '',
        },
        { new: true, upsert: true, runValidators: true }
      );

      return res.status(200).json({
        success: true,
        message: `Student ${student.name} (${student.studentId}) successfully enrolled.`,
        data: {
          studentId: student.studentId,
          name: student.name,
          department: student.department,
          createdAt: student.createdAt,
        },
      });
    }

    // In-memory fallback store
    const existingIndex = memoryStudents.findIndex((s) => s.studentId === cleanId);
    const newStudent = {
      studentId: cleanId,
      name: cleanName,
      department: cleanDept,
      email: cleanEmail,
      faceEmbeddings: faceEmbeddings || [],
      createdAt: new Date(),
    };

    if (existingIndex >= 0) {
      memoryStudents[existingIndex] = newStudent;
    } else {
      memoryStudents.push(newStudent);
    }

    return res.status(200).json({
      success: true,
      message: `Student ${cleanName} (${cleanId}) successfully enrolled.`,
      data: newStudent,
    });
  } catch (error) {
    console.error('[Enrollment Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to enroll student.',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/students
 * @desc    Fetch all enrolled students
 */
const getStudents = async (req, res) => {
  try {
    if (isMongoConnected()) {
      const students = await Student.find({}, 'studentId name department email createdAt')
        .sort({ studentId: 1 })
        .lean();

      return res.status(200).json({
        success: true,
        count: students.length,
        data: students,
      });
    }

    // Return in-memory students
    return res.status(200).json({
      success: true,
      count: memoryStudents.length,
      data: memoryStudents.map((s) => ({
        studentId: s.studentId,
        name: s.name,
        department: s.department,
        email: s.email,
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    console.error('[Get Students Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch students list.',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/students/embeddings
 * @desc    Export enrolled student embeddings for Python ML worker initialization
 */
const getStudentEmbeddings = async (req, res) => {
  try {
    if (isMongoConnected()) {
      const students = await Student.find({}, 'studentId name faceEmbeddings').lean();
      return res.status(200).json({
        success: true,
        count: students.length,
        data: students,
      });
    }

    return res.status(200).json({
      success: true,
      count: memoryStudents.length,
      data: memoryStudents.map((s) => ({
        studentId: s.studentId,
        name: s.name,
        faceEmbeddings: s.faceEmbeddings,
      })),
    });
  } catch (error) {
    console.error('[Get Embeddings Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch student embeddings.',
      error: error.message,
    });
  }
};

module.exports = {
  enrollStudent,
  getStudents,
  getStudentEmbeddings,
};
