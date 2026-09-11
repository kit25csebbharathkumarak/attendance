const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const Student = require('../models/Student');
const { isMongoConnected, memoryStudents, saveStudentsToFile } = require('../config/dataStore');


// Helper to extract real embeddings via Python FaceNet script
const extractRealEmbeddingFromImage = (base64Data) => {
  return new Promise((resolve, reject) => {
    try {
      const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      const tmpDir = path.join(__dirname, '../../tmp');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      const tempFile = path.join(tmpDir, `enroll_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.jpg`);
      fs.writeFileSync(tempFile, buffer);

      const scriptPath = path.resolve(__dirname, '../../../ml-engine/extract_embedding.py');
      const pythonCmd = process.platform === 'win32'
        ? `py -3.11 "${scriptPath}" "${tempFile}"`
        : `python3.11 "${scriptPath}" "${tempFile}"`;

      exec(pythonCmd, { timeout: 30000 }, (error, stdout, stderr) => {
        // Clean up temp file
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }

        if (error && !stdout) {
          console.error('[FaceNet Extraction Error]', stderr || error.message);
          return resolve(null);
        }

        try {
          // Parse stdout searching for valid JSON
          const lines = stdout.trim().split('\n');
          let result = null;
          for (let i = lines.length - 1; i >= 0; i--) {
            try {
              const parsed = JSON.parse(lines[i].trim());
              if (parsed && parsed.success !== undefined) {
                result = parsed;
                break;
              }
            } catch (e) {}
          }

          if (result && result.success && result.embedding) {
            return resolve(result.embedding);
          }
          if (result && result.error) {
            console.warn('[FaceNet Notice]', result.error);
          }
          return resolve(null);
        } catch (parseErr) {
          console.error('[FaceNet Output Parse Error]', stdout);
          return resolve(null);
        }
      });

    } catch (e) {
      console.error('[Image Processing Exception]', e);
      return resolve(null);
    }
  });
};

/**
 * @route   POST /api/enroll
 * @desc    Enroll or update a student with facial embeddings or real webcam photo
 */
const enrollStudent = async (req, res) => {
  try {
    const { studentId, name, faceEmbeddings, image, department, email, avatarUrl } = req.body;

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

    let finalEmbeddings = faceEmbeddings || [];

    // Extract real 512-d FaceNet embedding from captured photo
    const photoData = image || avatarUrl;
    if (photoData && typeof photoData === 'string' && photoData.length > 50) {
      console.log(`[Enrollment] Extracting real FaceNet 512-d embeddings for ${cleanName} (${cleanId})...`);
      const realEmbedding = await extractRealEmbeddingFromImage(photoData);
      if (realEmbedding && realEmbedding.length === 512) {
        finalEmbeddings = [realEmbedding];
        console.log(`[Enrollment] ✅ Successfully extracted real FaceNet embedding for ${cleanName}!`);
      } else {
        return res.status(400).json({
          success: false,
          message: 'FaceNet could not locate a face in the provided photo. Please ensure the student is looking directly at the camera with clear lighting and retry.',
        });
      }
    } else if (!finalEmbeddings || finalEmbeddings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'A student photo is required to enroll for facial recognition attendance.',
      });
    }

    if (isMongoConnected()) {
      const student = await Student.findOneAndUpdate(
        { studentId: cleanId },
        {
          studentId: cleanId,
          name: cleanName,
          faceEmbeddings: finalEmbeddings,
          department: cleanDept,
          email: cleanEmail,
          avatarUrl: avatarUrl || '',
        },
        { new: true, upsert: true, runValidators: true }
      );

      return res.status(200).json({
        success: true,
        message: `Student ${student.name} (${student.studentId}) successfully enrolled with real 512-d FaceNet embeddings.`,
        data: {
          studentId: student.studentId,
          name: student.name,
          department: student.department,
          embeddingDimensions: finalEmbeddings[0].length,
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
      avatarUrl: image || avatarUrl || '',
      faceEmbeddings: finalEmbeddings,
      createdAt: new Date(),
    };

    if (existingIndex >= 0) {
      memoryStudents[existingIndex] = newStudent;
    } else {
      memoryStudents.push(newStudent);
    }
    saveStudentsToFile();

    return res.status(200).json({
      success: true,
      message: `Student ${cleanName} (${cleanId}) successfully enrolled with real 512-d FaceNet embeddings.`,
      data: {
        studentId: newStudent.studentId,
        name: newStudent.name,
        department: newStudent.department,
        avatarUrl: newStudent.avatarUrl,
        embeddingDimensions: finalEmbeddings[0].length,
        createdAt: newStudent.createdAt,
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
    if (isMongoConnected()) {
      const students = await Student.find({}, 'studentId name department email avatarUrl createdAt')
        .sort({ studentId: 1 })
        .lean();

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
        department: s.department,
        email: s.email,
        avatarUrl: s.avatarUrl || '',
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

/**
 * @route   DELETE /api/students/:studentId
 * @desc    Delete a single enrolled student
 */
const deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'Student ID is required.' });
    }

    const cleanId = String(studentId).trim();

    if (isMongoConnected()) {
      await Student.findOneAndDelete({ studentId: cleanId });
    }

    const index = memoryStudents.findIndex((s) => String(s.studentId).trim() === cleanId);
    let removedName = cleanId;
    if (index >= 0) {
      removedName = memoryStudents[index].name;
      memoryStudents.splice(index, 1);
      saveStudentsToFile();
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('student_deleted', { studentId: cleanId });
    }

    return res.status(200).json({
      success: true,
      message: `Student ${removedName} (${cleanId}) deleted successfully.`,
    });
  } catch (error) {
    console.error('[Delete Student Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete student.',
      error: error.message,
    });
  }
};

/**
 * @route   DELETE /api/students
 * @desc    Clear all enrolled students
 */
const clearAllStudents = async (req, res) => {
  try {
    if (isMongoConnected()) {
      await Student.deleteMany({});
    }

    memoryStudents.length = 0;
    saveStudentsToFile();

    const io = req.app.get('io');
    if (io) {
      io.emit('student_deleted', { all: true });
    }

    return res.status(200).json({
      success: true,
      message: 'All enrolled students removed successfully.',
    });
  } catch (error) {
    console.error('[Clear Students Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear students.',
      error: error.message,
    });
  }
};

module.exports = {
  enrollStudent,
  getStudents,
  getStudentEmbeddings,
  deleteStudent,
  clearAllStudents,
};
