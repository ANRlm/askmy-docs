from openai import AsyncOpenAI
from config import settings
from loguru import logger


_client = None


def get_embedding_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.embedding_api_key,
            base_url=settings.embedding_base_url,
        )
    return _client


async def get_embeddings(texts: list[str]) -> list[list[float]]:
    client = get_embedding_client()
    try:
        response = await client.embeddings.create(
            model=settings.embedding_model,
            input=texts,
        )
        return [item.embedding for item in response.data]
    except Exception as e:
        logger.error(f"Embedding API 调用失败: {e}")
        raise


async def get_embedding(text: str) -> list[float]:
    embeddings = await get_embeddings([text])
    return embeddings[0]
