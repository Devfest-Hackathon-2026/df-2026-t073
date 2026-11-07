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

    # Cloud Storage & Gemini AI settings for Tankengo
    GCS_BUCKET_NAME: str | None = None
    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-3.8-flash"
    MAX_UPLOAD_BYTES: int = 10 * 1024 * 1024  # 10 MiB

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_ignore_empty=True,
        extra="ignore",
    )


settings = Settings()
