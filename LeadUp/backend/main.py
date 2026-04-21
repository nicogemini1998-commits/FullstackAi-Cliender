from __future__ import annotations
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from .database import init_pool, close_pool, run_migrations
from .services.scheduler import start_scheduler, stop_scheduler
from .routers import auth, companies, admin, apollo, leads, notes


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    await run_migrations()
    start_scheduler()
    print("🚀 LeadUp backend listo en :8002")
    yield
    stop_scheduler()
    await close_pool()


limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="LeadUp CRM API", version="1.0.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "https://leadup.cliender.com",
        "https://www.leadup.cliender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,      prefix="/api")
app.include_router(companies.router, prefix="/api")
app.include_router(admin.router,     prefix="/api")
app.include_router(apollo.router,    prefix="/api")
app.include_router(leads.router,     prefix="/api")
app.include_router(notes.router,     prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "leadup_crm"}
