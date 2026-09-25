'use client'

/** From-scratch replacement for `@payloadcms/ui`'s `Hamburger`. Presentational only. */

import React from 'react'

export const Hamburger: React.FC<{ isActive?: boolean }> = ({ isActive }) => (
  <div className={`hamburger${isActive ? ' hamburger--active' : ''}`}>
    <div className="hamburger__line" />
    <div className="hamburger__line" />
    <div className="hamburger__line" />
  </div>
)

export default Hamburger
