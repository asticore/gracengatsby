'use client'

import React, { useId } from 'react'
import { useCardOpen } from './collapseStore'
import './edit-collapse.css'

export type CollapsibleCardProps = {
  /** Stable id used to remember the open state per user. */
  id: string
  title: string
  children: React.ReactNode
  className?: string
}

/**
 * A card whose body can be folded away with its header button. The body stays
 * mounted when closed (only hidden), so form fields keep their values.
 */
export function CollapsibleCard({ id, title, children, className }: CollapsibleCardProps) {
  const [open, toggle] = useCardOpen(id)
  const bodyId = useId()
  const classes = ['ec-card', open ? 'ec-card--open' : 'ec-card--closed', className].filter(Boolean).join(' ')

  return (
    <section className={classes} data-collapse-id={id}>
      <h2 className="ec-card__heading">
        <button type="button" className="ec-card__toggle" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
          <span className="ec-card__chevron" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          <span className="ec-card__title">{title}</span>
        </button>
      </h2>
      <div id={bodyId} className="ec-card__body" hidden={!open}>
        {children}
      </div>
    </section>
  )
}

export default CollapsibleCard
