from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError
from database import get_db
from models.user import User
from models.api_key import ApiKey
from utils.security import decode_jwt_token, hash_api_key

security = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    user = None

    # 1. 尝试 API Key 鉴权
    api_key = request.headers.get("X-API-Key")
    if api_key:
        key_hash = hash_api_key(api_key)
        result = await db.execute(
            select(ApiKey).where(
                ApiKey.key_hash == key_hash,
                ApiKey.revoked_at.is_(None),
            )
        )
        api_key_obj = result.scalar_one_or_none()
        if api_key_obj:
            result = await db.execute(select(User).where(User.id == api_key_obj.user_id))
            user = result.scalar_one_or_none()

    # 2. 尝试 JWT 鉴权
    if user is None and credentials:
        try:
            payload = decode_jwt_token(credentials.credentials)
            user_id = int(payload.get("sub"))
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
        except (JWTError, ValueError, TypeError):
            pass

    if user is None:
        raise HTTPException(status_code=401, detail="未授权，请提供有效的 JWT Token 或 API Key")

    return user
