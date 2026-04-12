from services.llm_service import simple_chat
from loguru import logger


SUMMARY_PROMPT = """请将以下对话历史压缩成一段简洁的摘要（不超过500字），保留关键信息和上下文。

对话历史：
{history}

请输出摘要："""


async def compress_history(messages: list[dict]) -> str:
    """将消息列表压缩为摘要文本"""
    history_text = "\n".join(
        f"{msg['role']}: {msg['content']}" for msg in messages
    )
    prompt = SUMMARY_PROMPT.format(history=history_text)
    try:
        summary = await simple_chat(prompt)
        return summary
    except Exception as e:
        logger.error(f"记忆压缩失败: {e}")
        # 降级处理：简单截断
        return history_text[:1000] + "..."
