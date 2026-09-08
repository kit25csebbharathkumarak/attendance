const Student = require('../models/Student');

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

    if (!faceEmbeddings || (Array.isArray(faceEmbeddings) && faceEmbeddings.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'faceEmbeddings array is required for facial recognition matching.',
      });
    }

    // Upsert student record
    const student = await Student.findOneAndUpdate(
      { studentId: studentId.trim() },
      {
        studentId: studentId.trim(),
        name: name.trim(),
        faceEmbeddings,
        department: department || 'Computer Science',
        email: email || '',
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
        embeddingsCount: Array.isArray(student.faceEmbeddings[0])
          ? student.faceEmbeddings.length
          : 1,
        createdAt: student.createdAt,
      },
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
    const students = await Student.find({}, 'studentId name department email createdAt')
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: students.length,
      data: students,
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
    const students = await Student.find({}, 'studentId name faceEmbeddings').lean();
    return res.status(200).json({
      success: true,
      count: students.length,
      data: students,
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
