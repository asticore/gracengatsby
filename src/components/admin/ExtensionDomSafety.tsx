'use client'

import React, { useEffect } from 'react'

/**
 * Guards against a well-known class of crash: browser extensions (password
 * managers being the most common culprit - NordPass, 1Password, Dashlane,
 * LastPass all do this) inject their own DOM nodes into form fields for
 * autofill icons/overlays, often on a MutationObserver that runs outside
 * React's own render cycle. When React later tries to remove or reorder a
 * node it still thinks is there - but the extension already moved or removed
 * it - the browser throws `NotFoundError: Failed to execute 'removeChild' on
 * 'Node'` (or the `insertBefore` equivalent). That throw happens deep inside
 * ReactDOM's own commit code, not inside any component's render, so a React
 * error boundary (see admin/error.tsx) never sees it - the whole tree just
 * goes blank with nothing useful in the console.
 *
 * Document-edit views are the ones that hit this: they render many inputs
 * (title, slug, every field), each a target for an extension's injected
 * icon, while list views render a plain table extensions don't touch - which
 * matches this project's exact symptom (edit views blank, list views fine).
 *
 * The fix is the standard community workaround for this bug: make
 * `removeChild`/`insertBefore` check `contains()` first and no-op instead of
 * throwing when the node already isn't where React expects it. This runs
 * once, as early as possible in the admin app, and only ever changes
 * behavior for the exact case that would otherwise crash the page.
 */
export const ExtensionDomSafetyProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    const proto = Node.prototype as unknown as {
      removeChild<T extends Node>(this: Node, child: T): T
      insertBefore<T extends Node>(this: Node, newNode: T, referenceNode: Node | null): T
    }

    const originalRemoveChild = proto.removeChild
    const originalInsertBefore = proto.insertBefore

    proto.removeChild = function <T extends Node>(this: Node, child: T): T {
      if (child.parentNode !== this) {
        // Already moved/removed by something outside React (an extension's
        // own DOM patching) - nothing to do, and throwing here is what kills
        // the render.
        return child
      }
      return originalRemoveChild.call(this, child) as T
    }

    proto.insertBefore = function <T extends Node>(this: Node, newNode: T, referenceNode: Node | null): T {
      if (referenceNode && referenceNode.parentNode !== this) {
        // The reference node an extension relied on is gone; append instead
        // of throwing so the tree keeps rendering.
        return originalInsertBefore.call(this, newNode, null) as T
      }
      return originalInsertBefore.call(this, newNode, referenceNode) as T
    }

    return () => {
      proto.removeChild = originalRemoveChild
      proto.insertBefore = originalInsertBefore
    }
  }, [])

  return children
}
