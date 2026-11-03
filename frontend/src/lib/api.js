/**
 * API client for the FastAPI backend (same origin; Vite proxies /api in dev).
 *
 * - JSON in/out, cookies included, CSRF header on unsafe methods.
 * - Errors become ApiError { status, code, message, fields, extra } — translate `code`
 *   with t(`errors.${code}`) (see components/ui/ErrorMessage.jsx).
 * - upload(): multipart with progress (XMLHttpRequest).
 * - stream(): Server-Sent Events over fetch (POST bodies supported).
 */

let csrfToken = null
const listeners = new Set()

export function setCsrfToken(token) {
  csrfToken = token || null
}

/** Subscribe to 401 responses (AuthContext uses this to drop a stale session). */
export function onUnauthorized(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export class ApiError extends Error {
  constructor({ status = 0, code = 'network_error', message = '', fields = null, extra = null } = {}) {
    super(message || code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
    this.extra = extra
  }
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

async function parseError(response) {
  let body = null
  try {
    body = await response.json()
  } catch {
    /* non-JSON error body */
  }
  const err = body?.error || {}
  const { code, message, fields, ...extra } = err
  return new ApiError({
    status: response.status,
    code: code || (response.status === 413 ? 'payload_too_large' : 'http_error'),
    message: message || response.statusText,
    fields: fields || null,
    extra,
  })
}

export async function api(path, { method = 'GET', body, signal, headers = {}, raw = false } = {}) {
  const init = { method, credentials: 'same-origin', signal, headers: { Accept: 'application/json', ...headers } }
  if (body !== undefined) {
    if (body instanceof FormData) {
      init.body = body
    } else {
      init.body = JSON.stringify(body)
      init.headers['Content-Type'] = 'application/json'
    }
  }
  if (UNSAFE.has(method) && csrfToken) init.headers['X-CSRF-Token'] = csrfToken
  let response
  try {
    response = await fetch(path, init)
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError({ code: 'network_error', message: 'Network error' })
  }
  if (!response.ok) {
    const error = await parseError(response)
    if (response.status === 401) listeners.forEach((fn) => fn(error))
    throw error
  }
  if (raw) return response
  if (response.status === 204) return null
  const type = response.headers.get('content-type') || ''
  return type.includes('application/json') ? response.json() : response.text()
}

export const get = (path, opts) => api(path, { ...opts, method: 'GET' })
export const post = (path, body, opts) => api(path, { ...opts, method: 'POST', body })
export const patch = (path, body, opts) => api(path, { ...opts, method: 'PATCH', body })
export const put = (path, body, opts) => api(path, { ...opts, method: 'PUT', body })
export const del = (path, body, opts) => api(path, { ...opts, method: 'DELETE', body })

/**
 * Multipart upload with progress. `fields` is an object of extra form fields.
 * Returns parsed JSON. onProgress receives a 0..1 fraction.
 */
export function upload(path, file, { fields = {}, fileField = 'file', onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    if (file) form.append(fileField, file, file.name || 'upload')
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined && value !== null) form.append(key, typeof value === 'object' && !(value instanceof Blob) ? JSON.stringify(value) : value)
    })
    const xhr = new XMLHttpRequest()
    xhr.open('POST', path)
    xhr.withCredentials = true
    xhr.setRequestHeader('Accept', 'application/json')
    if (csrfToken) xhr.setRequestHeader('X-CSRF-Token', csrfToken)
    xhr.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      let body = null
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        body = null
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body)
      const err = body?.error || {}
      const { code, message, fields, ...extra } = err
      const error = new ApiError({ status: xhr.status, code: code || (xhr.status === 413 ? 'payload_too_large' : 'http_error'), message, fields, extra })
      if (xhr.status === 401) listeners.forEach((fn) => fn(error))
      reject(error)
    }
    xhr.onerror = () => reject(new ApiError({ code: 'network_error', message: 'Network error' }))
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
    if (signal) signal.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(form)
  })
}

/**
 * POST and read a text/event-stream response.
 *   for await (const { event, data } of stream('/api/labs/x/chat', body, { signal })) { ... }
 * `data` is JSON-parsed when possible.
 */
export async function* stream(path, body, { signal } = {}) {
  const headers = { Accept: 'text/event-stream', 'Content-Type': 'application/json' }
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken
  let response
  try {
    response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers, body: JSON.stringify(body), signal })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError({ code: 'network_error', message: 'Network error' })
  }
  if (!response.ok) throw await parseError(response)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let index
    while ((index = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      let event = 'message'
      const dataLines = []
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
      }
      if (!dataLines.length) continue
      const text = dataLines.join('\n')
      let data = text
      try {
        data = JSON.parse(text)
      } catch {
        /* plain text event */
      }
      yield { event, data }
    }
  }
}
