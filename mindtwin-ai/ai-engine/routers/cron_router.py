"""
Phase 5.6 — Cron Status & Manual Trigger Router

Endpoints:
  GET  /api/ai/cron/status            — Scheduler status & job listing
  POST /api/ai/cron/trigger/{job_name} — Manually trigger a cron job (API key protected)
"""

import os
import asyncio
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Header

from services.cron_service import scheduler, JOB_REGISTRY

logger = logging.getLogger("cron_router")

router = APIRouter(prefix="/api/ai/cron", tags=["Cron Jobs"])

INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "internal-secret")


@router.get("/status")
def get_cron_status():
    """
    Returns the current scheduler status and details for every registered job.

    Response:
    {
        "scheduler_running": bool,
        "jobs": [
            {
                "id": str,
                "name": str,
                "next_run_time": str | null,
                "last_run_time": str | null
            }
        ]
    }
    """
    running = scheduler.running if hasattr(scheduler, "running") else False

    jobs = []
    for job in scheduler.get_jobs():
        next_run = job.next_run_time.isoformat() if job.next_run_time else None
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run_time": next_run,
            "last_run_time": None,  # APScheduler doesn't track this natively; could extend with a listener
        })

    return {
        "scheduler_running": running,
        "jobs": jobs,
        "server_time": datetime.now().isoformat(),
    }


@router.post("/trigger/{job_name}")
async def trigger_cron_job(
    job_name: str,
    x_api_key: str = Header(default=None, alias="x-api-key"),
):
    """
    Manually triggers a cron job by name.
    Protected by internal API key header (`x-api-key`).

    Valid job names:
      - nightly_stress_checks
      - twin_update_batch
      - daily_reward_reset
    """
    # Verify API key
    if x_api_key != INTERNAL_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing API key")

    # Lookup job function
    job_fn = JOB_REGISTRY.get(job_name)
    if not job_fn:
        valid = list(JOB_REGISTRY.keys())
        raise HTTPException(
            status_code=404,
            detail=f"Job '{job_name}' not found. Valid jobs: {valid}"
        )

    # Execute the job
    logger.info(f"Manually triggering job: {job_name}")
    try:
        result = await job_fn()
    except Exception as e:
        logger.error(f"Error during manual trigger of {job_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Job execution failed: {str(e)}")

    return {
        "triggered": job_name,
        "triggered_at": datetime.now().isoformat(),
        "result": result,
    }
