from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Tankengo Backend"
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    API_V1_STR: str = "/api/v1"
    CORS_ORIGINS: list[str] = ["*"]

    # Firebase & Cloud Firestore settings (populated from .env or Cloud Run env vars)
    FIREBASE_PROJECT_ID: str | None = None
    FIRESTORE_DATABASE_ID: str = "(default)"

    # Cloud Storage & Gemini / Vertex AI settings for Tankengo
    GCS_BUCKET_NAME: str | None = None
    GEMINI_API_KEY: str | None = None
    # Vertex AI region (default asia-northeast1 for Tokyo, or us-central1)
    VERTEX_LOCATION: str = "asia-northeast1"
    # Vertex AI model name (e.g. gemini-1.5-flash, gemini-2.0-flash, or gemini-3.5-flash)
    GEMINI_MODEL: str = "gemini-3.5-flash"
    # Gemini calls retry transient failures (HTTP 429, 500, 503, 504 and network
    # timeouts) with a short backoff. The budget is the longest a request may spend
    # on Gemini including retries; keep it under the app's 45 s request timeout.
    GEMINI_MAX_ATTEMPTS: int = 3
    GEMINI_RETRY_BUDGET_S: float = 38.0
    # Server-side key for Places API (New). Separate from the Android Maps key.
    GOOGLE_PLACES_API_KEY: str | None = None
    MAX_UPLOAD_BYTES: int = 10 * 1024 * 1024  # 10 MiB

    # Daily per-user limits on endpoints that call paid APIs (0 = no limit).
    LIMIT_VISION: int = 150
    LIMIT_CATCH: int = 300
    LIMIT_BRIEFING: int = 60
    LIMIT_REHEARSAL: int = 40
    LIMIT_REPLY: int = 150
    LIMIT_TTS: int = 400
    LIMIT_REVIEW: int = 80
    LIMIT_PLACES: int = 400
    LIMIT_EXPAND: int = 100

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_ignore_empty=True,
        extra="ignore",
    )


settings = Settings()
