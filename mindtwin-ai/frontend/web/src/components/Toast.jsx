import { createContext, useContext, useState, useCallback, useRef } from 'react';

// ── Context ────────────────────────────────────────────────────────────────────
const ToastContext = createContext(null);

const VARIANTS = {
  success: { bg: 'bg-emerald-600',  icon: '✓', border: 'border-emerald-500' },
  error:   { bg: 'bg-red-600',      icon: '✕', border: 'border-red-500'     },
  warning: { bg: 'bg-amber-500',    icon: '!', border: 'border-amber-400'   },
  info:    { bg: 'bg-indigo-600',   icon: 'ℹ', border: 'border-indigo-500'  },
};

// ── Individual Toast ───────────────────────────────────────────────────────────
function Toast({ id, message, variant = 'info', onDismiss }) {
  const cfg = VARIANTS[variant] || VARIANTS.info;
  return (
    <div
      className={`
        flex items-start gap-3 px-4 py-3 rounded-2xl shadow-2xl border
        bg-slate-800 ${cfg.border} text-white text-sm
        animate-[slideIn_0.25s_ease_forwards]
        max-w-sm w-full pointer-events-auto
      `}
      style={{ animation: 'slideIn 0.25s ease forwards' }}
      role="alert"
    >
      {/* Icon bubble */}
      <span className={`${cfg.bg} rounded-xl w-6 h-6 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 mt-0.5`}>
        {cfg.icon}
      </span>

      {/* Message */}
      <span className="flex-1 text-slate-100 leading-snug">{message}</span>

      {/* Dismiss */}
      <button
        onClick={() => onDismiss(id)}
        className="text-slate-500 hover:text-white transition text-lg leading-none flex-shrink-0 -mt-0.5"
      >
        ×
      </button>
    </div>
  );
}

// ── Toast Container ────────────────────────────────────────────────────────────
function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(100%); }
          to   { opacity: 1; transform: translateX(0);    }
        }
      `}</style>
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <Toast key={t.id} {...t} onDismiss={onDismiss} />
        ))}
      </div>
    </>
  );
}

// ── Provider ───────────────────────────────────────────────────────────────────
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const toast = useCallback((message, variant = 'info', duration = 3000) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-4), { id, message, variant }]); // max 5 toasts
    if (duration > 0) {
      timers.current[id] = setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  // Convenience helpers
  toast.success = (msg, dur) => toast(msg, 'success', dur);
  toast.error   = (msg, dur) => toast(msg, 'error', dur);
  toast.warning = (msg, dur) => toast(msg, 'warning', dur);
  toast.info    = (msg, dur) => toast(msg, 'info', dur);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
