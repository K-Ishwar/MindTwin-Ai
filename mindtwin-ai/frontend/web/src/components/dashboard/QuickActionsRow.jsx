import { Link } from 'react-router-dom';

const ACTIONS = [
  { label: 'Take a Quiz',    emoji: '🧠', to: '/quiz',          color: 'from-indigo-600 to-violet-600' },
  { label: 'View Gaps',      emoji: '📊', to: '/gaps',          color: 'from-amber-600 to-orange-600' },
  { label: 'My Progress',    emoji: '📈', to: '/progress',      color: 'from-emerald-600 to-teal-600' },
  { label: 'Knowledge Map',  emoji: '🕸', to: '/knowledge-map', color: 'from-blue-600 to-cyan-600' },
];

export default function QuickActionsRow() {
  return (
    <div className="grid grid-cols-4 gap-3">
      {ACTIONS.map((action) => (
        <Link
          key={action.to}
          to={action.to}
          className={`bg-gradient-to-br ${action.color} rounded-2xl p-4 flex flex-col items-center gap-2 hover:opacity-90 hover:scale-105 transition-all duration-200 shadow-lg`}
        >
          <span className="text-2xl">{action.emoji}</span>
          <span className="text-white text-xs font-semibold text-center leading-tight">
            {action.label}
          </span>
        </Link>
      ))}
    </div>
  );
}
