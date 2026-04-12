import asyncio
from concurrent.futures import ThreadPoolExecutor
from clients import get_chroma_client

_chroma_executor = ThreadPoolExecutor(max_workers=10)


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
    await asyncio.run_in_executor(_chroma_executor, _sync_delete_collection, kb_id)
