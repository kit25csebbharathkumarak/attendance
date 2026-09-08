import React, { useState } from 'react';
import { SocketProvider } from './context/SocketContext';
import { Navbar } from './components/Navbar';
import { Dashboard } from './pages/Dashboard';
import { Enrollment } from './pages/Enrollment';

export const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <SocketProvider>
      <div className="min-h-screen bg-dark-950 flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
        {/* Navigation Header */}
        <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Main Application Body */}
        <main className="flex-1">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'enrollment' && <Enrollment />}
        </main>

        {/* Global Footer */}
        <footer className="glass-panel border-t border-white/5 py-4 px-6 text-center text-xs text-slate-500 mt-auto">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>Multimodal Automatic Attendance System • Production Ready Edge Prototype</span>
            <span>Stack: YOLOv8 + DeepFace • Node.js Socket.IO • React Tailwind</span>
          </div>
        </footer>
      </div>
    </SocketProvider>
  );
};

export default App;
