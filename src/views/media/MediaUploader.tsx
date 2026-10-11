'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react'

import {
  UPLOAD_CONCURRENCY,
  formatLimit,
  loadUploadRules,
  precheck,
  runPool,
  uploadFile,
  type UploadRules,
  type UploadedDoc,
} from '@/features/media/admin/uploadClient'

type Item = {
  key: number
  name: string
  size: number
  status: 'queued' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
  note?: string
  doc?: UploadedDoc
}

type Props = {
  /** `page` listens for drops and pastes anywhere on the screen; `inline` only reacts to its own box (pickers, forms). */
  scope?: 'page' | 'inline'
  /** Allow choosing several files at once. Pickers for a single value turn this off. */
  multiple?: boolean
  /** Folder the files are filed under. */
  folder?: string
  /** Called once after each batch with the files that were stored. */
  onUploaded?: (docs: UploadedDoc[]) => void
  label?: string
}

const buttonClass =
  'rounded-[4px] border border-[var(--ac-gold)] px-[calc(var(--base)*0.9)] py-[calc(var(--base)*0.5)] text-[calc(var(--base)*0.82)] font-medium text-[var(--ac-gold)] [transition:background-color_0.15s_ease,color_0.15s_ease] hover:bg-[var(--ac-gold)] hover:text-[var(--theme-elevation-0)] disabled:opacity-50'

let counter = 0

/**
 * Upload control for the media library: a button, drag and drop, paste from the
 * clipboard, several files at once, a progress bar per file and a plain message
 * per failure. A failed file never stops the others.
 */
