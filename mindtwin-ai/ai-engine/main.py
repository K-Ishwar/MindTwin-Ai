from fastapi import FastAPI
from routers.twin_router import router as twin_router
from routers.scheduler_router import router as scheduler_router
from routers.knowledge_graph_router import router as kg_router
from routers.quiz_router import router as quiz_router
from routers.stress_router import router as stress_router
from routers.cron_router import router as cron_router

from models.lstm_stress_model import StressModelManager
from services.cron_service import scheduler

app = FastAPI(
    title="MindTwin AI Engine",
    description="AI algorithms powering the MindTwin digital twin system",
    version="1.0.0",
)

app.include_router(twin_router)
app.include_router(scheduler_router)
app.include_router(kg_router, prefix="/api/ai/knowledge-graph", tags=["Knowledge Graph"])
app.include_router(quiz_router)
app.include_router(stress_router)
app.include_router(cron_router)


@app.on_event("startup")
async def startup_event():
    StressModelManager.get_instance()  # Pre-load model
    scheduler.start()
    print("Background jobs scheduled")


@app.on_event("shutdown")
async def shutdown_event():
    scheduler.shutdown()


@app.get("/")
def read_root():
    return {"message": "MindTwin AI Engine running"}


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ai-engine"}
