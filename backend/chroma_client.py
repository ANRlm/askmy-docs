import asyncio
from clients import get_chroma_client


def get_collection(kb_id: int):
    client = get_chroma_client()
    collection_name = f"kb_{kb_id}"
    return client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )


def _sync_delete_collection(kb_id: int) -> None:
    client = get_chroma_client()
    collection_name = f"kb_{kb_id}"
    try:
        client.delete_collection(name=collection_name)
    except Exception:
        pass


async def delete_collection(kb_id: int) -> None:
    await asyncio.to_thread(_sync_delete_collection, kb_id)
