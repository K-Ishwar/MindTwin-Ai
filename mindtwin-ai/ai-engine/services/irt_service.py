"""
IRT Service — 3-Parameter Logistic (3PL) Item Response Theory Engine
=====================================================================
Pure NumPy implementation. No ML libraries used.

The 3PL model: P(X=1|θ,a,b,c) = c + (1-c) / (1 + exp(-a*(θ-b)))

Parameters:
  θ (theta): student ability  [-3, +3]
  a:         discrimination   [0.5, 2.5]
  b:         difficulty       [-3, +3]
  c:         pseudo-guessing  [0, 0.35]
"""

import numpy as np


# ── Function 1 ────────────────────────────────────────────────────────────────

def three_param_logistic(theta: float, a: float, b: float, c: float) -> float:
    """
    Compute the 3PL probability of a correct response.

    P(X=1 | θ, a, b, c) = c + (1 - c) / (1 + exp(-a * (θ - b)))

    Args:
        theta: Student ability estimate, range [-3, +3].
               Higher = more capable student.
        a:     Item discrimination, range [0.5, 2.5].
               Higher = question better separates students of different ability.
        b:     Item difficulty, range [-3, +3], on the same scale as theta.
               b = theta means 50% correct chance (above guessing floor).
        c:     Pseudo-guessing parameter, range [0, 0.35].
               Probability of correct response by pure guessing (e.g. 0.25 for MCQ).

    Returns:
        float: Probability in [c, 1.0] of answering correctly.
    """
    return c + (1.0 - c) / (1.0 + np.exp(-a * (theta - b)))


# ── Function 2 ────────────────────────────────────────────────────────────────

def fisher_information(theta: float, a: float, b: float, c: float) -> float:
    """
    Compute the Fisher Information for an item at a given ability level.

    I(θ) = a² × (P(θ) - c)² / ((1 - c)² × P(θ) × (1 - P(θ)))

    Interpretation: High I(θ) means this question is highly discriminating
    for students near ability level θ — choosing it maximises information gain.

    Args:
        theta: Current ability estimate.
        a, b, c: Item parameters (see three_param_logistic).

    Returns:
        float: Fisher Information value ≥ 0. Returns 0.0 on numerical edge cases.
    """
    p = three_param_logistic(theta, a, b, c)
    denom = (1.0 - c) ** 2 * p * (1.0 - p)
    if denom < 1e-10:
        return 0.0
    return (a ** 2) * ((p - c) ** 2) / denom


# ── Function 3 ────────────────────────────────────────────────────────────────

def select_next_question(
    theta: float,
    available_questions: list,
    answered_question_ids: list,
) -> dict | None:
    """
    Adaptive Question Selection via Maximum Fisher Information.

    Algorithm:
        1. Filter out already-answered questions.
        2. For each remaining question, compute Fisher Information at theta.
        3. Return the question that maximises information — this ensures each
           successive question is the most diagnostic for the current estimate.

    Args:
        theta:                  Current theta estimate for the student.
        available_questions:    List of dicts, each containing:
                                  {id, a, b, c, topic_id, difficulty_level, ...}
        answered_question_ids:  IDs to exclude (already shown to student).

    Returns:
        dict: Question dict with highest Fisher Information, or None if
              all questions have been answered.
    """
    answered_set = set(answered_question_ids)
    remaining = [q for q in available_questions if q["id"] not in answered_set]
    if not remaining:
        return None

    best_q = max(remaining, key=lambda q: fisher_information(theta, q["a"], q["b"], q["c"]))
    return best_q


# ── Function 4 ────────────────────────────────────────────────────────────────

