import { useState } from 'react';
import { useOnboardingStore } from '../../stores/onboardingStore';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';

export default function OnboardingStep3_Exams() {
  const { examDates, setExamDates, nextStep } = useOnboardingStore();
  const [subject, setSubject] = useState('');
  const [date, setDate] = useState('');
  const [board, setBoard] = useState('CBSE');
  const [error, setError] = useState('');

  const addExam = () => {
    if (!subject.trim()) { setError('Subject name is required'); return; }
    if (!date) { setError('Please pick an exam date'); return; }
    setError('');
    setExamDates([...examDates, { subject: subject.trim(), exam_date: date, board }]);
    setSubject('');
    setDate('');
  };

  const removeExam = (idx) => {
    setExamDates(examDates.filter((_, i) => i !== idx));
  };

  const handleContinue = () => {
    if (examDates.length === 0) { setError('Add at least one exam to continue'); return; }
    nextStep();
  };

  return (
    <OnboardingLayout>
      <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700/50">
        <h2 className="text-2xl font-bold text-white mb-1">When are your exams?</h2>
        <p className="text-slate-400 text-sm mb-6">
          Add each exam you're preparing for — we'll build your schedule around them.
        </p>

        {/* Add Exam Form */}
        <div className="flex flex-col gap-3 mb-4">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject (e.g. Mathematics)"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            />
            <select
              value={board}
              onChange={(e) => setBoard(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm"
            >
              {['CBSE', 'ICSE', 'Maharashtra State Board', 'Telangana Board', 'Other'].map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <button
            onClick={addExam}
            className="py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-semibold transition text-sm border border-slate-600"
          >
            + Add Exam
          </button>
        </div>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        {/* Exam Chips */}
        {examDates.length > 0 && (
          <div className="flex flex-col gap-2 mb-5">
            <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Added Exams</p>
            {examDates.map((ex, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between bg-indigo-900/30 border border-indigo-500/30 rounded-xl px-4 py-2.5"
              >
                <div>
                  <span className="text-white font-medium text-sm">{ex.subject}</span>
                  <span className="text-slate-400 text-xs ml-2">{ex.exam_date}</span>
                  <span className="text-indigo-400 text-xs ml-2">{ex.board}</span>
                </div>
                <button
                  onClick={() => removeExam(idx)}
                  className="text-slate-500 hover:text-red-400 transition text-lg leading-none ml-2"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleContinue}
          className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-base transition-all duration-200 shadow-lg shadow-indigo-500/30"
        >
          Continue →
        </button>
      </div>
    </OnboardingLayout>
  );
}
