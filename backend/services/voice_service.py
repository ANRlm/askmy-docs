import os
import io
import httpx
import dashscope
from dashscope.audio.asr import Recognition
from dashscope.audio.tts_v2 import SpeechSynthesizer
from config import settings
from loguru import logger
from typing import AsyncGenerator


dashscope.api_key = settings.dashscope_api_key


async def speech_to_text(audio_bytes: bytes, audio_format: str = "wav") -> str:
    """调用阿里百炼语音识别 API"""
    # 将音频保存到临时文件
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=f".{audio_format}", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        recognition = Recognition(
            model=settings.stt_model,
            format=audio_format,
            sample_rate=16000,
            callback=None,
        )
        result = recognition.call(tmp_path)
        if result.status_code == 200:
            sentences = result.get_sentence()
            if sentences:
                text = " ".join(s["text"] for s in sentences if s.get("text"))
                return text
            return ""
        else:
            logger.error(f"STT 失败: {result.message}")
            raise Exception(f"语音识别失败: {result.message}")
    finally:
        os.unlink(tmp_path)


def text_to_speech_stream(text: str) -> bytes:
    """调用阿里百炼 TTS API，返回音频字节"""
    synthesizer = SpeechSynthesizer(
        model=settings.tts_model,
        voice="longxiaochun",  # 默认音色
    )
    audio = synthesizer.call(text)
    if audio:
        return audio
    raise Exception("TTS 合成失败，返回空数据")
