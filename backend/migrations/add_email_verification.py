"""
迁移：添加邮箱验证和密码重置相关列
用法：python -m migrations.add_email_verification
"""

import asyncio
from sqlalchemy import text
from database import AsyncSessionLocal, engine


async def migrate():
    async with engine.begin() as conn:
        # 添加 is_verified 列到 users 表
        await conn.execute(
            text("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE
        """)
        )

        # 添加 verification_token 列到 users 表
        await conn.execute(
            text("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS verification_token VARCHAR(64) UNIQUE
        """)
        )

        # 创建 password_reset_tokens 表
        await conn.execute(
            text("""
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token VARCHAR(64) UNIQUE NOT NULL,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                used_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        """)
        )

        # 创建索引
        await conn.execute(
            text("""
            CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_user_id
            ON password_reset_tokens(user_id)
        """)
        )
        await conn.execute(
            text("""
            CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_token
            ON password_reset_tokens(token)
        """)
        )
        await conn.execute(
            text("""
            CREATE INDEX IF NOT EXISTS ix_users_verification_token
            ON users(verification_token)
        """)
        )

    print(
        "迁移完成：已添加 is_verified、verification_token 列和 password_reset_tokens 表"
    )


if __name__ == "__main__":
    asyncio.run(migrate())
