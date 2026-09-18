from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Everything the service reads from the environment.

    The Supabase URL is accepted under the Next.js name too, so the one server
    `.env` that docker-compose loads feeds both containers without a duplicate
    line that can drift.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = Field(
        validation_alias=AliasChoices("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
    )
    # Storage requests carry the player's session token for authorization and
    # the project's anon key as the `apikey` header, like the browser's do.
    supabase_anon_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    )
    # Legacy projects sign session JWTs with a shared HS256 secret. Newer ones
    # publish asymmetric keys at /auth/v1/.well-known/jwks.json, in which case
    # this stays unset and JWKS is the only path.
    supabase_jwt_secret: str | None = Field(default=None, validation_alias="SUPABASE_JWT_SECRET")
    # Connection for the restricted `book_service` role. Optional so the process
    # can boot (and answer /health) on a box that has not been wired to Postgres.
    database_url: str | None = Field(default=None, validation_alias="BOOK_SERVICE_DATABASE_URL")
    # The same key the Next.js strum assistant uses. Optional: without it the
    # text-TOC step is skipped and an unbookmarked book lands on manual ranges.
    anthropic_api_key: str | None = Field(default=None, validation_alias="ANTHROPIC_API_KEY")
    # Tesseract language data for scanned uploads (`tools/fetch-tessdata.sh`).
    # Optional: without it a scan's pages stay textless and its chapters come
    # from vision or the player's own ranges.
    tessdata_prefix: str | None = Field(default=None, validation_alias="TESSDATA_PREFIX")
    ocr_languages: str = Field(default="chi_sim+eng", validation_alias="BOOK_SERVICE_OCR_LANGUAGES")

    @property
    def storage_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/storage/v1"

    @property
    def jwt_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @property
    def jwks_url(self) -> str:
        return f"{self.jwt_issuer}/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # pydantic-settings fills the fields from env
