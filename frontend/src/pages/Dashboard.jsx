import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Users,
  Search,
  RefreshCw,
  Sparkles,
  ScanFace,
  UserCheck,
  CheckCircle2,
  Clock,
  Download,
  Play,
  Camera,
  Video,
  Eye,
  ShieldCheck
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { StatsCards } from '../components/StatsCards';

export const Dashboard = () => {
  const { socket, isConnected } = useSocket();

  // Primary State: presentStudents
  const [presentStudents, setPresentStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [highlightedId, setHighlightedId] = useState(null);
  const [simulating, setSimulating] = useState(false);

  // Live Webcam Feed on Dashboard
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const startCamera = async () => {
    try {
      setCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.warn('Dashboard webcam access not granted:', err);
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

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
        const filtered = prev.filter((item) => item.studentId !== newRecord.studentId);
        return [newRecord, ...filtered];
      });

      // Highlight the incoming record for 3 seconds
      setHighlightedId(newRecord.studentId);
      setTimeout(() => {
        setHighlightedId(null);
      }, 3000);
    };

    socket.on('new_attendance', handleNewAttendance);

    return () => {
      socket.off('new_attendance', handleNewAttendance);
    };
  }, [socket]);

  // 3. Simulated Match Event Trigger (Test)
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

  // Most recent detected student
  const latestMatch = presentStudents[0] || null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            Walk-Through Attendance Monitor
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-pulse" />
              Live Doorway
            </span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Real-time YOLOv8 + FaceNet 512-d biometric entrance monitoring with live photo verification.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={cameraActive ? stopCamera : startCamera}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
              cameraActive
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                : 'bg-dark-900 border-white/10 text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Video className="w-4 h-4 text-brand-400" />
            {cameraActive ? 'Stop Live Feed' : 'Live Camera View'}
          </button>

          <button
            onClick={triggerSimulatedMatch}
            disabled={simulating}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-cyan text-white text-xs font-semibold hover:opacity-90 transition-all shadow-lg shadow-brand-500/20 active:scale-95 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {simulating ? 'Sending...' : 'Simulate Match'}
          </button>

          <button
            onClick={fetchTodayAttendance}
            className="p-2.5 rounded-xl bg-dark-900 border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 transition-all"
            title="Refresh Logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-brand-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Stats Overview */}
      <StatsCards stats={stats} totalCapacity={65} />

      {/* Live Video Feed & Latest Verification Spotlight Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Live Camera Stream Panel */}
        <div className="lg:col-span-2 glass-panel rounded-2xl p-5 border border-white/10 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-brand-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                Entrance Camera Live Stream (Classroom 301)
              </h3>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20 font-medium flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {cameraActive ? 'Streaming Active' : 'Standby Mode'}
            </span>
          </div>

          <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-white/10 shadow-inner">
            {cameraActive ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />
                {/* On-screen HUD Bar */}
                <div className="absolute top-3 left-3 px-3 py-1 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 live-pulse" />
                  YOLOv8 + MTCNN Face Tracking Active
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-400">
                <div className="w-14 h-14 rounded-2xl bg-dark-900 border border-white/10 flex items-center justify-center shadow-lg">
                  <Video className="w-7 h-7 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-300">Live Entrance Feed Preview</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    Click "Live Camera View" above to watch your live webcam stream directly on this dashboard.
                  </p>
                </div>
                <button
                  onClick={startCamera}
                  className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md transition-all flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Turn On Live Video
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Latest Verified Match Spotlight */}
        <div className="lg:col-span-1 glass-panel rounded-2xl p-5 border border-white/10 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                Latest Verified Match
              </h3>
            </div>

            {latestMatch ? (
              <div className="space-y-4">
                <div className="relative rounded-xl overflow-hidden border border-emerald-500/40 aspect-[4/3] bg-dark-900 flex items-center justify-center">
                  {latestMatch.photo ? (
                    <img
                      src={latestMatch.photo}
                      alt={latestMatch.studentName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-600 to-accent-violet flex items-center justify-center text-white text-xl font-bold">
                        {(latestMatch.studentName || latestMatch.studentId).slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-xs text-slate-500">No Photo Captured</span>
                    </div>
                  )}

                  <div className="absolute top-2 right-2 px-2.5 py-1 rounded-md bg-black/80 backdrop-blur-md text-emerald-400 text-xs font-bold border border-emerald-500/30">
                    {Math.round((latestMatch.confidence || 0) * 100)}% Conf
                  </div>
                </div>

                <div>
                  <h4 className="text-lg font-bold text-white">
                    {latestMatch.studentName || `Student ${latestMatch.studentId}`}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-dark-900 text-brand-400 border border-white/5">
                      {latestMatch.studentId}
                    </span>
                    <span className="text-xs text-slate-400">{latestMatch.department || 'Computer Science'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                <Users className="w-8 h-8 text-slate-600" />
                <span>Waiting for student detection at entrance...</span>
              </div>
            )}
          </div>

          {latestMatch && (
            <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
              <span>Arrival: {formatTime(latestMatch.timestamp)}</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Verified Present
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-panel rounded-2xl p-4 mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
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

      {/* Real-Time Attendance Table with Live Captured Photos */}
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
                <th className="py-3.5 px-6">Captured Photo & Student</th>
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
                        Camera is monitoring entrance. Run python ml_worker.py or click "Simulate Match".
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
                      {/* Photo Thumbnail + Student Info */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3.5">
                          {item.photo ? (
                            <img
                              src={item.photo}
                              alt={item.studentName}
                              className="w-11 h-11 rounded-xl object-cover border border-emerald-500/40 shadow-md ring-1 ring-white/10"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-600 to-accent-violet flex items-center justify-center text-white font-bold text-xs shadow-md">
                              {(item.studentName || item.studentId).slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-slate-100">
                              {item.studentName || `Student ${item.studentId}`}
                            </div>
                            <div className="text-xs text-slate-400">
                              {item.doorLocation || 'Classroom Entrance'}
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

                      {/* Timestamp */}
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
                            FaceNet Crop
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <UserCheck className="w-3 h-3" />
                            Body Track
                          </span>
                        )}
                      </td>

                      {/* Confidence Score */}
                      <td className="py-4 px-6">
                        <div className="w-32 space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-slate-300">{confidencePct}%</span>
                            <span className="text-[10px] text-slate-500">Cosine</span>
                          </div>
                          <div className="w-full bg-dark-900 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full transition-all duration-300 ${
                                confidencePct >= 80
                                  ? 'bg-emerald-400'
                                  : confidencePct >= 60
                                  ? 'bg-brand-400'
                                  : 'bg-amber-400'
                              }`}
                              style={{ width: `${confidencePct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Status */}
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
