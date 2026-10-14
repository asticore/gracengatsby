'use client'

import React from 'react'
import Link from 'next/link'

import { ConnectionStatus } from './ConnectionStatus'

/**
 * The notice at the top of the Communication settings screen. Provider keys are
 * no longer kept here, so this says where they are and shows which providers
 * are connected.
 */
export const ConnectionNotice: React.FC = () => (
  <div style={{ margin: '0 0 24px', padding: '12px 14px', borderLeft: '3px solid #2563eb', fontSize: 13, lineHeight: 1.5 }}>
    <p style={{ margin: '0 0 8px' }}>
      Email and text providers are connected on the Integrations page.{' '}
      <Link href="/admin/settings/site#integrations">Connect a provider on the Integrations page</Link>
    </p>
    <ConnectionStatus />
  </div>
)

export default ConnectionNotice
