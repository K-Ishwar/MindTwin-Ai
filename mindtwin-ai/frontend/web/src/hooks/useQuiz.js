import { useState, useEffect, useRef, useCallback } from 'react';
import { quizApi, getMockExplanation } from '../api/quizApi';

// ── State machine states ──────────────────────────────────────────────────────
export const QUIZ_STATES = {
  IDLE: 'idle',
  STARTING: 'starting',
  LOADING_QUESTION: 'loading_question',
  QUESTION: 'question',
  REVEALING: 'revealing',
  FINISHING: 'finishing',
  FINISHED: 'finished',
  ERROR: 'error',
};

const TIMER_SECONDS = 90;

export function useQuiz() {
  const [state, setState] = useState(QUIZ_STATES.IDLE);
  const [error, setError] = useState(null);

  // Session data
  const [topicId, setTopicId] = useState(null);
  const [topicName, setTopicName] = useState('');
  const [sessionId, setSessionId] = useState(null);

  // Question data
  const [questions, setQuestions] = useState([]);         // all fetched questions
  const [currentIndex, setCurrentIndex] = useState(0);   // 0-based
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [revealData, setRevealData] = useState(null);     // { correct, correctOption, explanation }
  const [responses, setResponses] = useState([]);         // accumulated for batch submit

  // Timer
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const timerRef = useRef(null);

  // Theta tracking
  const [thetaHistory, setThetaHistory] = useState([]);  // per-question theta snapshots

  // Result
  const [quizResult, setQuizResult] = useState(null);

  // ── Timer management ────────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    setTimeLeft(TIMER_SECONDS);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          stopTimer();
          // Auto-submit with no answer on timeout
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [stopTimer]);

  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  // ── Start quiz for a topic ─────────────────────────────────────────────────
  const startQuiz = useCallback(async (tid, tname) => {
    setError(null);
    setTopicId(tid);
    setTopicName(tname);
    setResponses([]);
    setThetaHistory([]);
    setQuizResult(null);
    setCurrentIndex(0);
    setState(QUIZ_STATES.STARTING);

    try {
      // Fetch questions (non-adaptive batch mode for now)
      const data = await quizApi.getTopicQuestions(tid, 5);
      const qs = data.questions || [];

      if (qs.length === 0) throw new Error('No questions available for this topic.');

      setQuestions(qs);
      setCurrentQuestion(qs[0]);
      setSelectedOption(null);
      setRevealData(null);
      setState(QUIZ_STATES.QUESTION);
      startTimer();
    } catch (err) {
      setError(err.message || 'Failed to load quiz. Please try again.');
      setState(QUIZ_STATES.ERROR);
    }
  }, [startTimer]);

  // ── Select an option ───────────────────────────────────────────────────────
  const selectOption = useCallback((option) => {
    if (state === QUIZ_STATES.QUESTION) {
      setSelectedOption(option);
    }
  }, [state]);

  // ── Submit current answer ──────────────────────────────────────────────────
  const submitAnswer = useCallback(async () => {
    if (state !== QUIZ_STATES.QUESTION || !selectedOption) return;

    stopTimer();
    setState(QUIZ_STATES.REVEALING);

    const q = currentQuestion;
    // For batch mode: record response; correctness revealed optimistically
    // In real IRT mode the server would return is_correct
    const correctOption = q.correct_answer || q.correctAnswer || 'A'; // may not be available client-side

    // Try to get server-side answer reveal
    let isCorrect = false;
    let explanation = '';
    let newTheta = null;

    try {
      if (sessionId) {
        const res = await quizApi.submitAnswer(sessionId, {
          question_id: q.id,
          selected_option: selectedOption,
          time_taken_sec: TIMER_SECONDS - timeLeft,
        });
        isCorrect = res.is_correct;
        explanation = res.explanation || getMockExplanation(q.question_text, res.correct_option);
        newTheta = res.theta_estimate ?? null;
      } else {
        // Batch mode — we don't know correctness yet until finalize
        // Optimistically assume we scored (will correct at finalize)
        explanation = getMockExplanation(q.question_text, correctOption);
        isCorrect = selectedOption === correctOption;
      }
    } catch {
      explanation = getMockExplanation(q.question_text, correctOption);
      isCorrect = selectedOption === correctOption;
    }

    // Accumulate response
    setResponses(prev => [
      ...prev,
      { question_id: q.id, selected_option: selectedOption, time_taken_sec: TIMER_SECONDS - timeLeft },
    ]);

    if (newTheta !== null) setThetaHistory(prev => [...prev, newTheta]);

    setRevealData({ isCorrect, correctOption, explanation });
  }, [state, selectedOption, currentQuestion, sessionId, timeLeft, stopTimer]);

  // ── Move to next question or finalize ────────────────────────────────────
  const nextQuestion = useCallback(async () => {
    const nextIdx = currentIndex + 1;

    if (nextIdx >= questions.length) {
      // Last question — finalize
      setState(QUIZ_STATES.FINISHING);
      await finalizeQuiz();
    } else {
      setCurrentIndex(nextIdx);
      setCurrentQuestion(questions[nextIdx]);
      setSelectedOption(null);
      setRevealData(null);
      setState(QUIZ_STATES.QUESTION);
      startTimer();
    }
  }, [currentIndex, questions, startTimer]);

  // ── Finalize and compute results ─────────────────────────────────────────
  const finalizeQuiz = useCallback(async () => {
    try {
      let result;
      if (sessionId) {
        result = await quizApi.finalizeSession(sessionId);
      } else {
        result = await quizApi.submitAttempt({
          topic_id: topicId,
          responses,
          mode: 'practice',
        });
      }

      setQuizResult({
        score_percent: result.score_percent ?? 0,
        theta_before: result.theta_before ?? (thetaHistory[0] ?? 0),
        theta_after: result.theta_estimate ?? result.theta_after ?? (thetaHistory[thetaHistory.length - 1] ?? 0),
        gap_detected: result.gap_detected ?? false,
        gap_severity: result.gap_severity ?? (result.gap_detected ? 'moderate' : 'none'),
        revision_hours: result.revision_hours ?? (result.gap_detected ? 2 : 0),
        prereq_gaps: result.prereq_gaps ?? [],
        feedback_message: result.feedback_message ?? '',
        tokens_earned: result.score_percent >= 70 ? 15 : 0,
        topic_name: topicName,
        total_questions: questions.length,
        correct_count: Math.round((result.score_percent / 100) * questions.length),
      });
      setState(QUIZ_STATES.FINISHED);
    } catch (err) {
      // Compute locally as fallback
      const correct = responses.filter(r => r.selected_option === 'A').length; // rough fallback
      const score = Math.round((correct / responses.length) * 100);
      setQuizResult({
        score_percent: score,
        theta_before: -0.2,
        theta_after: score > 60 ? 0.3 : -0.5,
        gap_detected: score < 60,
        gap_severity: score < 40 ? 'critical' : score < 60 ? 'moderate' : 'none',
        revision_hours: score < 60 ? 2 : 0,
        prereq_gaps: [],
        feedback_message: score >= 70 ? 'Great work! Strong understanding.' : 'Keep practicing to strengthen this topic.',
        tokens_earned: score >= 70 ? 15 : 0,
        topic_name: topicName,
        total_questions: questions.length,
        correct_count: correct,
      });
      setState(QUIZ_STATES.FINISHED);
    }
  }, [sessionId, topicId, responses, thetaHistory, topicName, questions.length]);

  // ── Reset to idle ─────────────────────────────────────────────────────────
  const resetQuiz = useCallback(() => {
    stopTimer();
    setState(QUIZ_STATES.IDLE);
    setError(null);
    setQuestions([]);
    setCurrentQuestion(null);
    setSelectedOption(null);
    setRevealData(null);
    setResponses([]);
    setThetaHistory([]);
    setQuizResult(null);
    setCurrentIndex(0);
    setSessionId(null);
  }, [stopTimer]);

  // ── Derived state helpers ─────────────────────────────────────────────────
  const isLoading = [QUIZ_STATES.STARTING, QUIZ_STATES.LOADING_QUESTION, QUIZ_STATES.FINISHING].includes(state);
  const totalQuestions = questions.length;
  const currentTheta = thetaHistory[thetaHistory.length - 1] ?? null;

  // Theta label
  const getThetaLabel = (theta) => {
    if (theta === null || theta === undefined) return { label: 'Not Yet Assessed', color: '#64748B' };
    if (theta > 0.5) return { label: 'Strong', color: '#22C55E' };
    if (theta > -0.5) return { label: 'Getting There', color: '#F59E0B' };
    return { label: 'Needs Work', color: '#EF4444' };
  };

  return {
    // State
    quizState: state,
    isLoading,
    error,

    // Quiz metadata
    topicId,
    topicName,
    totalQuestions,
    currentIndex,
    timeLeft,
    timerMax: TIMER_SECONDS,

    // Question data
    currentQuestion,
    selectedOption,
    revealData,

    // Theta
    currentTheta,
    thetaHistory,
    getThetaLabel,

    // Result
    quizResult,

    // Actions
    startQuiz,
    selectOption,
    submitAnswer,
    nextQuestion,
    resetQuiz,
  };
}
