import React from 'react';
import { Users, ScanFace, Activity, ShieldCheck } from 'lucide-react';

export const StatsCards = ({ stats, totalCapacity = 65 }) => {
  const attendanceRate = totalCapacity > 0
    ? Math.min(100, Math.round((stats.totalPresent / totalCapacity) * 100))
    : 0;

  const cards = [
    {
      label: 'Class Attendance',
      value: `${stats.totalPresent} / ${totalCapacity}`,
      subtext: `${attendanceRate}% cohort present`,
      icon: Users,
      color: 'text-brand-400',
      bg: 'bg-brand-500/10 border-brand-500/20',
      progress: attendanceRate,
    },
    {
      label: 'Multimodal Matches',
      value: stats.multimodalCount,
      subtext: 'Dual Face + Body validated',
      icon: ShieldCheck,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
    },
    {
      label: 'Face-Only Matches',
      value: stats.faceCount,
      subtext: 'Direct facial crop verification',
      icon: ScanFace,
      color: 'text-accent-violet',
      bg: 'bg-violet-500/10 border-violet-500/20',
    },
    {
      label: 'Avg Model Confidence',
      value: `${(stats.avgConfidence * 100).toFixed(1)}%`,
      subtext: 'YOLOv8 + DeepFace score',
      icon: Activity,
      color: 'text-accent-cyan',
      bg: 'bg-cyan-500/10 border-cyan-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="glass-card rounded-2xl p-5 hover:border-white/20 transition-all shadow-lg group"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  {card.label}
                </span>
                <div className="text-2xl font-extrabold text-white mt-1 group-hover:scale-105 transition-transform origin-left">
                  {card.value}
                </div>
              </div>
              <div className={`p-2.5 rounded-xl border ${card.bg}`}>
                <Icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </div>

            {card.progress !== undefined ? (
              <div className="space-y-1.5 mt-2">
                <div className="w-full bg-dark-900 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-brand-500 to-emerald-400 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${card.progress}%` }}
                  />
                </div>
                <div className="text-xs text-slate-400 flex justify-between">
                  <span>{card.subtext}</span>
                  <span className="font-semibold text-slate-300">{card.progress}%</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">{card.subtext}</p>
            )}
          </div>
        );
      })}
    </div>
  );
};
