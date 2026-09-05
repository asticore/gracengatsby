import { handleTrackRequest } from '@/features/abTesting/conversions'
import { getEngine } from '@/lib/engine'

// Where the browser reports a conversion. Kept as a thin passthrough: the
// deduplication, goal matching and rollup all live in the feature, so this
// route has nothing to get wrong.
//
// Imports handleTrackRequest directly from ./conversions rather than the
// feature's barrel (@/features/abTesting). The barrel also re-exports
// ABResultsView - a React admin view that pulls in @/engine's admin UI
// surface - and Next bundles a route's imports by what the module graph
// actually reaches, not just by what's re-exported and unused. Going through
// the barrel here dragged that whole admin dependency chain into this public,
// high-traffic tracking endpoint's chunk, which is what surfaced as payload
// still appearing in this route's build output/dependency graph.
export const POST = async (request: Request) => handleTrackRequest(await getEngine(), request)
