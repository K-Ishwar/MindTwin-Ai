import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../api/dashboardApi';
import { useDashboard } from '../hooks/useDashboard';
import { useToast } from '../components/Toast';
import TodayPlanCard from '../components/dashboard/TodayPlanCard';
import QuickStatsRow from '../components/dashboard/QuickStatsRow';
import StressPulseWidget from '../components/dashboard/StressPulseWidget';
import UpcomingExamsCard from '../components/dashboard/UpcomingExamsCard';
import QuickActionsRow from '../components/dashboard/QuickActionsRow';
import SessionModal from '../components/dashboard/SessionModal';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

export default function Dashboard() {
  const {
    todaySessions, exams, profile, tokenBalance, earnedToday,
    stressScore, isLoading, refetchSessions, refetchTokens, refetchAll,
  } = useDashboard();

  const queryClient = useQueryClient();
  const toast = useToast();
  const [activeSession, setActiveSession] = useState(null);

  const name = profile?.name || 'Student';
  const initials = getInitials(name);

  // Compute streak from profile (fallback to 0)
  const streak = profile?.streak_days ?? 0;

  const [notifOpen, setNotifOpen] = useState(false);
  
  const { data: notifData, refetch: refetchNotifs } = useQuery({
    queryKey: ['notifications'],
    queryFn: dashboardApi.getNotifications,
    refetchInterval: 30000,
  });

  const notifications = notifData?.notifications || [];
  const unreadCount = notifData?.unread_count || 0;

  const handleMarkRead = async (id) => {
    await dashboardApi.markNotificationRead(id);
    refetchNotifs();
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      {/* Red Banner for High Stress */}
      {stressScore >= 0.8 && (
        <div className="bg-red-500/90 text-white px-4 py-3 text-center text-sm font-bold shadow-lg flex items-center justify-center gap-2">
          <span>🚨</span> High stress detected — check your wellness
          <Link to="/stress" className="underline ml-2 hover:text-red-200">View Stress Monitor</Link>
        </div>
      )}

      {/* ── Background subtle radial glow ── */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99,102,241,0.15) 0%, transparent 60%)',
        }}
      />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5 z-10">

        {/* ═══ HEADER ═══ */}
        <header className="flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-sm">{getGreeting()},</p>
            <h1 className="text-white font-black text-2xl sm:text-3xl mt-0.5">
              {name} <span className="wave inline-block">👋</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Notification bell */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 hover:border-indigo-500/50 flex items-center justify-center text-slate-400 hover:text-white transition"
              >
                🔔
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-indigo-500 rounded-full border border-slate-800" />
                )}
              </button>
              
              {/* Notification Dropdown */}
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="p-3 border-b border-slate-700 font-bold flex justify-between items-center">
                    <span>Notifications</span>
                    {unreadCount > 0 && (
                      <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">{unreadCount} new</span>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-sm text-slate-500">No notifications</div>
                    ) : (
                      notifications.slice(0, 5).map(n => (
                        <div 
                          key={n.id} 
                          className={`p-3 border-b border-slate-700/50 hover:bg-slate-700/30 transition cursor-pointer ${!n.read ? 'bg-indigo-500/5' : ''}`}
                          onClick={() => { if(!n.read) handleMarkRead(n.id); }}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-semibold text-sm text-white">{n.title}</span>
                            {!n.read && <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1"></span>}
                          </div>
                          <p className="text-xs text-slate-400">{n.body}</p>
                          <span className="text-[10px] text-slate-500 mt-2 block">
                            {new Date(n.created_at).toLocaleString()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="p-2 border-t border-slate-700 text-center bg-slate-800/80">
                    <button className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold" onClick={() => setNotifOpen(false)}>Close</button>
                  </div>
                </div>
              )}
            </div>

            {/* Avatar */}
            <Link
              to="/profile"
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-indigo-500/30 hover:scale-105 transition"
            >
              {initials}
            </Link>
          </div>
        </header>

        {/* ═══ QUICK ACTIONS ═══ */}
        <QuickActionsRow />

        {/* ═══ TODAY'S PLAN (main card) ═══ */}
        <TodayPlanCard
          sessions={todaySessions}
          isLoading={isLoading}
          onStartSession={(session) => setActiveSession(session)}
          onPlanGenerated={() => {
            refetchSessions();
            toast.success('Study plan generated! Your schedule is ready.');
          }}
          onPlanError={(msg) => toast.error(msg)}
        />

        {/* ═══ QUICK STATS ═══ */}
        <QuickStatsRow
          sessions={todaySessions}
          tokenBalance={tokenBalance}
          earnedToday={earnedToday}
          streak={streak}
          isLoading={isLoading}
        />

        {/* ═══ 2-COLUMN SECTION (stress + exams) ═══ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Link to="/stress" className={`block rounded-2xl transition ${stressScore >= 0.6 ? 'ring-2 ring-amber-500/50 animate-pulse' : 'hover:ring-2 hover:ring-indigo-500/50'}`}>
            <StressPulseWidget stressScore={stressScore} isLoading={isLoading} />
          </Link>
          <UpcomingExamsCard exams={exams} isLoading={isLoading} />
        </div>

        {/* ═══ FOOTER LABEL ═══ */}
        <p className="text-center text-slate-700 text-xs pb-4">
          MindTwin AI · Your digital study companion
        </p>
      </div>

      {/* ═══ SESSION MODAL ═══ */}
      {activeSession && (
        <SessionModal
          session={activeSession}
          onClose={() => setActiveSession(null)}
          onComplete={() => { refetchSessions(); refetchTokens(); }}
        />
      )}

      {/* Wave animation */}
      <style>{`
        .wave { animation: wave 2.5s infinite; transform-origin: 70% 70%; }
        @keyframes wave {
          0%,100% { transform: rotate(0deg); }
          10%,30%  { transform: rotate(-15deg); }
          20%,40%  { transform: rotate(14deg); }
          50%      { transform: rotate(-4deg); }
          60%      { transform: rotate(10deg); }
          70%      { transform: rotate(0deg); }
        }
      `}</style>
    </div>
  );
}
