import React from 'react'

/** Replaces the Payload wordmark on the login screen with the Asticore Engage mark. */
export const AsticoreLogo: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#1a1a1a" />
      <path
        d="M12 5.5L18 18.5H15.6L14.2 15.4H9.8L8.4 18.5H6L12 5.5ZM12 9.4L10.5 12.9H13.5L12 9.4Z"
        fill="#c9a15a"
      />
    </svg>
    <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--theme-text, #1a1a1a)' }}>
      Asticore Engage
    </span>
  </div>
)

export default AsticoreLogo
