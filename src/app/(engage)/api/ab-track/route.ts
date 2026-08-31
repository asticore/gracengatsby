import { handleTrackRequest } from '@/features/abTesting'
import { getEngine } from '@/lib/engine'

// Where the browser reports a conversion. Kept as a thin passthrough: the
// deduplication, goal matching and rollup all live in the feature, so this
// route has nothing to get wrong.
export const POST = async (request: Request) => handleTrackRequest(await getEngine(), request)
