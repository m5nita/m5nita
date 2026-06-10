// After a deploy the built chunk hashes change. A tab opened before the deploy
// throws when it lazy-loads a route whose chunk no longer exists, which Vite
// surfaces as a `vite:preloadError` event (and otherwise a hard, uncatchable
// failure). Force a single reload to fetch the new index.html and current
// hashes. The sessionStorage guard prevents a reload loop when the asset is
// genuinely unavailable (e.g. the deploy is mid-flight or rolled back).
const RELOAD_FLAG = 'm5nita.preload-reload'

export function installChunkReloadHandler(win: Window = window): void {
  win.addEventListener('vite:preloadError', () => {
    if (win.sessionStorage.getItem(RELOAD_FLAG)) return
    win.sessionStorage.setItem(RELOAD_FLAG, '1')
    win.location.reload()
  })
}

// Called once the app has booted successfully so a later deploy in the same tab
// session can reload again.
export function clearChunkReloadGuard(win: Window = window): void {
  win.sessionStorage.removeItem(RELOAD_FLAG)
}
