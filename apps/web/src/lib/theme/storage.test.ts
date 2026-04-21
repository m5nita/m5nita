import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const STORAGE_KEY = 'm5nita.theme'

function createMemoryStorage() {
  const store = new Map<string, string>()
  return {
    getItem: vi.fn((k: string) => store.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => {
      store.set(k, v)
    }),
    removeItem: vi.fn((k: string) => {
      store.delete(k)
    }),
    clear: vi.fn(() => store.clear()),
    key: vi.fn(),
    length: 0,
  } as Storage & { getItem: ReturnType<typeof vi.fn> }
}

function createThrowingStorage() {
  return {
    getItem: vi.fn(() => {
      throw new Error('denied')
    }),
    setItem: vi.fn(() => {
      throw new Error('denied')
    }),
    removeItem: vi.fn(() => {
      throw new Error('denied')
    }),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0,
  } as unknown as Storage
}

async function freshImport() {
  vi.resetModules()
  const mod = await import('../theme/storage')
  return mod.themeStorage
}

describe('themeStorage', () => {
  let originalWindow: typeof globalThis.window | undefined

  beforeEach(() => {
    originalWindow = globalThis.window
  })

  afterEach(() => {
    if (originalWindow === undefined) {
      // @ts-expect-error reset test globals
      delete globalThis.window
    } else {
      globalThis.window = originalWindow
    }
    vi.restoreAllMocks()
  })

  it('themeStorage_readWithNoKey_returnsSystem', async () => {
    const storage = createMemoryStorage()
    globalThis.window = { localStorage: storage } as unknown as Window & typeof globalThis
    const themeStorage = await freshImport()
    expect(themeStorage.read()).toBe('system')
  })

  it('themeStorage_readWithInvalidValue_returnsSystemAndRemovesKey', async () => {
    const storage = createMemoryStorage()
    storage.setItem(STORAGE_KEY, 'purple')
    globalThis.window = { localStorage: storage } as unknown as Window & typeof globalThis
    const themeStorage = await freshImport()
    expect(themeStorage.read()).toBe('system')
    expect(storage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('themeStorage_writeThenRead_persistsPreference', async () => {
    const storage = createMemoryStorage()
    globalThis.window = { localStorage: storage } as unknown as Window & typeof globalThis
    const themeStorage = await freshImport()
    themeStorage.write('dark')
    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'dark')
    expect(themeStorage.read()).toBe('dark')
  })

  it('themeStorage_readWithValidValue_returnsStoredPreference', async () => {
    const storage = createMemoryStorage()
    storage.setItem(STORAGE_KEY, 'light')
    globalThis.window = { localStorage: storage } as unknown as Window & typeof globalThis
    const themeStorage = await freshImport()
    expect(themeStorage.read()).toBe('light')
  })

  it('themeStorage_storageThrows_readReturnsSystemAndWriteFallsBackToMemory', async () => {
    globalThis.window = { localStorage: createThrowingStorage() } as unknown as Window &
      typeof globalThis
    const themeStorage = await freshImport()
    expect(themeStorage.read()).toBe('system')
    expect(() => themeStorage.write('dark')).not.toThrow()
    expect(themeStorage.read()).toBe('dark')
  })
})
