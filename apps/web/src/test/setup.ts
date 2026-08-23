import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest's `test.globals` is off in this project (tests import `afterEach`
// etc. from 'vitest' explicitly), so @testing-library/react's own
// auto-cleanup — which only registers itself against a global `afterEach`
// — never ran. Without this, renders leaked across tests within a file and
// only surfaced as failures when a query happened to collide with a
// previous render's output.
afterEach(() => {
  cleanup()
})
