import React, { useState, useEffect, useRef } from 'react';
import { UserPlus, Users, CheckCircle, AlertCircle, Camera, Upload, RefreshCw, Sparkles } from 'lucide-react';

export const Enrollment = () => {
  const [studentId, setStudentId] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('Computer Science');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [enrolledList, setEnrolledList] = useState([]);

  // Camera & Image Capture State
  const [useCamera, setUseCamera] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [workerRunning, setWorkerRunning] = useState(false);

  const fetchEnrolled = async () => {
    try {
      const res = await fetch('/api/students');
      if (res.ok) {
        const json = await res.json();
        setEnrolledList(json.data || []);
      }
    } catch (e) {
      console.error('Failed to fetch students:', e);
    }
  };

  const checkWorker = async () => {
    try {
      const res = await fetch('/api/worker/status');
      if (res.ok) {
        const json = await res.json();
        setWorkerRunning(Boolean(json.running));
      }
    } catch (e) { }
  };

  useEffect(() => {
    fetchEnrolled();
    checkWorker();
    return () => {
      stopCamera();
    };
  }, []);

  // Start Browser Webcam Feed
  const startCamera = async () => {
    try {
      setMessage(null);
      // On Windows, webcam is exclusive to one app. If ML worker is running, stop it first.
      if (workerRunning) {
        try {
          await fetch('/api/worker/stop', { method: 'POST' });
          setWorkerRunning(false);
          await new Promise((r) => setTimeout(r, 600));
        } catch (e) { }
      }

      setUseCamera(true);
      setCapturedImage(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Webcam access error:', err);
      setMessage({
        type: 'error',
        text: 'Could not access webcam. If camera is occupied, please upload a photo or retry.',
      });
      setUseCamera(false);
    }
  };

  // Stop Webcam
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setUseCamera(false);
  };

  // Capture Snapshot from Webcam
  const snapPhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(dataUrl);
    stopCamera();
  };

  // Handle Photo File Upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCapturedImage(reader.result);
      stopCamera();
    };
    reader.readAsDataURL(file);
  };

  // Submit Enrollment with Real Photo & Real FaceNet Extraction
  const handleEnroll = async (e) => {
    e.preventDefault();
    if (!studentId || !name) {
      setMessage({ type: 'error', text: 'Student ID and Name are required.' });
      return;
    }

    try {
      setLoading(true);
      setMessage(null);

      const payload = {
        studentId: studentId.trim(),
        name: name.trim(),
        department,
        email,
        image: capturedImage || undefined,
      };

      const res = await fetch('/api/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setMessage({
          type: 'success',
          text: `Student ${name} successfully enrolled!`,
        });
        setStudentId('');
        setName('');
        setEmail('');
        setCapturedImage(null);
        fetchEnrolled();
      } else {
        setMessage({ type: 'error', text: data.message || 'Enrollment failed.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network connection error during enrollment.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-black text-red-950 tracking-tight flex items-center gap-2">
          Enroll Student
        </h2>
        <p className="text-xs text-red-900/60 mt-0.5">
          Add new student profiles and face photos for recognition
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Enrollment Form */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl p-5 border border-sandal-200 shadow-sandal-sm">
            <h3 className="text-sm font-bold text-red-950 mb-3 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-red-600" />
              Student Details
            </h3>

            {message && (
              <div
                className={`mb-3 p-2.5 rounded-xl text-xs flex items-center gap-2 border ${message.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-red-50 text-red-700 border-red-200'
                  }`}
              >
                {message.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                )}
                <span>{message.text}</span>
              </div>
            )}

            {/* Photo Capture Section */}
            <div className="mb-3">
              <label className="block text-xs font-semibold text-red-950 mb-1">
                Student Photo
              </label>

              {useCamera ? (
                <div className="relative rounded-xl overflow-hidden border border-sandal-300 bg-sandal-50 aspect-[4/3] flex items-center justify-center shadow-inner">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                  <div className="absolute bottom-3 inset-x-0 flex justify-center gap-2 px-3">
                    <button
                      type="button"
                      onClick={snapPhoto}
                      className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md shadow-red-600/20 flex items-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Capture
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-sandal-100 text-red-900 text-xs font-semibold border border-sandal-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : capturedImage ? (
                <div className="relative rounded-xl overflow-hidden border border-sandal-300 bg-sandal-50 aspect-[4/3] shadow-inner">
                  <img
                    src={capturedImage}
                    alt="Student Face"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 right-2">
                    <button
                      type="button"
                      onClick={() => setCapturedImage(null)}
                      className="px-2.5 py-1 rounded-lg bg-white/90 hover:bg-white text-xs text-red-700 font-semibold border border-red-200 shadow-sm"
                    >
                      Retake
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={startCamera}
                    className="flex flex-col items-center justify-center p-3.5 rounded-xl border border-sandal-200 bg-sandal-50 hover:bg-sandal-100 hover:border-sandal-300 transition-all text-center gap-1.5 group"
                  >
                    <Camera className="w-4 h-4 text-red-600 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-red-950">Open Camera</span>
                  </button>

                  <label className="flex flex-col items-center justify-center p-3.5 rounded-xl border border-sandal-200 bg-sandal-50 hover:bg-sandal-100 hover:border-sandal-300 transition-all text-center gap-1.5 cursor-pointer group">
                    <Upload className="w-4 h-4 text-red-600 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-red-950">Upload Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </div>

            <form onSubmit={handleEnroll} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-red-950 mb-1">
                  Student ID / Roll No *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. STU101"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-sandal-50 border border-sandal-200 text-xs text-red-950 placeholder-red-900/40 focus:outline-none focus:border-red-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-red-950 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Johnson"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-sandal-50 border border-sandal-200 text-xs text-red-950 placeholder-red-900/40 focus:outline-none focus:border-red-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-red-950 mb-1">
                  Department
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-sandal-50 border border-sandal-200 text-xs text-red-950 placeholder-red-900/40 focus:outline-none focus:border-red-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-red-950 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="alex@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-sandal-50 border border-sandal-200 text-xs text-red-950 placeholder-red-900/40 focus:outline-none focus:border-red-500 transition-colors"
                />
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-md shadow-red-600/20 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Enrolling...
                    </>
                  ) : (
                    'Enroll Student'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Enrolled Students Table */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-sandal-200 overflow-hidden shadow-sandal-sm">
            <div className="px-5 py-3.5 border-b border-sandal-200 flex items-center justify-between bg-sandal-50/50">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-red-600" />
                <h3 className="text-sm font-bold text-red-950">
                  Enrolled Students ({enrolledList.length})
                </h3>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-sandal-50 border-b border-sandal-200 text-xs font-semibold text-red-900/70 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-5">Student</th>
                    <th className="py-3 px-5">Roll No</th>
                    <th className="py-3 px-5">Department</th>
                    <th className="py-3 px-5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sandal-100 text-xs">
                  {enrolledList.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="py-10 text-center text-red-900/50">
                        No students enrolled yet.
                      </td>
                    </tr>
                  ) : (
                    enrolledList.map((stu) => (
                      <tr key={stu._id || stu.studentId} className="hover:bg-sandal-50/60 transition-colors">
                        <td className="py-3 px-5 font-bold text-red-950">{stu.name}</td>
                        <td className="py-3 px-5">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-sandal-100 text-red-700 border border-sandal-200">
                            {stu.studentId}
                          </span>
                        </td>
                        <td className="py-3 px-5 text-red-900/70 font-medium">{stu.department}</td>
                        <td className="py-3 px-5 text-right">
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            Enrolled
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Enrollment;
