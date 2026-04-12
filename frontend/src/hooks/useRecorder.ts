import { useRef, useState, useCallback } from 'react'

type OnRecordingComplete = (blob: Blob, ext: string) => void

// 按优先级选择浏览器支持的音频格式，优先选阿里百炼 STT 支持的格式
function pickMimeType(): { mimeType: string; ext: string } {
  const candidates = [
    { mimeType: 'audio/ogg;codecs=opus', ext: 'ogg' },
    { mimeType: 'audio/ogg', ext: 'ogg' },
    { mimeType: 'audio/mp4', ext: 'mp4' },
    { mimeType: 'audio/webm;codecs=opus', ext: 'webm' },
    { mimeType: 'audio/webm', ext: 'webm' },
  ]
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c
  }
  // 最终回退，让浏览器自行选择
  return { mimeType: '', ext: 'ogg' }
}

export function useRecorder(onComplete: OnRecordingComplete) {
  const [recording, setRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const { mimeType, ext } = pickMimeType()

      const options = mimeType ? { mimeType } : {}
      const recorder = new MediaRecorder(stream, options)
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const finalMime = mimeType || recorder.mimeType || 'audio/ogg'
        const blob = new Blob(chunksRef.current, { type: finalMime })
        onComplete(blob, ext)
      }

      // timeslice=100ms：每 100ms 触发一次 ondataavailable，避免短录音数据丢失
      recorder.start(100)
      mediaRecorderRef.current = recorder
      setRecording(true)
    } catch (e) {
      console.error('录音失败:', e)
    }
  }, [onComplete])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop() // onstop 回调里会调用 onComplete
      mediaRecorderRef.current = null
      setRecording(false)
    }
  }, [])

  return { recording, startRecording, stopRecording }
}
