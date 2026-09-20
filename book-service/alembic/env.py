"""
Migrations run as an admin role (they create tables and grant on them), the
service runs as `book_service`. Two URLs, so the restricted one never needs
DDL rights:

    BOOK_SERVICE_MIGRATION_DATABASE_URL   admin, direct connection (port 5432)
    BOOK_SERVICE_DATABASE_URL             the service's own, used at runtime

Migrations are plain SQL through `op.execute`; there is no model metadata and
therefore no autogenerate.
"""

import os
from logging.config import fileConfig

from sqlalchemy import create_engine

from alembic import context

config = context.config
# alembic.ini's loggers, so an upgrade says which revisions it ran.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

VERSION_TABLE = "book_service_alembic_version"


def database_url() -> str:
    url = os.environ.get("BOOK_SERVICE_MIGRATION_DATABASE_URL")
    if not url:
        raise SystemExit("BOOK_SERVICE_MIGRATION_DATABASE_URL is not set.")
    # asyncpg-style URLs are what the rest of the service uses; SQLAlchemy needs
    # the driver named.
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def run_migrations_offline() -> None:
    context.configure(url=database_url(), literal_binds=True, version_table=VERSION_TABLE)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(database_url(), poolclass=None)
    with engine.connect() as connection:
        context.configure(connection=connection, version_table=VERSION_TABLE)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
