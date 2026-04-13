#!/usr/bin/env python3
"""
Migration: Add share_token column to sessions table.

Usage:
    python -m migrations.add_share_token

Requires: pip install asyncpg
"""
from __future__ import annotations

import asyncio
import os
import sys


async def run():
    # Get database URL from environment or .env file
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        # Try to load from .env
        env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("DATABASE_URL=") and line != "DATABASE_URL=":
                        database_url = line.split("=", 1)[1]
                        break

    if not database_url:
        print("Error: DATABASE_URL not set and not found in .env")
        sys.exit(1)

    # Convert postgresql:// to postgresql+asyncpg:// if needed
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+asyncpg://")

    try:
        import asyncpg
    except ImportError:
        print("Error: asyncpg not installed. Run: pip install asyncpg")
        sys.exit(1)

    # Parse URL for asyncpg (it doesn't support postgresql+asyncpg:// scheme)
    # Extract actual postgresql:// URL
    clean_url = database_url
    if "postgresql+asyncpg://" in clean_url:
        clean_url = clean_url.replace("postgresql+asyncpg://", "postgresql://")

    try:
        conn: asyncpg.Connection = await asyncpg.connect(clean_url)

        # Check if column already exists
        exists = await conn.fetchval(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'sessions' AND column_name = 'share_token'"
        )
        if exists:
            print("Column 'share_token' already exists in 'sessions' table. Nothing to do.")
            await conn.close()
            return

        # Add column with unique index
        await conn.execute("""
            ALTER TABLE sessions
            ADD COLUMN share_token VARCHAR(64) UNIQUE
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS ix_sessions_share_token
            ON sessions (share_token)
        """)
        print("Successfully added 'share_token' column to 'sessions' table.")

        await conn.close()
    except Exception as e:
        print(f"Migration failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(run())
