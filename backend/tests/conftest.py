import pytest
import asyncio
import os
import sys
from unittest.mock import MagicMock, AsyncMock, patch

os.environ["JWT_SECRET"] = "test-secret-key-not-insecure-list"
os.environ["DATABASE_URL"] = "postgresql://test:test@localhost/test"
os.environ["LOG_DIR"] = "/tmp/test_logs"

sys.modules["clients"] = MagicMock()
sys.modules["clients"].init_clients = MagicMock()
sys.modules["clients"].close_clients = MagicMock()

mock_logger = MagicMock()
sys.modules["loguru"] = MagicMock()
sys.modules["loguru"].logger = mock_logger

from httpx import AsyncClient, ASGITransport  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from database import Base  # noqa: E402
from utils.security import hash_password  # noqa: E402


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def db_session():
    import models.user  # noqa
    import models.knowledge_base  # noqa
    import models.document  # noqa
    import models.session  # noqa
    import models.message  # noqa
    import models.feedback  # noqa
    import models.password_reset  # noqa
    import models.api_key  # noqa

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session() as session:
        yield session

    await engine.dispose()


@pytest.fixture
async def client(db_session):
    from database import get_db
    from main import app

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    with (
        patch("api.auth.check_ip_rate_limit", new=AsyncMock()),
        patch("api.auth.check_rate_limit", new=AsyncMock()),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            yield ac

    app.dependency_overrides.clear()


@pytest.fixture
async def test_user(db_session):
    from models.user import User

    user = User(
        email="test@example.com",
        hashed_password=hash_password("testpassword"),
        is_verified=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def auth_client(client: AsyncClient, test_user):
    response = await client.post(
        "/api/auth/login",
        json={"email": "test@example.com", "password": "testpassword"},
    )
    token = response.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client
