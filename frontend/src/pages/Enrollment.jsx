import React, { useState, useEffect } from 'react';
import { UserPlus, Users, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';

export const Enrollment = () => {
  const [studentId, setStudentId] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('Computer Science');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [enrolledList, setEnrolledList] = useState([]);

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
  }, []);

  const handleEnroll = async (e) => {
    e.preventDefault();
    if (!studentId || !name) {
      setMessage({ type: 'error', text: 'Student ID and Name are required.' });
      return;
    }

    try {
      setLoading(true);
      setMessage(null);

      // Generate a mock normalized 512-d embedding vector for demonstration
      const mockVector = Array.from({ length: 512 }, () =>
        Number((Math.random() * 0.2 - 0.1).toFixed(4))
      );

      const res = await fetch('/api/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentId.trim(),
          name: name.trim(),
          department,
          email,
          faceEmbeddings: [mockVector],
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setMessage({ type: 'success', text: `Student ${name} successfully enrolled!` });
        setStudentId('');
        setName('');
        setEmail('');
        fetchEnrolled();
      } else {
        setMessage({ type: 'error', text: data.message || 'Enrollment failed.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network connection failed.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          Student Facial Enrollment
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20 font-semibold">
            Cohort Registry
          </span>
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Register student profiles and feature embeddings for automatic doorway attendance matching.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Enrollment Form */}
        <div className="lg:col-span-1">
          <div className="glass-panel rounded-2xl p-6 border border-white/10 shadow-xl">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-brand-400" />
              Enroll New Student
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
                  placeholder="e.g. Alex Johnson"
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
                  placeholder="alex.j@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-dark-900 border border-white/10 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-cyan text-white text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-all shadow-lg shadow-brand-500/20 disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Register Student & Embeddings'}
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
                  Enrolled Students ({enrolledList.length} / 65)
                </h3>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-dark-900/60 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-6">Student</th>
                    <th className="py-3 px-6">ID</th>
                    <th className="py-3 px-6">Department</th>
                    <th className="py-3 px-6">Enrolled Date</th>
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
                        <td className="py-3.5 px-6 text-xs text-slate-500">
                          {new Date(stu.createdAt).toLocaleDateString()}
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
