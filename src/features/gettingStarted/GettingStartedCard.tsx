/**
 * Client component: getting-started checklist card with progress, items, and manual toggles.
 * Renders at the top of the dashboard.
 */

'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import type { ComputedProgress } from './compute'
import { GETTING_STARTED_ITEMS } from './items'
import styles from './GettingStartedCard.module.css'

export type GettingStartedCardProps = {
  progress: ComputedProgress
  initialDoneIds: string[]
  onDismiss?: () => void
}

/**
 * Visual progress bar with percent label.
 */
function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className={styles.progressContainer}>
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${percent}%` }} />
      </div>
      <span className={styles.progressLabel}>{percent}%</span>
    </div>
  )
}

/**
 * Single checklist item with link and toggle.
 */
function ChecklistItem({
  id,
  title,
  help,
  href,
  isDone,
  onToggle,
}: {
  id: string
  title: string
  help: string
  href: string
  isDone: boolean
  onToggle: (id: string, done: boolean) => Promise<void>
}) {
  const [isLoading, setIsLoading] = useState(false)

  const handleToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsLoading(true)
    try {
      await onToggle(id, e.target.checked)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={styles.item}>
      <div className={styles.itemContent}>
        <label className={styles.itemLabel}>
          <input
            type="checkbox"
            checked={isDone}
            onChange={handleToggle}
            disabled={isLoading}
            className={styles.itemCheckbox}
          />
          <span className={styles.itemTitle}>{title}</span>
        </label>
        <p className={styles.itemHelp}>{help}</p>
      </div>
      {!isDone && (
        <Link href={href} className={styles.itemLink}>
          Set up
        </Link>
      )}
    </div>
  )
}

/**
 * Main getting-started card component.
 */
export const GettingStartedCard: React.FC<GettingStartedCardProps> = ({
  progress,
  initialDoneIds,
  onDismiss,
}) => {
  const [isDismissed, setIsDismissed] = useState(false)
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set(initialDoneIds))
  const [isCollapsed, setIsCollapsed] = useState(false)

  const handleItemToggle = async (id: string, done: boolean) => {
    const newIds = new Set(doneIds)
    if (done) {
      newIds.add(id)
    } else {
      newIds.delete(id)
    }
    setDoneIds(newIds)

    // POST to API
    try {
      await fetch('/api/admin-getting-started', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          done,
        }),
      })
    } catch (error) {
      console.error('Failed to save getting-started state:', error)
      // Revert on error
      const reverted = new Set(doneIds)
      if (done) {
        reverted.delete(id)
      } else {
        reverted.add(id)
      }
      setDoneIds(reverted)
    }
  }

  const handleDismiss = async () => {
    if (onDismiss) {
      onDismiss()
    }
    setIsDismissed(true)
  }

  if (isDismissed || progress.percent === 100) {
    return null
  }

  return (
    <div className={styles.card} data-theme={typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : 'light'}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h2 className={styles.title}>Getting started</h2>
          <p className={styles.subtitle}>
            {progress.done} of {progress.total} tasks complete
          </p>
        </div>
        <div className={styles.controls}>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={styles.collapseBtn}
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? '▼' : '▲'}
          </button>
          <button
            onClick={handleDismiss}
            className={styles.dismissBtn}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>

      <ProgressBar percent={progress.percent} />

      {!isCollapsed && (
        <div className={styles.content}>
          {Object.entries(progress.byCategory)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, counts]) => (
              <div key={category} className={styles.category}>
                <h3 className={styles.categoryTitle}>
                  {category}
                  <span className={styles.categoryCount}>
                    {counts.done}/{counts.total}
                  </span>
                </h3>
                <div className={styles.items}>
                  {GETTING_STARTED_ITEMS.filter((item) => item.category === category).map(
                    (item) => (
                      <ChecklistItem
                        key={item.id}
                        {...item}
                        isDone={doneIds.has(item.id)}
                        onToggle={handleItemToggle}
                      />
                    ),
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
