import React from 'react'

/**
 * What the admin and the visual editor show instead of a real ad: a labelled
 * box at the unit's size. Pure and client-safe; it never loads a script.
 */
export const AdPlaceholder: React.FC<{ label?: string; detail?: string; height?: number; width?: number }> = ({ label = 'Ad placeholder', detail, height = 250, width }) => (
  <div className="engage-ad engage-ad--placeholder" role="img" aria-label={`${label} (preview only, no ad is loaded)`} style={{ minHeight: height, maxWidth: width, border: '1px dashed #888', background: 'rgba(127,127,127,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
    <strong>{label}</strong>
    <span>{detail ?? 'Preview only. Real ads load on the live site after marketing consent.'}</span>
  </div>
)
