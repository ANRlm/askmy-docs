"""
集中管理所有外部服务客户端（LLM/Embedding/Chroma）。
使用 contextvars 确保在 async 上下文中的线程安全。
"""
import contextvars
from typing import Optional
from openai import AsyncOpenAI
import chromadb
from config import settings

# Context variables for client instances
_llm_client_var: contextvars.ContextVar[Optional[AsyncOpenAI]] = contextvars.ContextVar("llm_client", default=None)
_embedding_client_var: contextvars.ContextVar[Optional[AsyncOpenAI]] = contextvars.ContextVar("embedding_client", default=None)
_chroma_client_var: contextvars.ContextVar[Optional[chromadb.HttpClient]] = contextvars.ContextVar("chroma_client", default=None)


def get_llm_client() -> AsyncOpenAI:
    client = _llm_client_var.get()
    if client is None:
        client = AsyncOpenAI(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
            timeout=120.0,
        )
        _llm_client_var.set(client)
    return client


def get_embedding_client() -> AsyncOpenAI:
    client = _embedding_client_var.get()
    if client is None:
        client = AsyncOpenAI(
            api_key=settings.embedding_api_key,
            base_url=settings.embedding_base_url,
        )
        _embedding_client_var.set(client)
    return client


def get_chroma_client() -> chromadb.HttpClient:
    client = _chroma_client_var.get()
    if client is None:
        client = chromadb.HttpClient(
            host=settings.chroma_host,
            port=settings.chroma_port,
        )
        _chroma_client_var.set(client)
    return client


def init_clients():
    """Lifespan startup — pre-initialize all clients."""
    _llm_client_var.set(AsyncOpenAI(
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        timeout=120.0,
    ))
    _embedding_client_var.set(AsyncOpenAI(
        api_key=settings.embedding_api_key,
        base_url=settings.embedding_base_url,
    ))
    _chroma_client_var.set(chromadb.HttpClient(
        host=settings.chroma_host,
        port=settings.chroma_port,
    ))


def close_clients():
    """Lifespan shutdown — close all clients."""
    # AsyncOpenAI doesn't have a close() method, but Chroma HttpClient does
    client = _chroma_client_var.get()
    if client is not None:
        try:
            client.close()
        except Exception:
            pass
    _llm_client_var.set(None)
    _embedding_client_var.set(None)
    _chroma_client_var.set(None)
