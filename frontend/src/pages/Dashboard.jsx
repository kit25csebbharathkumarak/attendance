import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  RefreshCw,
  Sparkles,
  ScanFace,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
  Play
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { StatsCards } from '../components/StatsCards';

export const Dashboard = () => {
  const { socket, isConnected } = useSocket();

  // Primary State as requested: presentStudents
  const [presentStudents, setPresentStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [highlightedId, setHighlightedId] = useState(null);
  const [simulating, setSimulating] = useState(false);

  // 1. Fetch Today's Initial Attendance on Mount
  const fetchTodayAttendance = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/attendance/today');
      if (res.ok) {
        const json = await res.json();
        setPresentStudents(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching today attendance:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTodayAttendance();
  }, []);

  // 2. Connect & Listen to 'new_attendance' Socket.IO event
  useEffect(() => {
    if (!socket) return;

    const handleNewAttendance = (newRecord) => {
      console.log('[Socket Event Received] new_attendance:', newRecord);

      // Prepend to state array of presentStudents
      setPresentStudents((prev) => {
        // Check if student already present in current list to prevent duplicate display rows
        const filtered = prev.filter((item) => item.studentId !== newRecord.studentId);
        return [newRecord, ...filtered];
      });

      // Highlight the incoming record for 2.5 seconds
      setHighlightedId(newRecord.studentId);
      setTimeout(() => {
        setHighlightedId(null);
      }, 2500);
    };

    socket.on('new_attendance', handleNewAttendance);

    return () => {
      socket.off('new_attendance', handleNewAttendance);
    };
  }, [socket]);

  // 3. Simulated Match Event Trigger (Test without camera)
  const triggerSimulatedMatch = async () => {
    try {
      setSimulating(true);
      const randomStudentNum = Math.floor(Math.random() * 65) + 1;
      const studentId = `STU${String(randomStudentNum).padStart(3, '0')}`;
      const matchTypes = ['Multimodal', 'Face', 'Multimodal'];
      const chosenType = matchTypes[Math.floor(Math.random() * matchTypes.length)];
      const confidence = Number((0.85 + Math.random() * 0.14).toFixed(3));

      await fetch('/api/webhook/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          matchType: chosenType,
          confidence,
          doorLocation: 'Classroom Main Entrance',
        }),
      });
    } catch (error) {
      console.error('Simulation error:', error);
    } finally {
      setSimulating(false);
    }
  };

  // 4. Compute Metrics for KPI Cards
  const stats = useMemo(() => {
    const totalPresent = presentStudents.length;
    let multimodalCount = 0;
    let faceCount = 0;
    let bodyCount = 0;
    let sumConf = 0;

    presentStudents.forEach((student) => {
      sumConf += student.confidence || 0;
      if (student.matchType === 'Multimodal') multimodalCount++;
      else if (student.matchType === 'Face') faceCount++;
      else bodyCount++;
    });

    return {
      totalPresent,
      multimodalCount,
      faceCount,
      bodyCount,
      avgConfidence: totalPresent > 0 ? sumConf / totalPresent : 0,
    };
  }, [presentStudents]);

  // 5. Filtered Students List
  const filteredStudents = useMemo(() => {
    return presentStudents.filter((student) => {
      const matchesSearch =
        (student.studentName?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (student.studentId?.toLowerCase() || '').includes(searchQuery.toLowerCase());

      const matchesType =
        typeFilter === 'ALL' || student.matchType?.toUpperCase() === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [presentStudents, searchQuery, typeFilter]);

  // Format Time Helper
  const formatTime = (isoString) => {
    if (!isoString) return '--:--:--';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getRelativeMinutes = (isoString) => {
    if (!isoString) return '';
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 min ago';
    return `${diffMins} mins ago`;
  };

  // Export CSV
  const exportCSV = () => {
    if (presentStudents.length === 0) return;
    const headers = ['Student ID', 'Student Name', 'Timestamp', 'Match Type', 'Confidence'];
    const rows = presentStudents.map((s) => [
      s.studentId,
      `"${s.studentName || ''}"`,
      new Date(s.timestamp).toISOString(),
      s.matchType,
      s.confidence,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `attendance_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Top Banner & Quick Simulation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            Walk-Through Attendance Monitor
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-pulse" />
              Active Doorway
            </span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Real-time YOLOv8 person localization & DeepFace feature verification for 65-student cohort.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={triggerSimulatedMatch}
            disabled={simulating}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-cyan text-white text-xs font-semibold hover:opacity-90 transition-all shadow-lg shadow-brand-500/20 active:scale-95 disabled:opacity-50"
            title="Fire a synthetic detection match to test real-time Socket.IO table updates"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {simulating ? 'Sending...' : 'Simulate Match Event'}
          </button>

          <button
            onClick={fetchTodayAttendance}
            className="p-2.5 rounded-xl bg-dark-900 border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 transition-all"
            title="Refresh Attendance Logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-brand-400' : ''}`} />
          </button>

          <button
            onClick={exportCSV}
            disabled={presentStudents.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-dark-900 border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 transition-all text-xs font-medium disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Stats Overview */}
      <StatsCards stats={stats} totalCapacity={65} />

      {/* Filter and Search Bar */}
      <div className="glass-panel rounded-2xl p-4 mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search input */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student name or ID..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-dark-900 border border-white/10 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors"
          />
        </div>

        {/* Filter Badges */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {['ALL', 'MULTIMODAL', 'FACE', 'BODY'].map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                typeFilter === type
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                  : 'bg-dark-900 text-slate-400 border border-white/5 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Real-Time Attendance Table */}
      <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-bold text-white tracking-wide uppercase">
              Live Attendees Roster ({filteredStudents.length})
            </h3>
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            Auto-refreshing via WebSocket
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-dark-900/60 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="py-3.5 px-6">Student</th>
                <th className="py-3.5 px-6">Student ID</th>
                <th className="py-3.5 px-6">Arrival Time</th>
                <th className="py-3.5 px-6">Detection Mode</th>
                <th className="py-3.5 px-6">Match Confidence</th>
                <th className="py-3.5 px-6 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users className="w-8 h-8 text-slate-600" />
                      <p className="text-sm font-medium">No attendance logs matching filter today.</p>
                      <p className="text-xs text-slate-600">
                        Camera is monitoring entrance. Click "Simulate Match Event" to trigger an entry.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((item) => {
                  const isNew = highlightedId === item.studentId;
                  const confidencePct = Math.round((item.confidence || 0) * 100);

                  return (
                    <tr
                      key={item._id || item.studentId}
                      className={`transition-colors duration-500 hover:bg-white/[0.02] ${
                        isNew ? 'bg-emerald-500/20 ring-1 ring-emerald-500/50' : ''
                      }`}
                    >
                      {/* Student Info */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-600 to-accent-violet flex items-center justify-center text-white font-bold text-xs shadow-md">
                            {(item.studentName || item.studentId).slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-100">
                              {item.studentName || `Student ${item.studentId}`}
                            </div>
                            <div className="text-xs text-slate-400">
                              {item.doorLocation || 'Entrance Doorway'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Student ID */}
                      <td className="py-4 px-6">
                        <span className="font-mono text-xs font-medium px-2.5 py-1 rounded-md bg-dark-900 border border-white/10 text-brand-400">
                          {item.studentId}
                        </span>
                      </td>

                      {/* Arrival Timestamp */}
                      <td className="py-4 px-6">
                        <div className="text-slate-200 font-medium text-xs">
                          {formatTime(item.timestamp)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {getRelativeMinutes(item.timestamp)}
                        </div>
                      </td>

                      {/* Match Type Badge */}
                      <td className="py-4 px-6">
                        {item.matchType === 'Multimodal' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Sparkles className="w-3 h-3" />
                            Multimodal (Face+Body)
                          </span>
                        ) : item.matchType === 'Face' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20">
                            <ScanFace className="w-3 h-3" />
                            Face Crop
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <UserCheck className="w-3 h-3" />
                            Body Track
                          </span>
                        )}
                      </td>

                      {/* Confidence Score with Mini Progress Bar */}
                      <td className="py-4 px-6">
                        <div className="w-32 space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-slate-300">{confidencePct}%</span>
                            <span className="text-[10px] text-slate-500">Cosine</span>
                          </div>
                          <div className="w-full bg-dark-900 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full transition-all duration-300 ${
                                confidencePct >= 85
                                  ? 'bg-emerald-400'
                                  : confidencePct >= 70
                                  ? 'bg-brand-400'
                                  : 'bg-amber-400'
                              }`}
                              style={{ width: `${confidencePct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Verified Status */}
                      <td className="py-4 px-6 text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          Marked Present
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
