import { describe, expect, it } from 'vitest'
import { parseAnnouncementConfig } from './announcement'

const base = {
  VITE_BANNER_ENABLED: 'true',
  VITE_BANNER_MESSAGE: 'A Copa está acabando, mas o m5nita continua!',
  VITE_BANNER_LINK: '/how-it-works',
}

describe('parseAnnouncementConfig', () => {
  it('returns null when the enabled flag is missing', () => {
    expect(parseAnnouncementConfig({ ...base, VITE_BANNER_ENABLED: undefined })).toBeNull()
  })

  it('returns null when the enabled flag is not "true"', () => {
    expect(parseAnnouncementConfig({ ...base, VITE_BANNER_ENABLED: 'false' })).toBeNull()
    expect(parseAnnouncementConfig({ ...base, VITE_BANNER_ENABLED: '1' })).toBeNull()
  })

  it('accepts "true" case-insensitively and trimmed', () => {
    expect(parseAnnouncementConfig({ ...base, VITE_BANNER_ENABLED: '  TRUE ' })).not.toBeNull()
  })

  it('returns null when the message is missing or blank', () => {
    expect(parseAnnouncementConfig({ ...base, VITE_BANNER_MESSAGE: undefined })).toBeNull()
    expect(parseAnnouncementConfig({ ...base, VITE_BANNER_MESSAGE: '   ' })).toBeNull()
  })

  it('returns null when the link is missing or blank', () => {
    expect(parseAnnouncementConfig({ ...base, VITE_BANNER_LINK: undefined })).toBeNull()
    expect(parseAnnouncementConfig({ ...base, VITE_BANNER_LINK: '  ' })).toBeNull()
  })

  it('returns null for an invalid link (not a path nor an http(s) URL)', () => {
    expect(parseAnnouncementConfig({ ...base, VITE_BANNER_LINK: 'how-it-works' })).toBeNull()
    expect(parseAnnouncementConfig({ ...base, VITE_BANNER_LINK: 'ftp://x.com' })).toBeNull()
    expect(parseAnnouncementConfig({ ...base, VITE_BANNER_LINK: 'javascript:alert(1)' })).toBeNull()
  })

  it('returns null for a malformed http(s) URL', () => {
    expect(parseAnnouncementConfig({ ...base, VITE_BANNER_LINK: 'http://' })).toBeNull()
    expect(parseAnnouncementConfig({ ...base, VITE_BANNER_LINK: 'https://' })).toBeNull()
  })

  it('parses a valid internal path (isExternal=false)', () => {
    const banner = parseAnnouncementConfig(base)
    expect(banner).toMatchObject({ href: '/how-it-works', isExternal: false })
    expect(banner?.message).toBe(base.VITE_BANNER_MESSAGE)
  })

  it('parses a valid external URL (isExternal=true), http or https', () => {
    const https = parseAnnouncementConfig({ ...base, VITE_BANNER_LINK: 'https://m5nita.com/x' })
    expect(https).toMatchObject({ href: 'https://m5nita.com/x', isExternal: true })
    const http = parseAnnouncementConfig({ ...base, VITE_BANNER_LINK: 'http://m5nita.com' })
    expect(http?.isExternal).toBe(true)
  })

  it('trims the message and link', () => {
    const banner = parseAnnouncementConfig({
      ...base,
      VITE_BANNER_MESSAGE: '  hello  ',
      VITE_BANNER_LINK: '  /x  ',
    })
    expect(banner?.message).toBe('hello')
    expect(banner?.href).toBe('/x')
  })

  it('uses VITE_BANNER_ID when provided', () => {
    expect(parseAnnouncementConfig({ ...base, VITE_BANNER_ID: 'copa-fim' })?.id).toBe('copa-fim')
  })

  it('derives a stable id from message+link when no id is given', () => {
    const a = parseAnnouncementConfig(base)
    const b = parseAnnouncementConfig(base)
    expect(a?.id).toBeTruthy()
    expect(a?.id).toBe(b?.id)
    const different = parseAnnouncementConfig({ ...base, VITE_BANNER_MESSAGE: 'other message' })
    expect(different?.id).not.toBe(a?.id)
  })
})

describe('parseAnnouncementConfig — scheduling window', () => {
  const now = Date.parse('2026-06-17T12:00:00-03:00')

  it('shows when there are no date bounds', () => {
    expect(parseAnnouncementConfig(base, now)).not.toBeNull()
  })

  it('hides before the start date', () => {
    const env = { ...base, VITE_BANNER_START: '2026-07-01T00:00:00-03:00' }
    expect(parseAnnouncementConfig(env, now)).toBeNull()
  })

  it('shows on/after the start date', () => {
    const env = { ...base, VITE_BANNER_START: '2026-06-10T00:00:00-03:00' }
    expect(parseAnnouncementConfig(env, now)).not.toBeNull()
  })

  it('hides after the end date', () => {
    const env = { ...base, VITE_BANNER_END: '2026-06-10T00:00:00-03:00' }
    expect(parseAnnouncementConfig(env, now)).toBeNull()
  })

  it('shows within the start–end window', () => {
    const env = {
      ...base,
      VITE_BANNER_START: '2026-06-10T00:00:00-03:00',
      VITE_BANNER_END: '2026-08-01T00:00:00-03:00',
    }
    expect(parseAnnouncementConfig(env, now)).not.toBeNull()
  })

  it('hides (fail closed) when a date bound is unparseable', () => {
    expect(parseAnnouncementConfig({ ...base, VITE_BANNER_START: 'not-a-date' }, now)).toBeNull()
    expect(parseAnnouncementConfig({ ...base, VITE_BANNER_END: 'soon' }, now)).toBeNull()
  })

  it('ignores empty/blank bounds', () => {
    const env = { ...base, VITE_BANNER_START: '', VITE_BANNER_END: '   ' }
    expect(parseAnnouncementConfig(env, now)).not.toBeNull()
  })
})
