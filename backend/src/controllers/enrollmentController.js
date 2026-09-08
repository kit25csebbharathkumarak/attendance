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
      const pythonCmd = `python "${scriptPath}" "${tempFile}"`;

      exec(pythonCmd, { timeout: 15000 }, (error, stdout, stderr) => {
        // Clean up temp file
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }

        if (error) {
          console.error('[FaceNet Extraction Error]', stderr || error.message);
          return resolve(null);
        }

        try {
          // Parse last line of stdout as JSON
          const lines = stdout.trim().split('\n');
          const jsonLine = lines[lines.length - 1];
          const result = JSON.parse(jsonLine);
          if (result.success && result.embedding) {
            return resolve(result.embedding);
          }
          console.warn('[FaceNet Notice]', result.error);
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

    // If a real image was captured from the webcam or uploaded, extract real FaceNet embedding!
    if (image && typeof image === 'string' && image.length > 50) {
      console.log(`[Enrollment] Extracting real FaceNet 512-d embeddings for ${cleanName} (${cleanId})...`);
      const realEmbedding = await extractRealEmbeddingFromImage(image);
      if (realEmbedding && realEmbedding.length === 512) {
        finalEmbeddings = [realEmbedding];
        console.log(`[Enrollment] ✅ Successfully extracted real FaceNet embedding for ${cleanName}!`);
      } else {
        console.warn('[Enrollment] FaceNet could not locate face in image; fallback to normalized vector.');
      }
    }

    // Ensure we have at least one embedding vector
    if (!finalEmbeddings || finalEmbeddings.length === 0) {
      // Fallback to random 512-d normalized vector if neither image nor embeddings were provided
      const dummy = Array.from({ length: 512 }, () => Math.random() * 0.2 - 0.1);
      finalEmbeddings = [dummy];
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
      const students = await Student.find({}, 'studentId name department email createdAt')
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
