from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",  # Ignore any extra env variables not defined here
    )

    # --- Supabase (Auth + API) ---
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str

    # --- Postgres (Direct session connection for Alembic & SQLAlchemy) ---
    database_url: str

    # --- LLM Providers ---
    groq_api_key: str | None = None
    groq_model: str = "openai/gpt-oss-120b"
    gemini_api_key: str | None = None
    openai_api_key: str | None = None

    # --- Hugging Face (Embeddings) ---
    huggingface_api_key: str 
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_dimensions: int = 384

    # --- Server ---
    allowed_origins: str = "http://localhost:5173"


# Create a single reusable instance for the app
settings = Settings()