"""
Centralized Configuration for Agentflow-AI
Zero hardcoding: all settings loaded from environment or .env file.
"""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, AliasChoices

ENV_PATH = Path(__file__).resolve().parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_PATH),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # MongoDB Atlas
    mongo_url: str = Field(
        default="mongodb://localhost:27017",
        validation_alias="MONGO_URL"
    )
    mongo_db_name: str = Field(
        default="agentflow_db",
        validation_alias="MONGO_DB_NAME"
    )

    # Redis Cache
    redis_url: str = Field(
        default="redis://localhost:6379",
        validation_alias="REDIS_URL"
    )
    cache_ttl_seconds: int = Field(
        default=600,
        validation_alias="CACHE_TTL_SECONDS"
    )

    # Vector Store & RAG
    pinecone_api_key: str = Field(
        default="mock_key",
        validation_alias="PINECONE_API_KEY"
    )
    pinecone_index: str = Field(
        default="capstone-kb",
        validation_alias="PINECONE_INDEX"
    )
    relevance_threshold: float = Field(
        default=0.65,
        validation_alias="RELEVANCE_THRESHOLD"
    )
    top_k_chunks: int = Field(
        default=4,
        validation_alias="TOP_K_CHUNKS"
    )

    # LLM Configuration
    groq_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("GROQ_API_KEY", "LLM_API_KEY")
    )
    llm_model: str = Field(
        default="openai/gpt-oss-20b",
        validation_alias="LLM_MODEL"
    )

    # MCP Server
    mcp_server_url: str = Field(
        default="http://localhost:9000",
        validation_alias="MCP_SERVER_URL"
    )

    # Security
    admin_api_key: str = Field(
        default="agentflow-secret-key",
        validation_alias="ADMIN_API_KEY"
    )


settings = Settings()
