import os
import json
import psycopg2
import psycopg2.extras
import httpx
from datetime import datetime
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
import redis

from services.behavioral_pipeline_service import BehavioralPipelineService
from models.lstm_stress_model import StressModelManager

router = APIRouter(prefix="/api/ai/stress", tags=["Stress & Wellness"])

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://user:password@postgres:5432/mindtwin_db")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

def get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)

def get_redis():
    return redis.Redis.from_url(REDIS_URL, decode_responses=True)

class MoodLogRequest(BaseModel):
    student_id: str
    mood_score: int
    notes: str = ""

def get_contextual_message(profile, score):
    messages = [
        "Exam pressure is normal — you've prepared well.",
        "Every session counts. You're making progress.",
        "It's okay to feel stressed. Take it one topic at a time.",
        "Remember to hydrate and stretch between sessions.",
        "You've been studying hard. Consistency pays off.",
        "Don't forget to take small breaks to keep your focus sharp.",
        "Keep your momentum up, but don't burn out.",
        "Your recent effort is setting you up for success.",
        "A focused mind requires a rested body.",
        "You're on the right track. Keep going!"
    ]
    # Simple hash based on student_id to cycle messages
    idx = hash(str(profile)) % len(messages)
    return messages[idx]

def determine_interventions(predictions, student_profile):
    interventions = []
    score = predictions["stress_tomorrow"]
    
    if score >= 0.8:  # CRITICAL
        interventions.append({
            "type": "wellness_alert",
            "priority": "urgent",
            "title": "You seem really overwhelmed",
            "message": "Take a proper break today. Your plan has been adjusted.",
            "action": "reduce_plan_by_50_percent"
        })
        interventions.append({
            "type": "breathing_exercise",
            "priority": "high",
            "title": "5-minute breathing exercise",
            "duration_min": 5
        })
    elif score >= 0.6:  # HIGH
        interventions.append({
            "type": "break_reminder",
            "priority": "medium",
            "title": "Time for a short break",
            "message": "You've been pushing hard. A 15-min break will help.",
            "action": "add_break_to_schedule"
        })
        interventions.append({
            "type": "plan_adjustment",
            "priority": "medium",
            "action": "reduce_plan_by_20_percent"
        })
    elif score >= 0.4:  # MODERATE
        interventions.append({
            "type": "encouragement",
            "priority": "low",
            "title": "You're doing well",
            "message": get_contextual_message(student_profile, score)
        })
    return interventions

@router.post("/predict/{student_id}")
def predict_stress(student_id: str):
    pipeline = BehavioralPipelineService()
    today = datetime.now().strftime("%Y-%m-%d")
    
    # 1. Load behavioral window
    window = pipeline.extract_window(student_id, today, 14)
    
    # 2. Load model & inference
    model = StressModelManager.get_instance()
    predictions = model.predict(window)
    
    # 3. Interventions
    interventions = determine_interventions(predictions, student_profile=student_id)
    
    trend = "stable"
    try:
        conn = get_db()
        cur = conn.cursor()
        
        # Calculate trend
        cur.execute("SELECT stress_score FROM stress_logs WHERE student_id = %s ORDER BY logged_at DESC LIMIT 3", (student_id,))
        recent_logs = cur.fetchall()
        if len(recent_logs) > 0:
            avg_recent = sum(r['stress_score'] for r in recent_logs) / len(recent_logs)
            if predictions["stress_tomorrow"] > avg_recent + 0.1:
                trend = "worsening"
            elif predictions["stress_tomorrow"] < avg_recent - 0.1:
                trend = "improving"
                
        # Save to stress_logs
        intervention_val = interventions[0]["type"] if interventions else None
        snapshot = json.dumps(predictions)
        
        cur.execute("""
            INSERT INTO stress_logs 
            (student_id, stress_score, severity, behavioral_snapshot, intervention_triggered)
            VALUES (%s, %s, %s, %s, %s)
        """, (student_id, predictions["stress_tomorrow"], predictions["severity_tomorrow"], snapshot, intervention_val))
        
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"DB Error while logging stress: {e}")
        
    return {
        "student_id": student_id,
        "predictions": {
            "tomorrow": predictions["stress_tomorrow"],
            "3days": predictions["stress_3days"],
            "5days": predictions["stress_5days"]
        },
        "severity": predictions["severity_tomorrow"],
        "trend": trend,
        "interventions": interventions,
        "behavioral_highlights": {
            "What's driving this": ["Based on recent activity and upcoming milestones."] # simplified highlights
        }
    }

@router.get("/history/{student_id}")
def get_stress_history(student_id: str):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT stress_score, severity, logged_at 
            FROM stress_logs 
            WHERE student_id = %s 
            ORDER BY logged_at DESC 
            LIMIT 30
        """, (student_id,))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        if not rows:
            return {"history": [], "avg_score_week": 0, "avg_score_month": 0, "trend_direction": "stable"}
            
        history = [{"date": r["logged_at"].isoformat(), "score": r["stress_score"], "severity": r["severity"]} for r in rows]
        
        week_scores = [r["score"] for r in history[:7]]
        month_scores = [r["score"] for r in history]
        
        avg_week = sum(week_scores) / len(week_scores) if week_scores else 0
        avg_month = sum(month_scores) / len(month_scores) if month_scores else 0
        
        trend_dir = "stable"
        if len(history) >= 2:
            if history[0]["score"] > history[1]["score"]:
                trend_dir = "worsening"
            elif history[0]["score"] < history[1]["score"]:
                trend_dir = "improving"
                
        return {
            "history": history,
            "avg_score_week": round(avg_week, 2),
            "avg_score_month": round(avg_month, 2),
            "trend_direction": trend_dir
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/mood-log")
async def log_mood(req: MoodLogRequest):
    try:
        # 1. Save to mood_logs (Ensure table exists or create if not present)
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS mood_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                student_id UUID,
                mood_score INT,
                notes TEXT,
                logged_at TIMESTAMP DEFAULT NOW()
            )
        """)
        cur.execute("INSERT INTO mood_logs (student_id, mood_score, notes) VALUES (%s, %s, %s)",
                    (req.student_id, req.mood_score, req.notes))
        conn.commit()
        cur.close()
        conn.close()
        
        # 2. Update Redis Cache
        r = get_redis()
        today = datetime.now().strftime("%Y-%m-%d")
        r.set(f"mood:{req.student_id}:{today}", req.mood_score)
        
        # 3. Re-run stress prediction
        pipeline = BehavioralPipelineService()
        window = pipeline.extract_window(req.student_id, today, 14)
        model = StressModelManager.get_instance()
        predictions = model.predict(window)
        new_score = predictions["stress_tomorrow"]
        
        # 4. Award focus tokens via reward service
        try:
            async with httpx.AsyncClient() as client:
                reward_url = os.getenv("REWARD_SERVICE_URL", "http://reward-service:3006")
                await client.post(
                    f"{reward_url}/api/reward/award", 
                    json={"student_id": req.student_id, "amount": 3, "reason": "Mood logged"},
                    headers={"x-api-key": os.getenv("INTERNAL_API_KEY", "internal-secret")}
                )
        except Exception as e:
            print(f"Failed to award tokens: {e}")
            
        return {
            "success": True,
            "updated_stress_score": new_score,
            "tokens_awarded": 3
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
