import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteCachedLab, liteSavedAt, loadCachedLab, saveLabForOffline } from './liteCache.js'

const lab = { share_code: 'ABC234', spec: { blocks: [] }, sources: [], assets: [] }
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); window.localStorage.clear(); delete navigator.serviceWorker })

function stubOffline(fetchImpl = async () => ({ ok: true })) {
  const images = { put: vi.fn(async () => {}), match: vi.fn(async () => undefined), keys: vi.fn(async () => []), delete: vi.fn(async () => true) }
  const caches = { open: vi.fn(async () => images), delete: vi.fn(async () => true) }
  vi.stubGlobal('caches', caches)
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: vi.fn(async () => {}), ready: Promise.resolve() } })
  vi.stubGlobal('fetch', vi.fn(fetchImpl))
  return { caches, images }
}

describe('explicit Lite save', () => {
  it('does not claim success when device storage is full', async () => {
    stubOffline()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(await saveLabForOffline(lab)).toEqual({ ok: false, missing: [] })
    expect(liteSavedAt('ABC234')).toBeNull()
    expect(loadCachedLab('ABC234')).toBeNull()
  })

  it('keeps the earlier saved copy when saving again fails', async () => {
    window.localStorage.setItem('cl.lite.lab.ABC234', JSON.stringify({ ...lab, title: 'Old' }))
    window.localStorage.setItem('cl.lite.meta', JSON.stringify({ ABC234: 100 }))
    const { caches } = stubOffline(async () => ({ ok: false }))
    expect(await saveLabForOffline({ ...lab, title: 'New' })).toEqual({ ok: false, missing: [] })
    expect(loadCachedLab('ABC234').title).toBe('Old')
    expect(liteSavedAt('ABC234')).toBe(100)
    expect(caches.delete).not.toHaveBeenCalled()
  })

  it('saves the lesson text when one picture fails and lists that picture', async () => {
    const withImages = { ...lab, assets: [{ url: '/api/share/ABC234/assets/a.png' }, { url: '/api/share/ABC234/assets/b.png' }] }
    const { images } = stubOffline(async (url) => ({ ok: !String(url).endsWith('b.png') }))
    expect(await saveLabForOffline(withImages)).toEqual({ ok: true, missing: ['/api/share/ABC234/assets/b.png'] })
    expect(images.put).toHaveBeenCalledWith('/api/share/ABC234/assets/a.png', expect.anything())
    expect(loadCachedLab('ABC234')).toEqual(withImages)
    expect(liteSavedAt('ABC234')).not.toBeNull()
  })

  it('does not count a picture as missing while an earlier copy of it is cached', async () => {
    const withImages = { ...lab, assets: [{ url: '/api/share/ABC234/assets/b.png' }] }
    const { images } = stubOffline(async (url) => ({ ok: !String(url).endsWith('b.png') }))
    images.match.mockResolvedValue({ ok: true })
    expect(await saveLabForOffline(withImages)).toEqual({ ok: true, missing: [] })
  })

  it('deletes only the selected lab', async () => {
    window.localStorage.setItem('cl.lite.lab.ABC234', JSON.stringify(lab))
    window.localStorage.setItem('cl.lite.lab.DEF234', JSON.stringify({ ...lab, share_code: 'DEF234' }))
    window.localStorage.setItem('cl.lite.meta', JSON.stringify({ ABC234: 100, DEF234: 200 }))
    const remove = vi.fn(async () => true)
    vi.stubGlobal('caches', { delete: remove })
    await deleteCachedLab('ABC234')
    expect(loadCachedLab('ABC234')).toBeNull()
    expect(liteSavedAt('DEF234')).toBe(200)
    expect(remove).toHaveBeenCalledWith('conceptlab-lite-images-ABC234')
  })
})
