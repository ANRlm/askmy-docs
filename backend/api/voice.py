from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from database import get_db
from models.user import User
from middleware.auth import get_current_user
from middleware.rate_limit import check_rate_limit
from services.voice_service import speech_to_text, text_to_speech_stream
import io

router = APIRouter(prefix="/api/voice", tags=["语音交互"])

ALLOWED_AUDIO_FORMATS = {"wav", "mp3", "m4a", "webm", "ogg"}


class TTSRequest(BaseModel):
    text: str


@router.post("/stt", summary="语音转文字")
async def stt(
    file: UploadFile = File(...),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)

    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "wav"
    if ext not in ALLOWED_AUDIO_FORMATS:
        raise HTTPException(status_code=400, detail=f"不支持的音频格式，仅支持: {', '.join(ALLOWED_AUDIO_FORMATS)}")

    audio_bytes = await file.read()
    text = await speech_to_text(audio_bytes, audio_format=ext)
    return {"text": text}


@router.post("/tts", summary="文字转语音")
async def tts(
    body: TTSRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_rate_limit(request, current_user.id)

    if not body.text.strip():
        raise HTTPException(status_code=400, detail="文本不能为空")

    audio_bytes = text_to_speech_stream(body.text)
    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Content-Disposition": "attachment; filename=tts_output.mp3"},
    )
