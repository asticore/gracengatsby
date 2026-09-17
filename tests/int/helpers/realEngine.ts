// Test-only accessor for the REAL vendor Payload engine.
//
// STAGE 6e: `@/engine`'s own `getEngine()` now returns this app's own
// from-scratch `createEngine()` (`@/localapi/engine`) instead of real
// Payload's `getPayload()`. This project's parity tests need the actual
// vendor engine as their oracle - the thing a hand-built replacement is
// proven against - so they get it here directly, the same way
// `src/engine/index.ts` itself did before the flip.
//
// This deliberately bypasses the `@/engine` seam. The seam's own rule ("only
// src/engine/ may import the vendor package directly") governs the APP, not
// this project's test suite, which has always imported real Payload
// machinery directly for exactly this comparison purpose (e.g.
// `tests/int/localapi-auth-parity.int.spec.ts`'s own `makeRealAuthDb()`
// reaches straight into `@/cms/db`, and this project's very first parity
// tests, predating Stage 6e, already relied on `getEngine()` meaning "the
// real one" - this module keeps that meaning available now that the app's
// own `getEngine()` no longer provides it).
import { getPayload, type Payload } from 'payload'

import config from '@engage-config'

/** The real, vendor Payload engine - the oracle every parity test in this project compares a hand-built replacement against. */
export type RealEngine = Payload

export const getRealEngine = async (): Promise<RealEngine> => {
  const engineConfig = await config
  return getPayload({ config: engineConfig })
}
