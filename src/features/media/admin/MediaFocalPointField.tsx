'use client'

import { useEffect, useState, type MouseEvent } from 'react'

import type { Field } from '@/engine'
import { useDocumentInfo, useField } from '@/engine/ui'

import { requestJson } from './mediaApi'

type FocalPointFieldProps = {
  field: Field
  path: string
  readOnly?: boolean
}

const clamp = (value: number): number => Math.min(100, Math.max(0, Math.round(value)))

/**
 * Sets where a picture's subject sits. Click the preview, or type the numbers.
 * Writes focalX here and focalY through the form, so the two always save as a
 * pair. Shows the picture once the document has been saved (it needs an id).
 */
export function MediaFocalPointField({ path, readOnly }: FocalPointFieldProps) {
  const focalX = useField<number>({ path })
  const focalY = useField<number>({ path: 'focalY' })
  const { id } = useDocumentInfo()
  const [src, setSrc] = useState<string | null>(null)

  const x = typeof focalX.value === 'number' ? focalX.value : 50
  const y = typeof focalY.value === 'number' ? focalY.value : 50

  useEffect(() => {
    if (id === undefined || id === null) return
    let active = true
    requestJson<{ media: { url: string | null } }>(`/api/admin-media-usage?id=${encodeURIComponent(String(id))}&scan=0`).then((result) => {
      if (active && result.ok === true && result.data.media.url) setSrc(result.data.media.url)
    })
    return () => {
      active = false
    }
  }, [id])

  const setPoint = (nextX: number, nextY: number) => {
    focalX.setValue(clamp(nextX))
    focalY.setValue(clamp(nextY))
  }

  const onPreviewClick = (event: MouseEvent<HTMLDivElement>) => {
    if (readOnly) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    setPoint(((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100)
  }

  return (
    <div className="flex flex-col gap-[10px]">
      {src ? (
        <div
          role="presentation"
          onClick={onPreviewClick}
          className="relative max-h-[260px] w-full max-w-[420px] cursor-crosshair overflow-hidden rounded-[4px] border border-[var(--theme-elevation-150)] bg-[var(--theme-elevation-50)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of the stored file */}
          <img src={src} alt="" className="block max-h-[260px] w-full object-contain" draggable={false} />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--ac-gold)] shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
            style={{ left: `${x}%`, top: `${y}%` }}
          />
        </div>
      ) : (
        <p className="m-0 text-[12px] text-[var(--theme-elevation-500)]">
          {id === undefined || id === null ? 'Save the picture to see its preview here.' : 'Loading the preview...'}
        </p>
      )}
      <div className="flex items-center gap-[12px]">
        <label className="flex items-center gap-[6px] text-[12px] text-[var(--theme-elevation-700)]">
          Left-right (%)
          <input
            type="number"
            min={0}
            max={100}
            disabled={readOnly}
            value={x}
            onChange={(event) => setPoint(Number(event.target.value) || 0, y)}
            className="w-[72px] rounded-[4px] border border-[var(--theme-elevation-200)] bg-transparent px-[6px] py-[4px] text-[12px]"
          />
        </label>
        <label className="flex items-center gap-[6px] text-[12px] text-[var(--theme-elevation-700)]">
          Up-down (%)
          <input
            type="number"
            min={0}
            max={100}
            disabled={readOnly}
            value={y}
            onChange={(event) => setPoint(x, Number(event.target.value) || 0)}
            className="w-[72px] rounded-[4px] border border-[var(--theme-elevation-200)] bg-transparent px-[6px] py-[4px] text-[12px]"
          />
        </label>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => setPoint(50, 50)}
          className="rounded-[4px] border border-[var(--theme-elevation-200)] px-[8px] py-[4px] text-[12px] text-[var(--theme-elevation-700)] hover:border-[var(--ac-gold)]"
        >
          Centre
        </button>
      </div>
    </div>
  )
}
