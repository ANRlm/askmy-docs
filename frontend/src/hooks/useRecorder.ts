import { useRef, useState, useCallback } from 'react'

type OnRecordingComplete = (blob: Blob, ext: string) => void

// 按优先级选择浏览器支持的格式
// ogg/opus  → 阿里百炼 STT 支持，Chrome/Firefox 支持
// mp4/aac   → 阿里百炼 STT 支持，Safari 支持
// webm      → 阿里百炼 STT 不支持，仅作最后兜底
function pickMimeType(): { mimeType: string; ext: string } {
  const candidates = [
    { mimeType: 'audio/ogg;codecs=opus', ext: 'ogg' },
    { mimeType: 'audio/ogg', ext: 'ogg' },
    { mimeType: 'audio/mp4;codecs=mp4a.40.2', ext: 'mp4' },
    { mimeType: 'audio/mp4', ext: 'mp4' },
    { mimeType: 'audio/webm;codecs=opus', ext: 'webm' },
    { mimeType: 'audio/webm', ext: 'webm' },
  ]
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c
  }
  return { mimeType: '', ext: 'webm' }
}

export function useRecorder(onComplete: OnRecordingComplete) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = useCallback(async () => {
    setError(null)

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('浏览器不支持录音，请使用 Chrome 或 Firefox')
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e: any) {
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setError('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风')
      } else if (e.name === 'NotFoundError') {
        setError('未检测到麦克风设备')
      } else {
        setError(`无法启动录音: ${e.message}`)
      }
      return
    }

    const { mimeType, ext } = pickMimeType()
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
    } catch (e: any) {
      stream.getTracks().forEach((t) => t.stop())
      setError(`录音格式不支持: ${e.message}`)
      return
    }

    chunksRef.current = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      const finalMime = mimeType || recorder.mimeType || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type: finalMime })
      onComplete(blob, ext)
    }

    // timeslice=100ms：每 100ms 触发一次 ondataavailable，避免短录音丢数据
    recorder.start(100)
    mediaRecorderRef.current = recorder
    setRecording(true)
  }, [onComplete])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
      mediaRecorderRef.current = null
      setRecording(false)
    }
  }, [])

  return { recording, error, startRecording, stopRecording }
}
