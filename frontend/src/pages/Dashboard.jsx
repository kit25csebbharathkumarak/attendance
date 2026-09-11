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
  Play,
  Square,
  Trash2,
  Camera,
  Eye,
  ShieldCheck,
  Activity,
  AlertTriangle,
  Smartphone,
  Video
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { StatsCards } from '../components/StatsCards';

const CameraStreamViewport = React.memo(({ socket, workerRunning, workerLoading, toggleWorker }) => {
  const [frame, setFrame] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    if (!socket) return;

    const handleLiveFrame = (data) => {
      if (data?.frame) {
        setFrame(data.frame);
        lastTimeRef.current = Date.now();
        setIsActive(true);
      }
    };

    socket.on('live_frame', handleLiveFrame);

    const timer = setInterval(() => {
      if (Date.now() - lastTimeRef.current > 3000) {
        setIsActive(false);
      }
    }, 1000);

    return () => {
      socket.off('live_frame', handleLiveFrame);
      clearInterval(timer);
    };
  }, [socket]);

  useEffect(() => {
    if (!workerRunning) {
      setFrame(null);
      setIsActive(false);
    }
  }, [workerRunning]);

  return (
    <div className="relative rounded-xl overflow-hidden bg-sandal-50/80 border border-sandal-200 aspect-video flex items-center justify-center shadow-inner">
      {isActive && frame ? (
        <>
          <img
            src={frame}
            alt="Live Camera Stream"
            className="w-full h-full object-cover"
          />
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-white/90 backdrop-blur-md border border-red-200 text-xs text-red-600 font-bold flex items-center gap-1.5 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-red-600 live-pulse" />
            Live Feed
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2.5 p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white border border-sandal-300 flex items-center justify-center text-red-600 shadow-sm">
            <Camera className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-red-950">
              {workerRunning ? 'Connecting to camera...' : 'Camera Standby'}
            </p>
            <p className="text-xs text-red-900/60 mt-0.5">
              {workerRunning
                ? 'Acquiring hardware video stream...'
                : 'Click start to begin recognition'}
            </p>
          </div>
          {!workerRunning && (
            <button
              onClick={() => toggleWorker()}
              disabled={workerLoading}
              className="mt-1 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md shadow-red-600/20 transition-all flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Start Camera
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export const Dashboard = () => {
  const { socket, isConnected } = useSocket();

  // Primary State
  const [presentStudents, setPresentStudents] = useState([]);
  const [totalEnrolled, setTotalEnrolled] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [highlightedId, setHighlightedId] = useState(null);

  // Worker Control State
  const [workerRunning, setWorkerRunning] = useState(false);
  const [workerPid, setWorkerPid] = useState(null);
  const [workerLoading, setWorkerLoading] = useState(false);

  // Camera Source Selection (Default 0 for Laptop Webcam, or saved choice)
  const [cameraSource, setCameraSource] = useState(
    () => localStorage.getItem('selected_camera_source') || '0'
  );
  const [customIpUrl, setCustomIpUrl] = useState('');
  const [availableCameras, setAvailableCameras] = useState([
    { id: '0', label: 'Camera 0 (Default Laptop Webcam)' },
    { id: '1', label: 'Camera 1 (Phone Link / Virtual Camera)' },
    { id: '2', label: 'Camera 2 (Phone Link / Secondary Device)' },
    { id: '3', label: 'Camera 3 (External Device)' },
    { id: 'custom', label: '🌐 Custom IP / RTSP Stream URL' },
  ]);

  // Reset Modal State
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);

  // 1. Check Worker Status on Mount
  const fetchWorkerStatus = async () => {
    try {
      const res = await fetch('/api/worker/status');
      if (res.ok) {
        const json = await res.json();
        setWorkerRunning(json.running);
        setWorkerPid(json.pid);
        if (json.cameraSource) {
          setCameraSource(json.cameraSource);
        }
      }
    } catch (e) {
      console.warn('Worker status check failed:', e);
    }
  };

  // 1b. Fetch Available Cameras on Mount
  const fetchCameras = async () => {
    try {
      const res = await fetch('/api/worker/cameras');
      if (res.ok) {
        const json = await res.json();
        if (json.cameras) {
          setAvailableCameras([
            ...json.cameras,
            { id: 'custom', label: '🌐 Custom IP / RTSP Stream URL' },
          ]);
        }
      }
    } catch (e) {
      console.warn('Cameras check failed:', e);
    }
  };

  // 2. Fetch Today's Attendance Logs on Mount
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

  // 2b. Fetch Enrolled Count
  const fetchEnrolledCount = async () => {
    try {
      const res = await fetch('/api/students');
      if (res.ok) {
        const json = await res.json();
        setTotalEnrolled(json.data ? json.data.length : 0);
      }
    } catch (e) {
      console.warn('Could not fetch enrolled count:', e);
    }
  };

  useEffect(() => {
    fetchWorkerStatus();
    fetchCameras();
    fetchTodayAttendance();
    fetchEnrolledCount();
  }, []);

  // 3. Socket.IO Event Listeners
  useEffect(() => {
    if (!socket) return;

    // Listen to new attendance
    const handleNewAttendance = (newRecord) => {
      console.log('[Socket Event Received] new_attendance:', newRecord);
      setPresentStudents((prev) => {
        const filtered = prev.filter((item) => item.studentId !== newRecord.studentId);
        return [newRecord, ...filtered];
      });

      setHighlightedId(newRecord.studentId);
      setTimeout(() => {
        setHighlightedId(null);
      }, 3000);
    };

    // Listen to worker status updates
    const handleWorkerStatus = (data) => {
      setWorkerRunning(data.running);
      setWorkerPid(data.pid);
      if (data.cameraSource) {
        setCameraSource(data.cameraSource);
      }
    };

    // Listen to system data reset
    const handleDataReset = () => {
      setPresentStudents([]);
      fetchTodayAttendance();
      fetchEnrolledCount();
    };

    // Listen to student deletions to update stats
    const handleStudentDeleted = () => {
      fetchEnrolledCount();
      fetchTodayAttendance();
    };

    // Listen to real-time student recognition (including debounced re-visits)
    const handleStudentRecognized = (data) => {
      if (data?.studentId) {
        setHighlightedId(data.studentId);
        setTimeout(() => {
          setHighlightedId(null);
        }, 2500);
      }
    };

    socket.on('new_attendance', handleNewAttendance);
    socket.on('student_recognized', handleStudentRecognized);
    socket.on('worker_status', handleWorkerStatus);
    socket.on('data_reset', handleDataReset);
    socket.on('student_deleted', handleStudentDeleted);

    return () => {
      socket.off('new_attendance', handleNewAttendance);
      socket.off('student_recognized', handleStudentRecognized);
      socket.off('worker_status', handleWorkerStatus);
      socket.off('data_reset', handleDataReset);
      socket.off('student_deleted', handleStudentDeleted);
    };
  }, [socket]);

  // Worker Start / Stop & Camera Switching Handlers
  const toggleWorker = async (overrideSource) => {
    try {
      setWorkerLoading(true);
      const effectiveSource = overrideSource !== undefined
        ? overrideSource
        : (cameraSource === 'custom' ? (customIpUrl || '0') : cameraSource);

      if (workerRunning && !overrideSource) {
        const res = await fetch('/api/worker/stop', { method: 'POST' });
        if (res.ok) {
          setWorkerRunning(false);
          setWorkerPid(null);
        }
      } else {
        const res = await fetch('/api/worker/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cameraSource: effectiveSource }),
        });
        const data = await res.json();
        if (res.ok) {
          setWorkerRunning(true);
          setWorkerPid(data.pid);
          if (data.cameraSource) {
            setCameraSource(data.cameraSource);
          }
        }
      }
    } catch (err) {
      console.error('Failed to toggle worker:', err);
    } finally {
      setWorkerLoading(false);
    }
  };

  const handleCameraChange = (newSource) => {
    setCameraSource(newSource);
    localStorage.setItem('selected_camera_source', newSource);
    if (workerRunning && newSource !== 'custom') {
      toggleWorker(newSource);
    }
  };

  // Clear Today's Attendance Data
  const handleClearAllData = async () => {
    try {
      setResetting(true);
      const res = await fetch('/api/system/reset', { method: 'POST' });
      if (res.ok) {
        setPresentStudents([]);
        setShowResetModal(false);
      }
    } catch (e) {
      console.error('Failed to reset data:', e);
    } finally {
      setResetting(false);
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

  const latestMatch = presentStudents[0] || null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-2xl font-black text-red-950 tracking-tight">
              Attendance Dashboard
            </h2>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Anti-Spoofing Active</span>
            </div>
          </div>
          <p className="text-xs text-red-900/60 mt-0.5">
            Automatic walk-through attendance tracking with live student verification
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Start/Stop Camera Button */}
          <button
            onClick={() => toggleWorker()}
            disabled={workerLoading}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 border ${workerRunning
                ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                : 'bg-red-600 hover:bg-red-700 text-white border-red-600 shadow-red-600/20 shadow-md'
              }`}
          >
            {workerLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : workerRunning ? (
              <Square className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            {workerRunning ? 'Stop Camera' : 'Start Camera'}
          </button>

          {/* Clear Attendance Button */}
          <button
            onClick={() => setShowResetModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-all shadow-sandal-sm active:scale-95"
            title="Clear Today's Attendance Records"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Records</span>
          </button>

          {/* Refresh Attendance List */}
          <button
            onClick={() => {
              fetchTodayAttendance();
              fetchEnrolledCount();
            }}
            className="p-2 rounded-xl bg-white border border-sandal-200 text-red-900/70 hover:text-red-600 hover:bg-sandal-50 transition-all shadow-sandal-sm active:scale-95"
            title="Refresh Attendance List"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-red-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Stats Overview */}
      <StatsCards stats={stats} totalEnrolled={totalEnrolled} />

      {/* Live Video & Latest Match Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        {/* Live Camera Stream Panel */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-4 border border-sandal-200 shadow-sandal-sm flex flex-col">
          {/* Stream Header & Camera Selector */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                <Camera className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-red-950">Live Camera Stream</h3>
            </div>

            {/* Camera Dropdown */}
            <div className="flex items-center gap-1.5 bg-sandal-50 px-2.5 py-1 rounded-xl border border-sandal-200 text-xs">
              <span className="text-red-900/60 font-medium">Source:</span>
              <select
                value={cameraSource}
                onChange={(e) => handleCameraChange(e.target.value)}
                className="bg-transparent text-red-950 font-bold focus:outline-none cursor-pointer pr-1 text-xs"
              >
                {availableCameras.map((cam) => (
                  <option key={cam.id} value={cam.id} className="bg-white text-red-950">
                    {cam.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Custom IP Stream URL Input */}
          {cameraSource === 'custom' && (
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                placeholder="RTSP or HTTP stream URL..."
                value={customIpUrl}
                onChange={(e) => setCustomIpUrl(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-xl bg-sandal-50 border border-sandal-200 text-xs text-red-950 placeholder-red-900/40 focus:outline-none focus:border-red-500"
              />
              <button
                type="button"
                onClick={() => toggleWorker(customIpUrl)}
                disabled={workerLoading || !customIpUrl}
                className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all disabled:opacity-50"
              >
                Connect
              </button>
            </div>
          )}

          {/* Viewport Box (Zero Navy/Black - Warm Sandal Standby) */}
          <CameraStreamViewport
            socket={socket}
            workerRunning={workerRunning}
            workerLoading={workerLoading}
            toggleWorker={toggleWorker}
          />
        </div>

        {/* Latest Verified Match Spotlight */}
        <div className="lg:col-span-1 bg-white rounded-2xl p-4 border border-sandal-200 shadow-sandal-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-red-950">Recent Match</h3>
            </div>

            {latestMatch ? (
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden border border-sandal-200 aspect-[4/3] bg-sandal-50 flex items-center justify-center shadow-inner">
                  {latestMatch.photo ? (
                    <img
                      src={latestMatch.photo}
                      alt={latestMatch.studentName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-14 h-14 rounded-2xl bg-sandal-100 text-red-600 flex items-center justify-center text-lg font-black border border-sandal-300">
                        {(latestMatch.studentName || latestMatch.studentId).slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-xs text-red-900/50">No Photo</span>
                    </div>
                  )}

                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-white/95 text-red-700 text-xs font-bold border border-red-200 shadow-sm">
                    {Math.round((latestMatch.confidence || 0) * 100)}% Match
                  </div>
                </div>

                <div>
                  <h4 className="text-base font-bold text-red-950">
                    {latestMatch.studentName || `Student ${latestMatch.studentId}`}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-sandal-100 text-red-700 font-bold border border-sandal-200">
                      {latestMatch.studentId}
                    </span>
                    <span className="text-xs text-red-900/60 font-medium">
                      {latestMatch.department || 'Computer Science'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-red-900/50 text-xs flex flex-col items-center gap-2">
                <Users className="w-8 h-8 text-sandal-300" />
                <span>Waiting for student at entrance...</span>
              </div>
            )}
          </div>

          {latestMatch && (
            <div className="pt-3 border-t border-sandal-100 flex items-center justify-between text-xs text-red-900/70 font-medium">
              <span>Time: {formatTime(latestMatch.timestamp)}</span>
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Present
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-3 mb-5 flex flex-col md:flex-row items-center justify-between gap-3 border border-sandal-200 shadow-sandal-sm">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-900/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search students..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-sandal-50 border border-sandal-200 text-xs text-red-950 placeholder-red-900/40 focus:outline-none focus:border-red-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full md:w-auto">
          {['ALL', 'MULTIMODAL', 'FACE'].map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${typeFilter === type
                  ? 'bg-red-600 text-white border-red-600 shadow-sm'
                  : 'bg-sandal-50 text-red-900/70 border-sandal-200 hover:bg-sandal-100'
                }`}
            >
              {type === 'ALL' ? 'All' : type === 'MULTIMODAL' ? 'Face + Body' : 'Face Only'}
            </button>
          ))}
        </div>
      </div>

      {/* Attendees Table */}
      <div className="bg-white rounded-2xl border border-sandal-200 overflow-hidden shadow-sandal-sm">
        <div className="px-5 py-3.5 border-b border-sandal-200 flex items-center justify-between bg-sandal-50/50">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-red-600" />
            <h3 className="text-sm font-bold text-red-950">
              Today's Attendance ({filteredStudents.length})
            </h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-sandal-50 border-b border-sandal-200 text-xs font-semibold uppercase tracking-wider text-red-900/70">
                <th className="py-3 px-5">Student</th>
                <th className="py-3 px-5">Roll No</th>
                <th className="py-3 px-5">Time</th>
                <th className="py-3 px-5">Mode</th>
                <th className="py-3 px-5">Score</th>
                <th className="py-3 px-5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sandal-100 text-xs">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-10 text-center text-red-900/50">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <Users className="w-6 h-6 text-sandal-300" />
                      <p className="text-xs font-semibold">No attendance marked yet.</p>
                      <p className="text-[11px] text-red-900/40">Start camera to log students.</p>
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
                      className={`transition-colors duration-300 hover:bg-sandal-50/60 ${isNew ? 'bg-red-50' : ''
                        }`}
                    >
                      {/* Photo Thumbnail + Student Info */}
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-3">
                          {item.photo ? (
                            <img
                              src={item.photo}
                              alt={item.studentName}
                              className="w-9 h-9 rounded-xl object-cover border border-sandal-300 shadow-sm"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-sandal-100 text-red-700 flex items-center justify-center font-bold text-xs border border-sandal-200">
                              {(item.studentName || item.studentId).slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="font-bold text-red-950">
                            {item.studentName || `Student ${item.studentId}`}
                          </div>
                        </div>
                      </td>

                      {/* Student ID */}
                      <td className="py-3 px-5">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-sandal-100 border border-sandal-200 text-red-700">
                          {item.studentId}
                        </span>
                      </td>

                      {/* Timestamp */}
                      <td className="py-3 px-5">
                        <div className="text-red-950 font-semibold">{formatTime(item.timestamp)}</div>
                        <div className="text-[10px] text-red-900/50">{getRelativeMinutes(item.timestamp)}</div>
                      </td>

                      {/* Match Type Badge */}
                      <td className="py-3 px-5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                          {item.matchType === 'Multimodal' ? 'Face + Body' : 'Face'}
                        </span>
                      </td>

                      {/* Confidence Score */}
                      <td className="py-3 px-5">
                        <div className="w-24 space-y-1">
                          <div className="text-[11px] font-bold text-red-950">{confidencePct}%</div>
                          <div className="w-full bg-sandal-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-sandal-400 to-red-600 h-1.5 rounded-full"
                              style={{ width: `${confidencePct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-5 text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Present
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

      {/* Confirmation Modal to Clear Data */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-950/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-sandal-200 p-6 max-w-sm w-full shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-red-950">Clear Today's Attendance Records?</h3>
                <p className="text-xs text-red-900/60">This will reset all attendance entries logged today.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-3 py-1.5 rounded-xl bg-sandal-50 hover:bg-sandal-100 text-red-900 text-xs font-semibold border border-sandal-200"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAllData}
                disabled={resetting}
                className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                {resetting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Clearing...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Records
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
