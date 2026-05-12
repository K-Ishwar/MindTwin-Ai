import { useState } from 'react';
import { useAdminStore } from '../../stores/adminStore';
import PlatformStats   from './sections/PlatformStats';
import StudentsPage    from './sections/StudentsPage';
import GuardiansPage   from './sections/GuardiansPage';
import NotificationsPage from './sections/NotificationsPage';
import AIModelsPage    from './sections/AIModelsPage';
import SystemHealth    from './sections/SystemHealth';

const NAV = [
  { key: 'stats',         icon: '📊', label: 'Platform Stats' },
  { key: 'students',      icon: '🎓', label: 'Students' },
  { key: 'guardians',     icon: '👨‍👩‍👧', label: 'Guardians' },
  { key: 'notifications', icon: '🔔', label: 'Notifications' },
  { key: 'ai',            icon: '🤖', label: 'AI Models' },
  { key: 'health',        icon: '💚', label: 'System Health' },
];

export default function AdminDashboard() {
  const { admin, logout } = useAdminStore();
  const [active, setActive] = useState('stats');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    window.location.href = '/admin/login';
  };

  const sectionLabel = NAV.find((n) => n.key === active)?.label || 'Dashboard';

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/70 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── SIDEBAR ── */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-56 bg-slate-900 border-r border-slate-800 z-40
          flex flex-col transition-transform duration-300
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:flex
        `}
      >
        {/* Brand */}
        <div className="px-5 py-5 border-b border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center text-xl shadow-lg shadow-violet-500/30 flex-shrink-0">
            🛡️
          </div>
          <div>
            <p className="text-white font-black text-sm leading-tight">MindTwin</p>
            <p className="text-slate-500 text-xs">Admin Panel</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => { setActive(item.key); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                active === item.key
                  ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Admin info + logout */}
        <div className="px-3 py-4 border-t border-slate-800">
          <div className="px-2 mb-3">
            <p className="text-white text-xs font-semibold truncate">{admin?.name}</p>
            <p className="text-slate-500 text-xs truncate">{admin?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 text-xs font-semibold transition flex items-center justify-center gap-2"
          >
            🚪 Sign Out
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur border-b border-slate-800 px-4 sm:px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition"
            aria-label="Open sidebar"
          >
            ☰
          </button>
          <div>
            <h1 className="text-white font-bold text-lg">{sectionLabel}</h1>
            <p className="text-slate-600 text-xs">MindTwin Admin · {new Date().toLocaleDateString()}</p>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 px-4 sm:px-6 py-6 max-w-6xl w-full mx-auto">
          {active === 'stats'         && <PlatformStats />}
          {active === 'students'      && <StudentsPage />}
          {active === 'guardians'     && <GuardiansPage />}
          {active === 'notifications' && <NotificationsPage />}
          {active === 'ai'            && <AIModelsPage />}
          {active === 'health'        && <SystemHealth />}
        </div>
      </main>
    </div>
  );
}
