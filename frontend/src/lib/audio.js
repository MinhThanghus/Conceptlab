/**
 * Microphone recording for spoken questions (spec §10.4 — Muse Voice Transcribe).
 *
 *   const support = recordingSupport()            // { ok, reason }
 *   const rec = await startRecording({ maxSeconds: 60, onLimit, onLevel })
 *   const blob = await rec.stop()                 // audio/wav · PCM16 · mono · 24 kHz
 *   rec.cancel()                                  // discard, release the microphone
 *
 * The Meta transcription endpoint accepts RIFF/WAVE, mono, 16-bit PCM at 16 or 24 kHz, so the
 * browser recording (WebM/Opus, Ogg or MP4 depending on the browser) is decoded and resampled
 * locally with an OfflineAudioContext. If decoding is not possible the original recording is
 * returned unchanged — the server converts it with ffmpeg.
 *
 * Errors thrown by startRecording() are RecordingError with `code`:
 *   'unsupported' | 'insecure' | 'denied' | 'no_device' | 'busy' | 'failed'
 * and stop() may throw RecordingError('empty') when nothing was captured.
 */

export const TARGET_SAMPLE_RATE = 24000
export const DEFAULT_MAX_SECONDS = 60

export class RecordingError extends Error {
  constructor(code, cause) {
    super(code)
    this.name = 'RecordingError'
    this.code = code
    if (cause) this.cause = cause
  }
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
}

/**
 * Encode mono float samples (-1..1) as a 16-bit PCM RIFF/WAVE file. Pure function.
 * Out-of-range values are clipped and non-finite values become silence.
 * @param {Float32Array|number[]} samples
 * @param {number} sampleRate e.g. 24000
 * @returns {ArrayBuffer} 44-byte header + 2 bytes per sample
 */
export function encodeWav(samples, sampleRate = TARGET_SAMPLE_RATE) {
  const rate = Math.round(Number(sampleRate))
  if (!Number.isFinite(rate) || rate <= 0) throw new RangeError('sampleRate must be a positive number')
  const count = samples?.length || 0
  const dataBytes = count * 2
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true) // RIFF chunk size = file size - 8
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size (PCM)
  view.setUint16(20, 1, true) // audio format 1 = integer PCM
  view.setUint16(22, 1, true) // channels: mono
  view.setUint32(24, rate, true) // sample rate
  view.setUint32(28, rate * 2, true) // byte rate = rate * channels * bytesPerSample
  view.setUint16(32, 2, true) // block align = channels * bytesPerSample
  view.setUint16(34, 16, true) // bits per sample
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)
  let offset = 44
  for (let i = 0; i < count; i += 1) {
    let s = Number(samples[i])
    if (!Number.isFinite(s)) s = 0
    if (s > 1) s = 1
    else if (s < -1) s = -1
    view.setInt16(offset, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true)
    offset += 2
  }
  return buffer
}

/** Can this page record audio? `reason` explains why not (for an honest message). */
export function recordingSupport() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return { ok: false, reason: 'unsupported' }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    // getUserMedia only exists in secure contexts (https:// or localhost).
    return { ok: false, reason: window.isSecureContext === false ? 'insecure' : 'unsupported' }
  }
  if (typeof window.MediaRecorder === 'undefined') return { ok: false, reason: 'unsupported' }
  return { ok: true, reason: null }
}

function pickMimeType() {
  const Recorder = window.MediaRecorder
  if (!Recorder || typeof Recorder.isTypeSupported !== 'function') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/mpeg']
  return (
    candidates.find((type) => {
      try {
        return Recorder.isTypeSupported(type)
      } catch {
        return false
      }
    }) || ''
  )
}

function mapMediaError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'denied'
    case 'SecurityError':
      return window.isSecureContext === false ? 'insecure' : 'denied'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'no_device'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy'
    default:
      return 'failed'
  }
}

/** Input level 0..1 for a live "the microphone hears you" indicator. Returns a stop function. */
function startLevelMeter(stream, onLevel) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx || typeof onLevel !== 'function') return () => {}
  let ctx = null
  let timer = null
  try {
    ctx = new AudioCtx()
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') ctx.resume().catch(() => {})
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const data = new Uint8Array(analyser.fftSize)
    // 10 updates per second is enough for a meter and cheap on low-end phones.
    timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128
        sum += v * v
      }
      onLevel(Math.min(1, Math.sqrt(sum / data.length) * 3))
    }, 100)
  } catch {
    /* the meter is optional */
  }
  return () => {
    if (timer) window.clearInterval(timer)
    if (ctx && typeof ctx.close === 'function') ctx.close().catch(() => {})
  }
}

