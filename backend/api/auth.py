from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from database import get_db
from models.user import User
from models.api_key import ApiKey
from middleware.auth import get_current_user
from middleware.rate_limit import check_rate_limit
from utils.security import (
    hash_password, verify_password, create_jwt_token,
    generate_api_key, hash_api_key,
)
from datetime import datetime, timezone

router = APIRouter(prefix="/api/auth", tags=["用户与鉴权"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class CreateApiKeyRequest(BaseModel):
    name: str


@router.post("/register", summary="用户注册")
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="邮箱已注册")

    user = User(email=body.email, hashed_password=hash_password(body.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"id": user.id, "email": user.email, "created_at": user.created_at}


@router.post("/login", summary="用户登录")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="邮箱或密码错误")

    token = create_jwt_token(user.id)
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", summary="获取当前用户信息")
async def get_me(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)
    return {"id": current_user.id, "email": current_user.email, "created_at": current_user.created_at}


@router.post("/api-keys", summary="创建 API Key")
async def create_api_key(
    body: CreateApiKeyRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)
    raw_key = generate_api_key()
    key_hash = hash_api_key(raw_key)

    api_key = ApiKey(user_id=current_user.id, key_hash=key_hash, name=body.name)
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    return {
        "id": api_key.id,
        "name": api_key.name,
        "key": raw_key,  # 只在创建时返回一次
        "created_at": api_key.created_at,
    }


@router.get("/api-keys", summary="列出所有 API Key")
async def list_api_keys(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)
    result = await db.execute(
        select(ApiKey).where(
            ApiKey.user_id == current_user.id,
            ApiKey.revoked_at.is_(None),
        )
    )
    keys = result.scalars().all()
    return [
        {"id": k.id, "name": k.name, "created_at": k.created_at}
        for k in keys
    ]


@router.delete("/api-keys/{key_id}", summary="撤销 API Key")
async def revoke_api_key(
    key_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)
    result = await db.execute(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == current_user.id)
    )
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API Key 不存在")

    api_key.revoked_at = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "API Key 已撤销"}
