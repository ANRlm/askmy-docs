import chromadb
from config import settings

_client = None


def get_chroma_client() -> chromadb.HttpClient:
    global _client
    if _client is None:
        _client = chromadb.HttpClient(
            host=settings.chroma_host,
            port=settings.chroma_port,
        )
    return _client


def get_collection(kb_id: int):
    client = get_chroma_client()
    collection_name = f"kb_{kb_id}"
    return client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )


def delete_collection(kb_id: int):
    client = get_chroma_client()
    collection_name = f"kb_{kb_id}"
    try:
        client.delete_collection(name=collection_name)
    except Exception:
        pass