function decode(ctx, data) {
  // Older Safari only supports the callback form of decodeAudioData.
  return new Promise((resolve, reject) => {
    const maybe = ctx.decodeAudioData(data, resolve, reject)
    if (maybe && typeof maybe.then === 'function') maybe.then(resolve, reject)
  })
}

/**
 * Convert a recorded blob to WAV PCM16 mono at `sampleRate`.
 * Returns the original blob when the browser cannot decode it.
 */
export async function toWav(blob, sampleRate = TARGET_SAMPLE_RATE) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext
  if (!AudioCtx || !Offline || !blob) return blob
  let ctx = null
  try {
    const data = await blob.arrayBuffer()
    ctx = new AudioCtx()
    const decoded = await decode(ctx, data)
    const length = Math.max(1, Math.ceil(decoded.duration * sampleRate))
    const offline = new Offline(1, length, sampleRate) // 1 channel → automatic down-mix to mono
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start(0)
    const rendered = await offline.startRendering()
    return new Blob([encodeWav(rendered.getChannelData(0), sampleRate)], { type: 'audio/wav' })
  } catch {
    return blob
  } finally {
    if (ctx && typeof ctx.close === 'function') ctx.close().catch(() => {})
  }
}

/**
 * Ask for the microphone and start recording.
 * @param {{ maxSeconds?: number, onLimit?: () => void, onLevel?: (level: number) => void }} options
 *   onLimit fires once when maxSeconds is reached (recording has already stopped; call stop()).
 */
export async function startRecording({ maxSeconds = DEFAULT_MAX_SECONDS, onLimit, onLevel } = {}) {
  const support = recordingSupport()
  if (!support.ok) throw new RecordingError(support.reason)
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
  } catch (error) {
    throw new RecordingError(mapMediaError(error), error)
  }
  const release = () => stream.getTracks().forEach((track) => track.stop())
  const mimeType = pickMimeType()
  let recorder
  try {
    recorder = mimeType ? new window.MediaRecorder(stream, { mimeType }) : new window.MediaRecorder(stream)
  } catch (error) {
    release()
    throw new RecordingError('unsupported', error)
  }
  const chunks = []
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size) chunks.push(event.data)
  }
  const stopped = new Promise((resolve) => {
    recorder.onstop = () => resolve()
    recorder.onerror = () => resolve()
  })
  try {
    recorder.start(250) // small timeslices so a short recording still yields data
  } catch (error) {
    release()
    throw new RecordingError('failed', error)
  }
  const stopMeter = startLevelMeter(stream, onLevel)
  const startedAt = Date.now()
  let finished = false
  const stopRecorder = () => {
    try {
      if (recorder.state !== 'inactive') recorder.stop()
    } catch {
      /* already stopped */
    }
  }
  const limitTimer = window.setTimeout(() => {
    if (finished) return
    stopRecorder()
    onLimit?.()
  }, Math.max(1, maxSeconds) * 1000)

  async function stop() {
    if (finished) throw new RecordingError('failed')
    finished = true
    window.clearTimeout(limitTimer)
    stopRecorder()
    await stopped
    stopMeter()
    release()
    const type = recorder.mimeType || mimeType || chunks[0]?.type || 'audio/webm'
    const blob = new Blob(chunks, { type })
    if (!blob.size) throw new RecordingError('empty')
    return toWav(blob, TARGET_SAMPLE_RATE)
  }

  function cancel() {
    if (finished) return
    finished = true
    window.clearTimeout(limitTimer)
    stopRecorder()
    stopMeter()
    release()
    chunks.length = 0
  }

  return { stop, cancel, startedAt, mimeType: recorder.mimeType || mimeType }
}

/** File name for an upload, from the blob type (audio/wav → question.wav). */
export function recordingFileName(blob, base = 'question') {
  const type = (blob?.type || '').toLowerCase()
  const ext = type.includes('wav') ? 'wav' : type.includes('ogg') ? 'ogg' : type.includes('mp4') || type.includes('m4a') ? 'm4a' : type.includes('mpeg') ? 'mp3' : 'webm'
  return `${base}.${ext}`
}
