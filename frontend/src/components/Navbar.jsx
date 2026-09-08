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
    <header className="sticky top-0 z-40 w-full bg-white/90 border-b border-sandal-200 px-6 py-3 backdrop-blur-md shadow-sandal-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center shadow-md shadow-red-600/20 text-white">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-red-900">
                Attend<span className="text-red-600">AI</span>
              </h1>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-sandal-100 text-sandal-800 font-semibold border border-sandal-300">
                Room 301
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center p-1 rounded-xl bg-sandal-50 border border-sandal-200 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all ${
              activeTab === 'dashboard'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-red-900/70 hover:text-red-900 hover:bg-sandal-100'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('enrollment')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all ${
              activeTab === 'enrollment'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-red-900/70 hover:text-red-900 hover:bg-sandal-100'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Enroll Student
          </button>
        </nav>

        {/* Status */}
        <div className="flex items-center gap-2.5">
          {/* Real-time Clock */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sandal-100 border border-sandal-200 text-xs font-medium text-red-900/80">
            <Clock className="w-3.5 h-3.5 text-red-600" />
            <span>{currentTime}</span>
          </div>

          {/* Connection Status Pill */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
              isConnected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-500 live-pulse' : 'bg-red-500'
              }`}
            />
            <span>{isConnected ? 'Online' : 'Offline'}</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;

