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

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_ignore_empty=True,
        extra="ignore",
    )


settings = Settings()
