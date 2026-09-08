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

  useEffect(() => {
    fetchEnrolled();
    return () => {
      stopCamera();
    };
  }, []);

  // Start Browser Webcam Feed
  const startCamera = async () => {
    try {
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
      setMessage({ type: 'error', text: 'Could not access webcam. Please check browser permissions.' });
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
          text: `Student ${name} successfully enrolled with real FaceNet 512-d embeddings!`,
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          Student Facial Enrollment
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-emerald-400" />
            PyTorch FaceNet 512-d Active
          </span>
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Capture real face photos via webcam or upload an image. The system extracts real 512-dimensional facial embedding vectors using FaceNet (InceptionResnetV1).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Enrollment Form */}
        <div className="lg:col-span-1">
          <div className="glass-panel rounded-2xl p-6 border border-white/10 shadow-xl">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-brand-400" />
              Enroll Real Student Face
            </h3>

            {message && (
              <div
                className={`mb-4 p-3 rounded-xl text-xs flex items-center gap-2 border ${
                  message.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                }`}
              >
                {message.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{message.text}</span>
              </div>
            )}

            {/* Webcam / Image Capture Section */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
                Face Photo (Real Model Extraction)
              </label>

              {useCamera ? (
                <div className="relative rounded-xl overflow-hidden border border-brand-500/50 bg-black aspect-[4/3] flex items-center justify-center">
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
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-lg flex items-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Take Photo
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="px-3 py-2 rounded-xl bg-dark-900/80 hover:bg-dark-900 text-slate-300 text-xs border border-white/10"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : capturedImage ? (
                <div className="relative rounded-xl overflow-hidden border border-emerald-500/40 bg-dark-900 aspect-[4/3]">
                  <img
                    src={capturedImage}
                    alt="Captured Face"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 right-2">
                    <button
                      type="button"
                      onClick={() => setCapturedImage(null)}
                      className="px-2.5 py-1 rounded-lg bg-black/70 hover:bg-black text-xs text-rose-300 border border-white/10"
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
                    className="flex flex-col items-center justify-center p-4 rounded-xl border border-white/10 bg-dark-900/80 hover:border-brand-500/50 hover:bg-dark-900 transition-all text-center gap-2 group"
                  >
                    <Camera className="w-5 h-5 text-brand-400 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium text-slate-300">Open Webcam</span>
                  </button>

                  <label className="flex flex-col items-center justify-center p-4 rounded-xl border border-white/10 bg-dark-900/80 hover:border-brand-500/50 hover:bg-dark-900 transition-all text-center gap-2 cursor-pointer group">
                    <Upload className="w-5 h-5 text-accent-cyan group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium text-slate-300">Upload Photo</span>
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

            <form onSubmit={handleEnroll} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
                  Student ID / Roll No. *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. STU101"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-dark-900 border border-white/10 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bharath Kumar"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-dark-900 border border-white/10 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
                  Department
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-dark-900 border border-white/10 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="student@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-dark-900 border border-white/10 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-cyan text-white text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-all shadow-lg shadow-brand-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Extracting Real FaceNet Vector...
                    </>
                  ) : (
                    'Enroll with Real FaceNet Model'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Enrolled Students Table */}
        <div className="lg:col-span-2">
          <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-400" />
                <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                  Enrolled Students Cohort ({enrolledList.length} / 65)
                </h3>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-dark-900">
                  <tr className="border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-6">Student</th>
                    <th className="py-3 px-6">ID</th>
                    <th className="py-3 px-6">Department</th>
                    <th className="py-3 px-6">Feature Embeddings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  {enrolledList.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="py-8 text-center text-slate-500 text-xs">
                        No students enrolled in database yet.
                      </td>
                    </tr>
                  ) : (
                    enrolledList.map((stu) => (
                      <tr key={stu._id || stu.studentId} className="hover:bg-white/[0.02]">
                        <td className="py-3.5 px-6 font-semibold text-slate-200">{stu.name}</td>
                        <td className="py-3.5 px-6">
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-dark-900 text-brand-400 border border-white/5">
                            {stu.studentId}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-xs text-slate-400">{stu.department}</td>
                        <td className="py-3.5 px-6">
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            <Sparkles className="w-3 h-3" />
                            512-d FaceNet
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
