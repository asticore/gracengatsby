'use client'

import React from 'react'

/** Bottom-of-sidebar teaser link for the standalone Asticore SAAS product. Rendered via admin.components.afterNavLinks. */
export const AsticoreSaasComingSoon: React.FC = () => (
  <div style={{ padding: '12px 20px', marginTop: 'auto' }}>
    <button
      type="button"
      onClick={(e) => e.preventDefault()}
      style={{
        width: '100%',
        padding: '10px 14px',
        borderRadius: 8,
        border: '1px solid #c9a15a',
        background: 'transparent',
        color: '#c9a15a',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'default',
        opacity: 0.85,
      }}
    >
      Asticore SAAS - Coming Soon
    </button>
  </div>
)

export default AsticoreSaasComingSoon
