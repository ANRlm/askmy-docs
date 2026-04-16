import asyncio
from loguru import logger
from clients import get_chroma_client


def get_collection(kb_id: int):
    client = get_chroma_client()
    collection_name = f"kb_{kb_id}"
    return client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )


async def get_collection_async(kb_id: int):
    def _get():
        return get_collection(kb_id)

    return await asyncio.to_thread(_get)


def _sync_delete_collection(kb_id: int) -> None:
    client = get_chroma_client()
    collection_name = f"kb_{kb_id}"
    try:
        client.delete_collection(name=collection_name)
    except Exception as e:
        logger.warning(f"Failed to delete Chroma collection: {e}")


async def delete_collection(kb_id: int) -> None:
    await asyncio.to_thread(_sync_delete_collection, kb_id)
