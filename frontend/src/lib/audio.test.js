import { describe, expect, it } from 'vitest'
import { encodeWav, recordingFileName, RecordingError, TARGET_SAMPLE_RATE } from './audio.js'

function ascii(view, offset, length) {
  let out = ''
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(view.getUint8(offset + i))
  return out
}

describe('encodeWav', () => {
  it('writes a RIFF/WAVE PCM16 mono header with the given sample rate', () => {
    const samples = new Float32Array(1000)
    const buffer = encodeWav(samples, 24000)
    const view = new DataView(buffer)
    expect(buffer.byteLength).toBe(44 + 1000 * 2)
    expect(ascii(view, 0, 4)).toBe('RIFF')
    expect(view.getUint32(4, true)).toBe(36 + 2000)
    expect(ascii(view, 8, 4)).toBe('WAVE')
    expect(ascii(view, 12, 4)).toBe('fmt ')
    expect(view.getUint32(16, true)).toBe(16)
    expect(view.getUint16(20, true)).toBe(1) // PCM
    expect(view.getUint16(22, true)).toBe(1) // mono
    expect(view.getUint32(24, true)).toBe(24000)
    expect(view.getUint32(28, true)).toBe(48000) // byte rate
    expect(view.getUint16(32, true)).toBe(2) // block align
    expect(view.getUint16(34, true)).toBe(16) // bits per sample
    expect(ascii(view, 36, 4)).toBe('data')
    expect(view.getUint32(40, true)).toBe(2000)
  })

  it('defaults to the 24 kHz rate expected by Muse Voice Transcribe', () => {
    const view = new DataView(encodeWav(new Float32Array(10)))
    expect(TARGET_SAMPLE_RATE).toBe(24000)
    expect(view.getUint32(24, true)).toBe(24000)
  })

  it('supports 16 kHz as well', () => {
    const view = new DataView(encodeWav([0, 0.5], 16000))
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint32(28, true)).toBe(32000)
  })

  it('converts, clips and sanitises samples as little-endian int16', () => {
    const buffer = encodeWav([0, 1, -1, 0.5, -0.5, 2, -3, Number.NaN, Number.POSITIVE_INFINITY], 24000)
    const view = new DataView(buffer)
    const read = (i) => view.getInt16(44 + i * 2, true)
    expect(read(0)).toBe(0)
    expect(read(1)).toBe(32767)
    expect(read(2)).toBe(-32768)
    expect(read(3)).toBe(16384)
    expect(read(4)).toBe(-16384)
    expect(read(5)).toBe(32767) // clipped
    expect(read(6)).toBe(-32768) // clipped
    expect(read(7)).toBe(0) // NaN → silence
    expect(read(8)).toBe(0) // Infinity → silence
  })

  it('produces a valid empty file for zero samples', () => {
    const buffer = encodeWav(new Float32Array(0), 24000)
    const view = new DataView(buffer)
    expect(buffer.byteLength).toBe(44)
    expect(view.getUint32(4, true)).toBe(36)
    expect(view.getUint32(40, true)).toBe(0)
  })

  it('rejects an invalid sample rate', () => {
    expect(() => encodeWav([0], 0)).toThrow(RangeError)
    expect(() => encodeWav([0], Number.NaN)).toThrow(RangeError)
  })
})

describe('recording helpers', () => {
  it('names uploads after the audio type', () => {
    expect(recordingFileName(new Blob([], { type: 'audio/wav' }))).toBe('question.wav')
    expect(recordingFileName(new Blob([], { type: 'audio/webm;codecs=opus' }))).toBe('question.webm')
    expect(recordingFileName(new Blob([], { type: 'audio/ogg;codecs=opus' }))).toBe('question.ogg')
    expect(recordingFileName(new Blob([], { type: 'audio/mp4' }))).toBe('question.m4a')
  })

  it('RecordingError carries a stable code', () => {
    const err = new RecordingError('denied')
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('denied')
    expect(err.name).toBe('RecordingError')
  })
})
