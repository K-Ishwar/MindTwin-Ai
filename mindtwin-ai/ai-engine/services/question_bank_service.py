"""
Question Bank Service
=====================
Provides question retrieval and stats update for the adaptive quiz engine.
Connects directly to PostgreSQL using psycopg2.

Used by the IRT quiz router to fetch questions with their calibrated
3PL parameters (irt_a, irt_b, irt_c) for adaptive selection.
"""

import os
import psycopg2
import psycopg2.extras
from typing import Optional


DATABASE_URL = os.getenv("DATABASE_URL", "postgres://user:password@postgres:5432/mindtwin_db")


def _get_conn():
    """Open a new PostgreSQL connection."""
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


class QuestionBankService:
    """
    Retrieves and updates questions in the questions table.

    All queries use the IRT parameters (irt_a, irt_b, irt_c) that are
    stored alongside the question content, enabling the IRT engine to
    compute Fisher Information and select the next best question.
    """

    # ── Adaptive quiz: get all questions for a topic ──────────────────────────

    def get_questions_for_adaptive_quiz(
        self, topic_id: str, count: int = 20
    ) -> list[dict]:
        """
        Fetch up to `count` questions for a topic, ordered by irt_b (difficulty)
        to ensure a spread of difficulty levels is available to the adaptive engine.

        The IRT engine (select_next_question) will then pick among these using
        maximum Fisher Information rather than presenting them in order.

        Args:
            topic_id: UUID of the topic.
            count:    Maximum questions to return (default 20).

        Returns:
            List of dicts with keys:
              id, question_text, option_a/b/c/d, correct_option, explanation,
              irt_a, irt_b, irt_c, difficulty_label, topic_id
        """
        sql = """
            SELECT
                id, topic_id, question_text,
                option_a, option_b, option_c, option_d,
                correct_option, explanation,
                irt_a, irt_b, irt_c, difficulty_label,
                times_answered, times_correct
            FROM questions
            WHERE topic_id = %s
            ORDER BY irt_b ASC          -- spread from easy to hard
            LIMIT %s
        """
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (topic_id, count))
                rows = cur.fetchall()
        return [dict(r) for r in rows]

    # ── Practice mode: filter by difficulty range ─────────────────────────────

    def get_questions_by_difficulty_range(
        self,
        topic_id: str,
        b_min: float,
        b_max: float,
        count: int = 5,
    ) -> list[dict]:
        """
        Fetch questions within a specific IRT difficulty range.

        Useful for practice mode where the student explicitly requests
        'easy', 'medium', or 'hard' questions rather than adaptive selection.

        Args:
            topic_id: UUID of the topic.
            b_min:    Lower bound of irt_b (e.g. -0.5 for medium start).
            b_max:    Upper bound of irt_b (e.g.  0.5 for medium end).
            count:    Max questions to return.

        Returns:
            List of question dicts within the difficulty window.
        """
        sql = """
            SELECT
                id, topic_id, question_text,
                option_a, option_b, option_c, option_d,
                correct_option, explanation,
                irt_a, irt_b, irt_c, difficulty_label
            FROM questions
            WHERE topic_id = %s
              AND irt_b BETWEEN %s AND %s
            ORDER BY RANDOM()           -- random selection within range
            LIMIT %s
        """
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (topic_id, b_min, b_max, count))
                rows = cur.fetchall()
        return [dict(r) for r in rows]

    # ── Update empirical stats after student answers ──────────────────────────

    def update_question_stats(
        self, question_id: str, was_correct: bool
    ) -> None:
        """
        Increment times_answered (always) and times_correct (if correct).

        This data accumulates empirical response rates which can later be
        compared with IRT b-parameters to trigger recalibration.

        Args:
            question_id: UUID of the answered question.
            was_correct: Whether the student's response was correct.
        """
        sql = """
            UPDATE questions
            SET times_answered = times_answered + 1,
                times_correct  = times_correct  + CASE WHEN %s THEN 1 ELSE 0 END
            WHERE id = %s
        """
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (was_correct, question_id))
            conn.commit()

    # ── Empirical difficulty vs IRT b ─────────────────────────────────────────

    def get_empirical_difficulty(self, question_id: str) -> Optional[dict]:
        """
        Compute the observed (empirical) difficulty of a question and compare
        it with the calibrated IRT irt_b parameter.

        Empirical difficulty = times_correct / times_answered  (lower = harder)

        A large discrepancy between empirical P(correct) and the IRT-predicted
        P(correct | average student) suggests the question needs recalibration.

        Returns:
            dict with:
              question_id, irt_b, times_answered, times_correct,
              empirical_p_correct (None if never answered),
              needs_recalibration (True if |empirical − irt_predicted| > 0.15)
            Or None if question not found.
        """
        sql = """
            SELECT id, irt_a, irt_b, irt_c, times_answered, times_correct
            FROM questions
            WHERE id = %s
        """
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (question_id,))
                row = cur.fetchone()

        if row is None:
            return None

        row = dict(row)
        n = row["times_answered"]
        if n == 0:
            empirical_p = None
            needs_recal = False
        else:
            empirical_p = row["times_correct"] / n
            # IRT-predicted P(correct) for average student (theta=0)
            a, b, c = row["irt_a"], row["irt_b"], row["irt_c"]
            import math
            irt_predicted = c + (1 - c) / (1 + math.exp(-a * (0.0 - b)))
            needs_recal = abs(empirical_p - irt_predicted) > 0.15

        return {
            "question_id":          question_id,
            "irt_b":                row["irt_b"],
            "times_answered":       n,
            "times_correct":        row["times_correct"],
            "empirical_p_correct":  round(empirical_p, 4) if empirical_p is not None else None,
            "needs_recalibration":  needs_recal,
        }

    # ── Bulk fetch by subject for cross-topic adaptive sessions ───────────────

    def get_questions_for_subject(
        self,
        subject: str,
        board: str,
        grade_level: str,
        count: int = 30,
    ) -> list[dict]:
        """
        Fetch questions across all topics for a subject, useful for
        cross-topic diagnostic quizzes at the start of onboarding.

        Returns questions spread evenly across difficulty levels.
        """
        sql = """
            SELECT
                id, topic_id, question_text,
                option_a, option_b, option_c, option_d,
                correct_option, explanation,
                irt_a, irt_b, irt_c, difficulty_label
            FROM questions
            WHERE subject = %s AND board = %s AND grade_level = %s
            ORDER BY irt_b ASC
            LIMIT %s
        """
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (subject, board, grade_level, count))
                rows = cur.fetchall()
        return [dict(r) for r in rows]


# ── Module-level singleton ────────────────────────────────────────────────────
_qb_instance: Optional[QuestionBankService] = None


def get_question_bank_service() -> QuestionBankService:
    """Lazy singleton."""
    global _qb_instance
    if _qb_instance is None:
        _qb_instance = QuestionBankService()
    return _qb_instance
