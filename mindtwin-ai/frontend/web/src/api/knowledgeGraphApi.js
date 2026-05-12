import api from './axios';

export const knowledgeGraphApi = {
  /** List all loaded graphs (subject + board + grade combos) */
  listAvailable: () =>
    api.get('/api/ai/knowledge-graph/available').then(r => r.data),

  /** Get subjects available for a board + grade */
  getAvailableSubjects: (board, grade) =>
    api.get('/api/ai/knowledge-graph/available/subjects', { params: { board, grade } })
      .then(r => r.data),

  /** Full graph for a subject */
  getGraph: (subject, board, grade) => {
    const enc = s => encodeURIComponent(s.replace(/ /g, '-'));
    return api.get(`/api/ai/knowledge-graph/${enc(subject)}/${enc(board)}/${enc(grade)}`)
      .then(r => r.data);
  },

  /** Learning order for a set of topic IDs */
  getLearningOrder: (topicIds, subject, board, grade) =>
    api.post('/api/ai/knowledge-graph/learning-order', {
      topic_ids: topicIds, subject, board, grade,
    }).then(r => r.data),

  /** Root-cause gap analysis */
  getRootCauseGaps: (gapTopicIds, subject, board, grade) =>
    api.post('/api/ai/knowledge-graph/root-cause-gaps', {
      gap_topic_ids: gapTopicIds, subject, board, grade,
    }).then(r => r.data),

  /** Student mastery data (from analytics) */
  getMastery: () =>
    api.get('/api/analytics/progress').then(r => r.data).catch(() => ({ mastery: { subjects: [] } })),

  /** Student quiz attempts for theta values */
  getQuizAttempts: () =>
    api.get('/api/quiz/gaps').then(r => r.data).catch(() => ({ all_topics: [] })),
};