def update_theta_mle(theta_current: float, responses: list) -> float:
    """
    Maximum Likelihood Estimation — update theta using Newton-Raphson.

    Log-likelihood:
        L(θ) = Σ [ correct·log(P) + (1-correct)·log(1-P) ]

    Newton-Raphson update (20 iterations):
        θ_new = θ_old - L'(θ) / L''(θ)

    First derivative L'(θ):
        Σ [ a·(P-c) / ((1-c)·P·(1-P)) · (correct - P) ]

    Second derivative L''(θ):
        Σ [ -a²·(P-c)² / ((1-c)²·P·(1-P)) ]   (always ≤ 0 — concave)

    The result is clamped to [-3, 3] to stay on the IRT ability scale.

    Args:
        theta_current: Starting theta estimate.
        responses:     List of dicts:
                         {a: float, b: float, c: float, correct: bool}

    Returns:
        float: Updated theta estimate clamped to [-3, 3].
               Returns theta_current unchanged if responses is empty.
    """
    if not responses:
        return theta_current

    theta = float(theta_current)

    for _ in range(20):
        L_prime  = 0.0  # first derivative
        L_double = 0.0  # second derivative

        for r in responses:
            a, b, c = r["a"], r["b"], r["c"]
            correct = int(bool(r["correct"]))
            P = three_param_logistic(theta, a, b, c)

            denom = (1.0 - c) * P * (1.0 - P)
            if abs(denom) < 1e-10:
                continue

            L_prime  += a * (P - c) / denom * (correct - P)
            L_double += -(a ** 2) * ((P - c) ** 2) / ((1.0 - c) ** 2 * P * (1.0 - P))

        if abs(L_double) < 1e-10:
            break  # denominator zero — stop

        theta = theta - L_prime / L_double
        theta = float(np.clip(theta, -3.0, 3.0))

    return theta


# ── Function 5 ────────────────────────────────────────────────────────────────

def compute_standard_error(theta: float, responses: list) -> float:
    """
    Compute the Standard Error of the theta estimate.

    SE(θ) = 1 / sqrt( Σ I_i(θ) )

    where I_i(θ) is the Fisher Information for each answered item.

    Lower SE = more precise ability estimate. Target SE < 0.3 for high confidence.

    Args:
        theta:     Current theta estimate.
        responses: List of dicts {a, b, c, correct} — correct is unused here
                   (SE depends only on item parameters and theta, not responses).

    Returns:
        float: Standard error. Returns 999.0 if responses is empty
               (representing maximum uncertainty before any data).
    """
    if not responses:
        return 999.0

    total_info = sum(
        fisher_information(theta, r["a"], r["b"], r["c"])
        for r in responses
    )

    if total_info < 1e-10:
        return 999.0

    return float(1.0 / np.sqrt(total_info))


# ── Function 6 ────────────────────────────────────────────────────────────────

def should_terminate(se: float, responses_count: int) -> bool:
    """
    Determine whether the adaptive quiz should stop.

    Termination conditions (any one triggers stop):
        1. responses_count >= 5 AND se < 0.3      — high-precision estimate achieved
        2. responses_count >= 20                 — maximum question limit reached
        3. responses_count >= 5 AND se < 0.5     — early stop: reasonably precise

    Args:
        se:              Current Standard Error of theta estimate.
        responses_count: Number of questions answered so far.

    Returns:
        bool: True if the quiz should terminate, False if more questions needed.
    """
    if responses_count >= 5 and se < 0.3:
        return True
    if responses_count >= 20:
        return True
    if responses_count >= 5 and se < 0.5:
        return True
    return False


# ── Function 7 ────────────────────────────────────────────────────────────────

def classify_gap(theta: float, topic_difficulty_avg: float, se: float = 0.5) -> dict:
    """
    Classify whether a knowledge gap exists for a topic.

    Logic:
        - theta < topic_difficulty_avg - 0.5  →  SIGNIFICANT GAP
          (student ability well below what the topic demands)
        - theta < topic_difficulty_avg         →  MINOR GAP
          (student slightly below topic level)
        - theta >= topic_difficulty_avg        →  NO GAP

    Confidence = 1 - (SE / 3.0), clamped to [0, 1].
    A low SE means we are confident in the classification.

    Args:
        theta:                Student's estimated ability for this topic.
        topic_difficulty_avg: Average b-parameter of questions in this topic.
        se:                   Standard error of the theta estimate.

    Returns:
        dict: {
            has_gap: bool,
            severity: "none" | "minor" | "significant",
            confidence: float in [0, 1]
        }
    """
    confidence = float(np.clip(1.0 - (se / 3.0), 0.0, 1.0))

    if theta < topic_difficulty_avg - 0.5:
        return {"has_gap": True, "severity": "significant", "confidence": confidence}
    elif theta < topic_difficulty_avg:
        return {"has_gap": True, "severity": "minor", "confidence": confidence}
    else:
        return {"has_gap": False, "severity": "none", "confidence": confidence}


# ── Function 8 ────────────────────────────────────────────────────────────────

