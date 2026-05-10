import os
import json
import psycopg2
import psycopg2.extras
from fastapi import APIRouter, HTTPException
from models.twin_models import (
    TwinInitializeRequest,
    TwinInitializeResponse,
    TwinUpdateRequest,
    TwinUpdateResponse,
    TwinGetResponse,
)
from services.twin_service import initialize_twin, update_twin

router = APIRouter(prefix="/api/ai/twin", tags=["Digital Twin"])

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgres://user:password@postgres:5432/mindtwin_db"
)


def get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


# ── POST /api/ai/twin/initialize ──────────────────────────────────────────────
@router.post("/initialize", response_model=TwinInitializeResponse)
def initialize(req: TwinInitializeRequest):
    baseline = [r.model_dump() for r in req.baseline_results]

    result = initialize_twin(req.student_id, baseline)

    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE digital_twins
            SET twin_vector        = %s,
                peer_cluster_id    = %s,
                behavioral_features = %s,
                last_updated       = NOW()
            WHERE student_id = %s
            """,
            (
                json.dumps(result["twin_vector"]),
                result["peer_cluster_id"],
                json.dumps(result["behavioral_features"]),
                req.student_id,
            ),
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {str(e)}")

    return TwinInitializeResponse(**result)


# ── POST /api/ai/twin/update ──────────────────────────────────────────────────
@router.post("/update", response_model=TwinUpdateResponse)
def update(req: TwinUpdateRequest):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT twin_vector, behavioral_features FROM digital_twins WHERE student_id = %s",
            (req.student_id,),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {str(e)}")

    if not row:
        raise HTTPException(status_code=404, detail="Digital twin not found")

    current_vector = json.loads(row["twin_vector"]) if row["twin_vector"] else [0.5] * 64
    current_bf = row["behavioral_features"] if row["behavioral_features"] else {}

    session = req.session_data.model_dump()
    quiz = req.quiz_data.model_dump() if req.quiz_data else None

    new_vector, new_bf, updated_dims = update_twin(current_vector, current_bf, session, quiz)

    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE digital_twins
            SET twin_vector         = %s,
                behavioral_features = %s,
                last_updated        = NOW()
            WHERE student_id = %s
            """,
            (
                json.dumps(new_vector),
                json.dumps(new_bf),
                req.student_id,
            ),
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {str(e)}")

    return TwinUpdateResponse(
        twin_vector=new_vector,
        behavioral_features=new_bf,
        updated_dims=updated_dims,
    )


# ── GET /api/ai/twin/{student_id} ─────────────────────────────────────────────
@router.get("/{student_id}", response_model=TwinGetResponse)
def get_twin(student_id: str):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT twin_vector, peer_cluster_id, behavioral_features, last_updated
            FROM digital_twins
            WHERE student_id = %s
            """,
            (student_id,),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {str(e)}")

    if not row:
        raise HTTPException(status_code=404, detail="Digital twin not found")

    twin_vector = json.loads(row["twin_vector"]) if row["twin_vector"] else None
    bf = row["behavioral_features"] if row["behavioral_features"] else None
    last_updated = row["last_updated"].isoformat() if row["last_updated"] else None

    return TwinGetResponse(
        student_id=student_id,
        twin_vector=twin_vector,
        peer_cluster_id=row["peer_cluster_id"] or 0,
        behavioral_features=bf,
        last_updated=last_updated,
    )
