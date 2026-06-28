import { afterEach, describe, expect, it } from 'vitest'
import { isIos, isPushSupported, urlBase64ToUint8Array } from './push'

describe('urlBase64ToUint8Array', () => {
  it('decodes a standard base64 string to the right bytes', () => {
    expect(Array.from(urlBase64ToUint8Array('AQAB'))).toEqual([1, 0, 1])
  })

  it('handles base64url chars (- and _) and missing padding', () => {
    // '-_' maps to '+/' before decoding; result must match the padded standard form.
    const standard = atob('a+/=')
    const decoded = urlBase64ToUint8Array('a-_')
    expect(decoded.length).toBe(standard.length)
    expect(decoded[0]).toBe(standard.charCodeAt(0))
  })
})

describe('isPushSupported', () => {
  it('is false in a jsdom environment without serviceWorker/PushManager', () => {
    // jsdom provides window/navigator but not the Push APIs.
    expect(isPushSupported()).toBe(false)
  })
})

describe('isIos', () => {
  const original = navigator.userAgent

  afterEach(() => {
    Object.defineProperty(window.navigator, 'userAgent', { value: original, configurable: true })
  })

  it('detects an iPhone user agent', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      configurable: true,
    })
    expect(isIos()).toBe(true)
  })

  it('is false for a desktop user agent', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true,
    })
    expect(isIos()).toBe(false)
  })
})
