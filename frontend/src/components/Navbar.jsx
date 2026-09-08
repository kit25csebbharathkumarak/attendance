import React, { useState, useEffect } from 'react';
import { Camera, Radio, Users, UserPlus, Clock } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export const Navbar = ({ activeTab, setActiveTab }) => {
  const { isConnected } = useSocket();
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-white/10 px-6 py-3.5 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand & Entrance Info */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-accent-cyan flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Camera className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">AttendAI</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 font-medium border border-brand-500/20">
                Multimodal Edge
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Classroom 301 Doorway Camera • 65 Students Cohort
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center p-1 rounded-xl bg-dark-900 border border-white/5 text-sm">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'dashboard'
                ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Users className="w-4 h-4" />
            Live Dashboard
          </button>
          <button
            onClick={() => setActiveTab('enrollment')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'enrollment'
                ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            Enrollment
          </button>
        </nav>

        {/* Status Pills */}
        <div className="flex items-center gap-3">
          {/* Real-time Clock */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-900/80 border border-white/5 text-xs text-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{currentTime}</span>
          </div>

          {/* WebSocket Live Pill */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              isConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-400 live-pulse' : 'bg-rose-500'
              }`}
            />
            <span>{isConnected ? 'LIVE WEBSOCKET' : 'OFFLINE'}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
