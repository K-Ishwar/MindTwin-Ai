"""
Knowledge Graph Router
======================
FastAPI endpoints for querying the NCERT/CBSE knowledge graphs.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from services.knowledge_graph_service import get_knowledge_graph_service

router = APIRouter()


# ── Request models ─────────────────────────────────────────────────────────────

class LearningOrderRequest(BaseModel):
    topic_ids: list[str]
    subject: str
    board: str
    grade: str


class RootCauseRequest(BaseModel):
    gap_topic_ids: list[str]
    subject: str
    board: str
    grade: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/available")
def list_graphs():
    """List all loaded knowledge graphs."""
    svc = get_knowledge_graph_service()
    return {"success": True, "graphs": svc.list_available_graphs()}


@router.get("/{subject}/{board}/{grade}")
def get_graph(subject: str, board: str, grade: str):
    """
    Return the full knowledge graph for a subject as an adjacency list
    with topic metadata.

    Path params use URL encoding — spaces become %20 or use hyphens.
    Example: /api/ai/knowledge-graph/Mathematics/CBSE/Class%2012
    """
    svc = get_knowledge_graph_service()

    # Decode URL params (replace hyphens with spaces for convenience)
    subject = subject.replace("-", " ")
    board   = board.replace("-", " ")
    grade   = grade.replace("-", " ")

    topics = svc.get_subject_topics(subject, board, grade)
    if not topics:
        raise HTTPException(
            status_code=404,
            detail=f"Knowledge graph not found for {subject} / {board} / {grade}. "
                   f"Available: {[g['key'] for g in svc.list_available_graphs()]}"
        )

    # Build adjacency list for frontend graph visualisation
    adjacency = {}
    for t in topics:
        adjacency[t["topic_id"]] = {
            "prerequisites": t.get("prerequisites", []),
            "dependents":    t.get("dependents", []),
        }

    return {
        "success":   True,
        "subject":   subject,
        "board":     board,
        "grade":     grade,
        "topics":    topics,
        "adjacency": adjacency,
        "topic_count": len(topics),
    }


@router.post("/learning-order")
def get_learning_order(body: LearningOrderRequest):
    """
    Given a list of topic_ids, return them in the correct learning order
    (topological sort respecting prerequisite edges).
    """
    svc = get_knowledge_graph_service()
    ordered = svc.get_learning_order(
        body.topic_ids, body.subject, body.board, body.grade
    )
    return {
        "success":       True,
        "original_order": body.topic_ids,
        "learning_order": ordered,
    }


@router.post("/root-cause-gaps")
def find_root_cause_gaps(body: RootCauseRequest):
    """
    Given gap topic_ids detected by IRT, surface the root-cause prerequisite gaps
    sorted by impact score (how many downstream gaps each one causes).
    """
    svc = get_knowledge_graph_service()
    root_causes = svc.find_root_cause_gaps(
        body.gap_topic_ids, body.subject, body.board, body.grade
    )
    return {
        "success":     True,
        "root_causes": root_causes,
        "total_gaps":  len(body.gap_topic_ids),
    }


@router.get("/{subject}/{board}/{grade}/topic/{topic_id}/prerequisites")
def get_topic_prerequisites(subject: str, board: str, grade: str, topic_id: str):
    """Return all recursive prerequisites for a single topic in learning order."""
    svc = get_knowledge_graph_service()
    subject = subject.replace("-", " ")
    board   = board.replace("-", " ")
    grade   = grade.replace("-", " ")

    direct    = svc.get_prerequisites(topic_id, subject, board, grade)
    recursive = svc.get_all_prerequisites_recursive(topic_id, subject, board, grade)
    dependents = svc.get_dependent_topics(topic_id, subject, board, grade)
    diff_avg  = svc.get_topic_difficulty_avg(topic_id, subject, board, grade)

    return {
        "success":                  True,
        "topic_id":                 topic_id,
        "direct_prerequisites":     direct,
        "all_prerequisites_ordered": recursive,
        "dependent_topics":         dependents,
        "difficulty_avg":           round(diff_avg, 2),
    }
