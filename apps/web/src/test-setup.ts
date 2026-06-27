import '@testing-library/jest-dom/vitest'

// jsdom does not implement URL.createObjectURL / revokeObjectURL — stub them
// so tests that exercise download-fallback paths don't crash.
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = () => 'blob:mock'
  URL.revokeObjectURL = () => {}
}
