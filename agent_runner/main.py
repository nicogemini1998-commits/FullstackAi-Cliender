from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from .database import init_pool, close_pool, run_migrations
from .services.redis_queue import get_redis, close_redis
from .routers import flows, nodes, execute


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_pool()
    await run_migrations()
    await get_redis()
    print("🚀 Agent Runner listo en :8001")
    yield
    # Shutdown
    await close_pool()
    await close_redis()


limiter = Limiter(key_func=get_remote_address, default_limits=["10/minute"])

app = FastAPI(
    title="FullStackAI Agent Runner",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3001", "https://app.cliender.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(flows.router,   prefix="/api")
app.include_router(nodes.router,   prefix="/api")
app.include_router(execute.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "agent_runner"}
