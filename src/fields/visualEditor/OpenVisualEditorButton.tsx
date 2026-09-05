'use client'

import React from 'react'
import { useDocumentInfo } from '@/engine/ui'

/**
 * Small "Edit Visually" link shown above the normal admin form on any
 * collection/global wired into the visual editor (see
 * src/views/visualEditor/surfaces.ts). Links out to the drag-and-drop
 * canvas for this exact document.
 */
export const OpenVisualEditorButton: React.FC = () => {
  const { id, collectionSlug, globalSlug } = useDocumentInfo()

  const href = globalSlug
    ? `/admin/visual-editor/global/${globalSlug}`
    : collectionSlug && id
      ? `/admin/visual-editor/collection/${collectionSlug}/${id}`
      : null

  if (!href) return null

  return (
    <div style={{ padding: '0 32px', marginBottom: 8 }}>
      <a
        href={href}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 14px',
          borderRadius: 6,
          background: '#1d1b19',
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        🎨 Edit visually
      </a>
    </div>
  )
}

export default OpenVisualEditorButton