export function MediaUploader({ scope = 'inline', multiple = true, folder, onUploaded, label = 'Upload files' }: Props) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<Item[]>([])
  const [rules, setRules] = useState<UploadRules | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const onUploadedRef = useRef(onUploaded)
  useEffect(() => {
    onUploadedRef.current = onUploaded
  }, [onUploaded])

  useEffect(() => {
    let active = true
    void loadUploadRules().then((loaded) => {
      if (active) setRules(loaded)
    })
    return () => {
      active = false
    }
  }, [])

  const patch = useCallback((key: number, change: Partial<Item>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)))
  }, [])

  const start = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const loaded = rules ?? (await loadUploadRules())
      const chosen = multiple ? files : files.slice(0, 1)
      const batch = chosen.map((file) => ({ file, key: (counter += 1) }))
      setItems((current) => [
        ...batch.map(({ file, key }): Item => ({ key, name: file.name || 'pasted file', size: file.size, status: 'queued', progress: 0 })),
        ...current,
      ])

      const stored: UploadedDoc[] = []
      await runPool(batch, UPLOAD_CONCURRENCY, async ({ file, key }) => {
        const problem = precheck(file, loaded)
        if (problem) {
          patch(key, { status: 'error', error: problem })
          return
        }
        patch(key, { status: 'uploading' })
        const outcome = await uploadFile(file, { folder, onProgress: (fraction) => patch(key, { progress: fraction }) })
        if (outcome.ok === true) {
          stored.push(outcome.doc)
          patch(key, {
            status: 'done',
            progress: 1,
            doc: outcome.doc,
            note: outcome.altDrafted ? 'Alt text was drafted from the file name. Please check it.' : undefined,
          })
        } else {
          patch(key, { status: 'error', error: outcome.error })
        }
      })
      if (stored.length > 0) onUploadedRef.current?.(stored)
    },
    [folder, multiple, patch, rules],
  )

  const startRef = useRef(start)
  useEffect(() => {
    startRef.current = start
  }, [start])

  // Page scope: a drop anywhere, or a paste anywhere outside a text box, uploads.
  useEffect(() => {
    if (scope !== 'page') return
    const hasFiles = (event: globalThis.DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')
    const onEnter = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) return
      dragDepth.current += 1
      setDragging(true)
    }
    const onOver = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) return
      // Without this the browser would open the file instead of handing it to us.
      event.preventDefault()
    }
    const onLeave = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    }
    const onDrop = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      void startRef.current(Array.from(event.dataTransfer?.files ?? []))
    }
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      const files = Array.from(event.clipboardData?.files ?? [])
      if (files.length === 0) return
      event.preventDefault()
      void startRef.current(files)
    }
    document.addEventListener('dragenter', onEnter)
    document.addEventListener('dragover', onOver)
    document.addEventListener('dragleave', onLeave)
    document.addEventListener('drop', onDrop)
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('dragenter', onEnter)
      document.removeEventListener('dragover', onOver)
      document.removeEventListener('dragleave', onLeave)
      document.removeEventListener('drop', onDrop)
      document.removeEventListener('paste', onPaste)
    }
  }, [scope])

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    void start(files)
  }

  // Inline scope: the box itself is the drop target and takes pastes while focused.
  const boxHandlers =
    scope === 'inline'
      ? {
          onDragOver: (event: DragEvent) => {
            event.preventDefault()
            setDragging(true)
          },
          onDragLeave: () => setDragging(false),
          onDrop: (event: DragEvent) => {
            event.preventDefault()
            setDragging(false)
            void start(Array.from(event.dataTransfer.files))
          },
          onPaste: (event: React.ClipboardEvent) => {
            const files = Array.from(event.clipboardData.files)
            if (files.length === 0) return
            event.preventDefault()
            void start(files)
          },
        }
      : {}

  const accept = rules?.accept.join(',')
  const finished = items.filter((item) => item.status === 'done' || item.status === 'error').length
  const live = items.some((item) => item.status === 'queued' || item.status === 'uploading')

  return (
    <div className="flex flex-col gap-[calc(var(--base)*0.5)]">
      <div
        {...boxHandlers}
        tabIndex={scope === 'inline' ? 0 : undefined}
        className={`flex flex-wrap items-center gap-[calc(var(--base)*0.6)] ${
          scope === 'inline'
            ? `rounded-[4px] border border-dashed p-[calc(var(--base)*0.6)] ${dragging ? 'border-[var(--ac-gold)] bg-[var(--theme-elevation-50)]' : 'border-[var(--theme-elevation-250,var(--theme-elevation-200))]'}`
            : ''
        }`}
      >
        <input ref={inputRef} id={inputId} type="file" multiple={multiple} accept={accept} onChange={onPick} className="sr-only" />
        <button type="button" className={buttonClass} onClick={() => inputRef.current?.click()}>
          {label}
        </button>
        <span className="text-[calc(var(--base)*0.72)] text-[var(--theme-elevation-500)]">
          {scope === 'page' ? 'or drop files anywhere on this page, or paste an image' : 'or drop files here, or paste an image'}
          {rules ? ` - up to ${formatLimit(rules.maxBytes)} each` : ''}
        </span>
      </div>

      {items.length > 0 ? (
        <div className="flex flex-col gap-[calc(var(--base)*0.35)]" aria-live="polite">
          <div className="flex items-center justify-between text-[calc(var(--base)*0.72)] text-[var(--theme-elevation-600)]">
            <span>
              {live ? `Uploading... ${finished} of ${items.length} finished` : `${items.filter((i) => i.status === 'done').length} uploaded, ${items.filter((i) => i.status === 'error').length} failed`}
            </span>
            {!live ? (
              <button type="button" className="text-[var(--theme-elevation-500)] hover:text-[var(--ac-gold)]" onClick={() => setItems([])}>
                Clear list
              </button>
            ) : null}
          </div>
          <ul className="m-0 flex max-h-[calc(var(--base)*14)] list-none flex-col gap-[calc(var(--base)*0.3)] overflow-y-auto p-0">
            {items.map((item) => (
              <li key={item.key} className="flex flex-col gap-[2px] rounded-[4px] border border-[var(--theme-elevation-150)] px-[calc(var(--base)*0.5)] py-[calc(var(--base)*0.3)] text-[calc(var(--base)*0.75)]">
                <div className="flex items-center justify-between gap-[8px]">
                  <span className="truncate font-medium text-[var(--theme-elevation-900)]">{item.name}</span>
                  <span className={item.status === 'error' ? 'text-[var(--theme-error-600,#c53030)]' : 'text-[var(--theme-elevation-600)]'}>
                    {item.status === 'queued' ? 'Waiting' : item.status === 'uploading' ? `${Math.round(item.progress * 100)}%` : item.status === 'done' ? 'Done' : 'Failed'}
                  </span>
                </div>
                {item.status === 'uploading' || item.status === 'queued' ? (
                  <progress value={item.progress} max={1} aria-label={`Uploading ${item.name}`} className="h-[4px] w-full" />
                ) : null}
                {item.error ? <span role="alert" className="text-[var(--theme-error-600,#c53030)]">{item.error}</span> : null}
                {item.note ? <span className="text-[var(--theme-elevation-500)]">{item.note}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {scope === 'page' && dragging ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[1000] flex items-center justify-center bg-[var(--theme-elevation-1000,#000)]/40"
        >
          <div className="rounded-[8px] border-2 border-dashed border-[var(--ac-gold)] bg-[var(--theme-elevation-0)] px-[calc(var(--base)*3)] py-[calc(var(--base)*2)] text-[calc(var(--base)*1)] font-medium text-[var(--theme-elevation-900)]">
            Drop files to upload
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** The library page's uploader: refreshes the list when files have been stored. Client wrapper so the server view can render it. */
export function MediaPageUploader({ folder }: { folder?: string }) {
  const router = useRouter()
  return <MediaUploader scope="page" folder={folder} onUploaded={() => router.refresh()} />
}
