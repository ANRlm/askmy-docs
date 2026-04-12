from openai import AsyncOpenAI
from config import settings
from loguru import logger
from typing import AsyncGenerator
from clients import get_llm_client


async def chat_completion(messages: list[dict], stream: bool = False):
    client = get_llm_client()
    try:
        response = await client.chat.completions.create(
            model=settings.llm_model,
            messages=messages,
            stream=stream,
            max_tokens=3000,
        )
        return response
    except Exception as e:
        logger.error(f"LLM API 调用失败: {e}")
        raise


async def chat_completion_stream(messages: list[dict]) -> AsyncGenerator[str, None]:
    client = get_llm_client()
    try:
        stream = await client.chat.completions.create(
            model=settings.llm_model,
            messages=messages,
            stream=True,
            max_tokens=3000,
            timeout=120.0,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    except Exception as e:
        logger.error(f"LLM 流式 API 调用失败: {e}")
        raise


async def simple_chat(prompt: str) -> str:
    """非流式单次对话"""
    response = await chat_completion([{"role": "user", "content": prompt}])
    return response.choices[0].message.content
