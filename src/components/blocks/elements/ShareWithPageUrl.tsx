'use client'

import React, { useSyncExternalStore } from 'react'

import { ShareButtonsElement } from './Wave36Elements'

const subscribe = () => () => {}
const href = () => window.location.href.split('#')[0] ?? ''
const server = () => ''

/** Share links for the page being viewed: server render has no address, so the client fills it in after hydration. */
export const ShareWithPageUrl: React.FC<Record<string, unknown>> = (props) => {
  const url = useSyncExternalStore(subscribe, href, server)
  return <ShareButtonsElement {...props} shareUrl={props.shareUrl || url} />
}
