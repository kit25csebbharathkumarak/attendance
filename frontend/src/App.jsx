import React, { useState } from 'react';
import { SocketProvider } from './context/SocketContext';
import { Navbar } from './components/Navbar';
import { Dashboard } from './pages/Dashboard';
import { Enrollment } from './pages/Enrollment';

export const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <SocketProvider>
      <div className="min-h-screen flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
        {/* Navigation Header */}
        <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Main Application Body */}
        <main className="flex-1">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'enrollment' && <Enrollment />}
        </main>

        {/* Clean Footer */}
        <footer className="border-t border-sandal-200 bg-white/70 py-4 px-6 text-center text-xs text-red-950/60 mt-auto">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>
              <strong className="text-red-700 font-semibold">AttendAI</strong> • Smart Attendance System
            </span>
            <span className="text-red-900/50">
              Room 301 • Real-time Monitoring
            </span>
          </div>
        </footer>
      </div>
    </SocketProvider>
  );
};

export default App;

