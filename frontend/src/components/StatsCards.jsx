import React from 'react';
import { Users, ScanFace, Activity, ShieldCheck } from 'lucide-react';

export const StatsCards = ({ stats, totalCapacity = 65 }) => {
  const attendanceRate = totalCapacity > 0
    ? Math.min(100, Math.round((stats.totalPresent / totalCapacity) * 100))
    : 0;

  const cards = [
    {
      label: 'Attendance',
      value: `${stats.totalPresent} / ${totalCapacity}`,
      subtext: `${attendanceRate}% Present`,
      icon: Users,
      color: 'text-red-600',
      bg: 'bg-red-50 border-red-200',
      progress: attendanceRate,
    },
    {
      label: 'Verified',
      value: stats.multimodalCount,
      subtext: 'Face + Body',
      icon: ShieldCheck,
      color: 'text-red-600',
      bg: 'bg-sandal-100 border-sandal-300',
    },
    {
      label: 'Face Match',
      value: stats.faceCount,
      subtext: 'Facial recognition',
      icon: ScanFace,
      color: 'text-sandal-600',
      bg: 'bg-sandal-100 border-sandal-300',
    },
    {
      label: 'Accuracy',
      value: `${(stats.avgConfidence * 100).toFixed(0)}%`,
      subtext: 'Average score',
      icon: Activity,
      color: 'text-red-600',
      bg: 'bg-red-50 border-red-200',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="bg-white rounded-2xl p-4 border border-sandal-200 shadow-sandal-sm hover:shadow-sandal-md hover:border-sandal-300 transition-all group"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <span className="text-xs font-semibold text-red-900/60 uppercase tracking-wider">
                  {card.label}
                </span>
                <div className="text-2xl font-black text-red-950 mt-0.5 group-hover:text-red-600 transition-colors">
                  {card.value}
                </div>
              </div>
              <div className={`p-2 rounded-xl border ${card.bg}`}>
                <Icon className={`w-4 h-4 ${card.color}`} />
              </div>
            </div>

            {card.progress !== undefined ? (
              <div className="space-y-1 mt-2">
                <div className="w-full bg-sandal-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-sandal-400 to-red-600 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${card.progress}%` }}
                  />
                </div>
                <div className="text-[11px] text-red-900/60 flex justify-between font-medium">
                  <span>{card.subtext}</span>
                  <span className="font-bold text-red-600">{card.progress}%</span>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-red-900/60 font-medium">{card.subtext}</p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default StatsCards;

