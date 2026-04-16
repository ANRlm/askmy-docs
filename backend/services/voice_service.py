import base64
import dashscope
from dashscope.audio.tts_v2 import SpeechSynthesizer
from openai import AsyncOpenAI
from config import settings
from loguru import logger

dashscope.api_key = settings.dashscope_api_key

# Qwen3-ASR-Flash 通过 OpenAI 兼容接口调用
_stt_client = None


def _get_stt_client() -> AsyncOpenAI:
    global _stt_client
    if _stt_client is None:
        _stt_client = AsyncOpenAI(
            api_key=settings.dashscope_api_key,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        )
    return _stt_client


async def speech_to_text(audio_bytes: bytes, audio_format: str = "wav") -> str:
    """
    调用 Qwen3-ASR-Flash 语音识别。
    使用 OpenAI 兼容接口，将音频以 Base64 编码后传入 input_audio 字段。
    支持格式：wav / mp3 / m4a
    """
    client = _get_stt_client()
    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

    try:
        response = await client.chat.completions.create(
            model=settings.stt_model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_audio",
                            "input_audio": {
                                "data": f"data:audio/{audio_format};base64,{audio_b64}",
                                "format": audio_format,
                            },
                        }
                    ],
                }
            ],
        )
        text = response.choices[0].message.content or ""
        return text.strip()
    except Exception as e:
        logger.error(f"STT 调用失败: {e}")
        raise Exception(f"语音识别失败: {e}")


def text_to_speech_stream(text: str) -> bytes:
    """
    调用 cosyvoice-v3-flash TTS API，返回 MP3 音频字节。
    使用 dashscope.audio.tts_v2.SpeechSynthesizer。
    """
    synthesizer = SpeechSynthesizer(
        model=settings.tts_model,
        voice=settings.tts_voice,
    )
    audio = synthesizer.call(text)
    if audio:
        return audio
    raise Exception("TTS 合成失败，返回空数据")
