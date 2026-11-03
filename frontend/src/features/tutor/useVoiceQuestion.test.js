import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

const h = vi.hoisted(() => ({ upload: vi.fn() }))
vi.mock('../../lib/api.js', () => ({ upload: (...args) => h.upload(...args) }))
vi.mock('../../lib/audio.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    recordingSupport: () => ({ ok: true }),
    startRecording: async () => ({ startedAt: Date.now(), stop: async () => new Blob(['wav'], { type: 'audio/wav' }), cancel: () => {} }),
  }
})

const { useVoiceQuestion } = await import('./useVoiceQuestion.js')

async function transcribe(options) {
  const onTranscript = vi.fn()
  const { result } = renderHook(() => useVoiceQuestion({ lang: 'vi', keywords: [], onTranscript, ...options }))
  await act(async () => {
    await result.current.start()
  })
  await act(async () => {
    await result.current.stop()
  })
  return onTranscript
}

afterEach(() => {
  cleanup()
  h.upload.mockReset()
})

describe('useVoiceQuestion', () => {
  it('sends the share code so a guest on a shared lesson may transcribe', async () => {
    h.upload.mockResolvedValue({ transcript: 'Chu kì là gì?' })
    const onTranscript = await transcribe({ shareCode: 'ABC234' })
    expect(h.upload).toHaveBeenCalledWith('/api/ai/transcribe', expect.any(File), expect.objectContaining({ fields: { lang: 'vi', code: 'ABC234' } }))
    expect(onTranscript).toHaveBeenCalledWith('Chu kì là gì?')
  })

  it('sends no code from the studio', async () => {
    h.upload.mockResolvedValue({ transcript: 'Hello' })
    await transcribe({ lang: 'en' })
    expect(h.upload.mock.calls[0][2].fields).toEqual({ lang: 'en' })
  })
})
