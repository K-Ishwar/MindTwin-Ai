from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import date


class BaselineResult(BaseModel):
    topic_id: str
    score_percent: float = Field(..., ge=0.0, le=100.0)


class TwinInitializeRequest(BaseModel):
    student_id: str
    baseline_results: List[BaselineResult] = []


class TwinInitializeResponse(BaseModel):
    student_id: str
    twin_vector: List[float]
    peer_cluster_id: int
    behavioral_features: Dict[str, Any]
    theta_estimate: float


class SessionData(BaseModel):
    duration_min: int = Field(..., ge=0)
    topic_id: str
    mood_after: Optional[int] = Field(None, ge=1, le=5)
    completed: bool = False
    planned_duration_min: Optional[int] = None


class QuizData(BaseModel):
    topic_id: str
    score_percent: float = Field(..., ge=0.0, le=100.0)


class TwinUpdateRequest(BaseModel):
    student_id: str
    session_data: SessionData
    quiz_data: Optional[QuizData] = None


class TwinUpdateResponse(BaseModel):
    twin_vector: List[float]
    behavioral_features: Dict[str, Any]
    updated_dims: List[int]


class TwinGetResponse(BaseModel):
    student_id: str
    twin_vector: Optional[List[float]]
    peer_cluster_id: int
    behavioral_features: Optional[Dict[str, Any]]
    last_updated: Optional[str]