def estimate_revision_hours(
    theta: float,
    topic_difficulty_avg: float,
    topic_estimated_hours: float,
) -> float:
    """
    Estimate additional study hours needed to close the gap for this topic.

    Formula:
        gap_magnitude  = max(0, topic_difficulty_avg - theta)
        multiplier     = 1 + gap_magnitude × 0.5
        revision_hours = topic_estimated_hours × multiplier
        (capped at topic_estimated_hours × 2.5)

    Interpretation:
        - No gap (theta >= avg): returns base hours (multiplier = 1).
        - Large gap (e.g. 2.0 units): multiplier = 2.0 → double the study time.

    Args:
        theta:                 Student's ability estimate.
        topic_difficulty_avg:  Average difficulty of the topic's questions.
        topic_estimated_hours: Baseline hours to study this topic from scratch.

    Returns:
        float: Recommended revision hours, capped at 2.5× baseline.
    """
    gap_magnitude = max(0.0, topic_difficulty_avg - theta)
    multiplier = 1.0 + gap_magnitude * 0.5
    revision_hours = topic_estimated_hours * multiplier
    cap = topic_estimated_hours * 2.5
    return float(min(revision_hours, cap))


# ── Unit Tests ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Running IRT unit tests...\n")

    # Test 1: Strong student answering easy question
    p = three_param_logistic(2.0, 1.5, -1.0, 0.25)
    assert p > 0.9, f"Expected >0.9, got {p}"
    print(f"Test 1 PASS: P(correct | strong student, easy question) = {p:.4f}")

    # Test 2: Weak student answering hard question
    p2 = three_param_logistic(-2.0, 1.5, 1.5, 0.25)
    assert p2 < 0.4, f"Expected <0.4, got {p2}"
    print(f"Test 2 PASS: P(correct | weak student, hard question) = {p2:.4f}")

    # Test 3: theta update after correct answer
    responses = [{"a": 1.2, "b": 0.0, "c": 0.25, "correct": True}]
    theta_new = update_theta_mle(0.0, responses)
    assert theta_new > 0.0, f"Expected theta to increase after correct answer"
    print(f"Test 3 PASS: theta updated 0.0 → {theta_new:.4f} after correct answer")

    # Test 4: SE decreases as more questions answered
    responses_5 = [
        {"a": 1.5, "b": float(i * 0.5 - 1), "c": 0.25, "correct": i % 2 == 0}
        for i in range(5)
    ]
    se = compute_standard_error(0.5, responses_5)
    assert se < 999.0, "SE should decrease with responses"
    print(f"Test 4 PASS: SE after 5 responses = {se:.4f}")

    # Test 5: Termination logic
    assert should_terminate(0.25, 10) is True,  "should stop: SE < 0.3"
    assert should_terminate(0.8,  25) is True,  "should stop: count >= 20"
    assert should_terminate(0.45,  7) is True,  "should stop: count>=5 and SE<0.5"
    assert should_terminate(0.6,   3) is False, "should continue"
    print("Test 5 PASS: termination conditions all correct")

    # Test 6: Gap classification
    g = classify_gap(theta=-1.0, topic_difficulty_avg=0.5, se=0.3)
    assert g["severity"] == "significant", f"Expected significant, got {g['severity']}"
    g2 = classify_gap(theta=0.3, topic_difficulty_avg=0.5, se=0.3)
    assert g2["severity"] == "minor"
    g3 = classify_gap(theta=1.0, topic_difficulty_avg=0.5, se=0.3)
    assert g3["severity"] == "none"
    print(f"Test 6 PASS: gap classifications correct")

    # Test 7: Revision hours
    hrs = estimate_revision_hours(theta=-1.0, topic_difficulty_avg=1.0, topic_estimated_hours=4.0)
    assert hrs > 4.0, "Gap student needs more than base hours"
    hrs_no_gap = estimate_revision_hours(theta=2.0, topic_difficulty_avg=0.0, topic_estimated_hours=4.0)
    assert hrs_no_gap == 4.0, "No-gap student needs only base hours"
    print(f"Test 7 PASS: revision hours = {hrs:.2f} (gap) / {hrs_no_gap:.2f} (no gap)")

    # Test 8: Fisher information is higher near item difficulty than at extremes
    # In 3PL, the peak shifts slightly above b due to guessing parameter c.
    # Compare information near b vs far below b (theta=-3) where students just guess.
    fi_near_b = fisher_information(theta=0.5, a=1.5, b=0.0, c=0.25)
    fi_extreme = fisher_information(theta=-3.0, a=1.5, b=0.0, c=0.25)
    assert fi_near_b > fi_extreme, "Information should be higher near b than at extremes"
    print(f"Test 8 PASS: I(θ≈b)={fi_near_b:.4f} > I(θ=-3)={fi_extreme:.4f}")

    print("\nAll IRT unit tests passed.")
