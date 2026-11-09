from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core import firebase
from app.core.config import settings
from app.core.etag import ETagMiddleware
from app.core.upload_limit import ContentSizeLimitMiddleware


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    firebase.init_firebase()
    yield
    await firebase.close_firebase()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    # Clients authenticate with a Bearer header, not cookies.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["ETag"],
)

app.add_middleware(ETagMiddleware)
app.add_middleware(ContentSizeLimitMiddleware)

app.include_router(api_router)


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": f"{settings.PROJECT_NAME} is running"}
