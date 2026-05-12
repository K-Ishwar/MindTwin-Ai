import { useState, useEffect, useRef } from 'react';
import { useGuardianStore } from '../../stores/guardianStore';
import { useToast } from '../../components/Toast';
import OverviewSection from './sections/OverviewSection';
import PerformanceSection from './sections/PerformanceSection';
import WeeklyReportSection from './sections/WeeklyReportSection';
import ExamReadinessSection from './sections/ExamReadinessSection';
import LinkStudentSection from './sections/LinkStudentSection';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name = '') {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

function roleBadge(role) {
  if (role === 'teacher') return '🏫 Teacher';
  return '👨‍👩‍👧 Parent';
}

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV = [
  { key: 'overview',    icon: '🏠', label: 'Overview' },
  { key: 'performance', icon: '📊', label: 'Performance' },
  { key: 'weekly',      icon: '📋', label: 'Weekly Report' },
  { key: 'exams',       icon: '🎯', label: 'Exam Readiness' },
  { key: 'link',        icon: '🔗', label: 'Link Student' },
];

// ── Student switcher dropdown ─────────────────────────────────────────────────

function StudentSwitcher({ students, selectedId, onSelect, onLinkNew }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = students.find((s) => s.id === selectedId);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 transition text-left"
      >
        {selected ? (
          <>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
              {getInitials(selected.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">{selected.name}</p>
              <p className="text-slate-400 text-xs truncate">
                Grade {selected.grade_level} · {selected.board}
              </p>
            </div>
          </>
        ) : (
          <span className="text-slate-400 text-sm">No student selected</span>
        )}
        <span className="text-slate-500 text-xs ml-auto">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          {students.length === 0 ? (
            <div className="p-3 text-slate-500 text-xs text-center">No linked students</div>
          ) : (
            students.map((s) => (
              <button
                key={s.id}
                onClick={() => { onSelect(s.id); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-700 transition text-left ${
                  s.id === selectedId ? 'bg-indigo-600/20' : ''
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                  {getInitials(s.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{s.name}</p>
                  <p className="text-slate-400 text-xs">Grade {s.grade_level}</p>
                </div>
                {s.id === selectedId && <span className="text-indigo-400 text-xs">✓</span>}
              </button>
            ))
          )}
          <div className="border-t border-slate-700 p-2">
            <button
              onClick={() => { onLinkNew(); setOpen(false); }}
              className="w-full py-2 rounded-lg text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 text-xs font-semibold transition flex items-center justify-center gap-1"
            >
              + Link New Student
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function GuardianDashboard() {
  const { guardian, linkedStudents, selectedStudentId, selectStudent, loadStudents, logout } =
    useGuardianStore();
  const toast = useToast();
  const [activeSection, setActiveSection] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Load students on mount
  useEffect(() => {
    loadStudents().catch(() => {
      toast.error('Failed to load linked students.');
    });
  }, []);

  const handleLogout = () => {
    logout();
    window.location.href = '/guardian/login';
  };

  const handleLinkNew = () => setActiveSection('link');

  const sectionTitle = NAV.find((n) => n.key === activeSection)?.label || 'Overview';

  return (
    <div className="min-h-screen bg-[#0F172A] text-white flex">
      {/* ── Sidebar overlay (mobile) ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── LEFT SIDEBAR ── */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-60 bg-slate-900 border-r border-slate-800 z-40
          flex flex-col transition-transform duration-300
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:flex
        `}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-xl shadow-lg shadow-indigo-500/30 flex-shrink-0">
            🧬
          </div>
          <div>
            <p className="text-white font-black text-sm leading-tight">MindTwin</p>
            <p className="text-slate-500 text-xs">Guardian Portal</p>
          </div>
        </div>

        {/* Student switcher */}
        <div className="px-3 py-4 border-b border-slate-800">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2 px-1">
            Viewing
          </p>
          <StudentSwitcher
            students={linkedStudents}
            selectedId={selectedStudentId}
            onSelect={selectStudent}
            onLinkNew={handleLinkNew}
          />
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => { setActiveSection(item.key); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                activeSection === item.key
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Guardian info + logout */}
        <div className="px-3 py-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
              {getInitials(guardian?.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{guardian?.name}</p>
              <span className="text-xs text-indigo-400">{roleBadge(guardian?.role)}</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 text-xs font-semibold transition flex items-center justify-center gap-2"
          >
            🚪 Sign Out
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-slate-900/80 backdrop-blur border-b border-slate-800 px-4 sm:px-6 py-4 flex items-center gap-4">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition"
            aria-label="Open sidebar"
          >
            ☰
          </button>

          <div>
            <h1 className="text-white font-bold text-lg leading-tight">{sectionTitle}</h1>
            {selectedStudentId && linkedStudents.find((s) => s.id === selectedStudentId) && (
              <p className="text-slate-500 text-xs">
                {linkedStudents.find((s) => s.id === selectedStudentId)?.name}
              </p>
            )}
          </div>

          {/* No-student warning */}
          {!selectedStudentId && activeSection !== 'link' && (
            <button
              onClick={() => setActiveSection('link')}
              className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/30 transition"
            >
              + Link a student
            </button>
          )}
        </header>

        {/* Section content */}
        <div className="flex-1 px-4 sm:px-6 py-6 max-w-5xl w-full mx-auto">
          {activeSection === 'overview' && (
            <OverviewSection studentId={selectedStudentId} />
          )}
          {activeSection === 'performance' && (
            <PerformanceSection studentId={selectedStudentId} />
          )}
          {activeSection === 'weekly' && (
            <WeeklyReportSection studentId={selectedStudentId} />
          )}
          {activeSection === 'exams' && (
            <ExamReadinessSection studentId={selectedStudentId} />
          )}
          {activeSection === 'link' && <LinkStudentSection />}
        </div>
      </main>
    </div>
  );
}
