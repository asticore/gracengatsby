'use client'

import React, { useCallback, useEffect, useId, useRef, useState } from 'react'

import type { SectionNode } from '@/lib/sectionTree'

import { AiBuilderPanel, type AiBuilderPanelProps } from './AiBuilderPanel'
import type { BlockDef } from './blockSchemas'
import { ElementLibrary } from './ElementLibrary'
import { FieldPanel } from './FieldPanel'
import type { EditDevice } from './DesignPanel'
import type { LockUi } from './LockControls'

export type DockTab = 'elements' | 'settings' | 'form' | 'navigator'

const GEAR = String.fromCharCode(0x2699)
const PAGE_ICON = String.fromCodePoint(0x1f4c4)
const SPARKLE = String.fromCharCode(0x2728)

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Focus trap step for the Build with AI dialog: the index to focus after a Tab press. `current` is the
 * focused item's index in the dialog's focusable list, or -1 when focus sits on the dialog itself.
 * Wraps at both ends, so Tab never leaves the dialog.
 */
export function nextFocusIndex(current: number, count: number, backwards: boolean): number {
  if (count <= 0) return -1
  if (backwards) return current <= 0 ? count - 1 : current - 1
  return current < 0 || current >= count - 1 ? 0 : current + 1
}

/**
 * Modal shell for the Build with AI panel. Same pattern as ImportExportModal (overlay, role="dialog",
 * Escape, backdrop click), plus a Tab focus trap and focus return to the opening button. It is always
 * mounted and hidden with the `hidden` attribute, so a half-written brief survives close and reopen.
 */
const AiBuildDialog: React.FC<{
  open: boolean
  onClose: () => void
  returnFocusTo: React.RefObject<HTMLButtonElement | null>
  panel: AiBuilderPanelProps
}> = ({ open, onClose, returnFocusTo, panel }) => {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const opener = returnFocusTo.current
    dialogRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      event.preventDefault()
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) {
        dialog.focus()
        return
      }
      const index = items.indexOf(document.activeElement as HTMLElement)
      items[nextFocusIndex(index, items.length, event.shiftKey)]?.focus()
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      opener?.focus()
    }
  }, [open, onClose, returnFocusTo])

  return (
    <div
      className="ve-ai-modal"
      role="presentation"
      hidden={!open}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div ref={dialogRef} className="ve-ai-modal__dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="ve-ai-modal__header">
          <h2 id={titleId} className="ve-ai-modal__title">
            Build with AI
          </h2>
          <button type="button" className="ve-btn ve-btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="ve-ai-modal__body">
          <AiBuilderPanel {...panel} showTitle={false} />
        </div>
      </div>
    </div>
  )
}

/**
 * The persistent left dock - Elementor's left sidebar, not a popup: Elements
 * (browse/search blocks and templates, click to insert) and Settings (the
 * selected block's Content/Design fields) share one panel with a tab
 * switcher instead of a modal-for-adding plus a separate right-hand panel
 * for editing. See VisualEditor.tsx for how the two tabs get driven -
 * selecting a block on the canvas switches here automatically, and so does
 * clicking any "+".
 */
export const EditorDock: React.FC<{
  collapsed: boolean
  tab: DockTab
  onTabChange: (tab: DockTab) => void
  targetLabel: string
  onPickBlock: (blockType: string) => void
  onPickTemplate: (blocks: SectionNode[]) => void
  selectedNode: Record<string, unknown> | undefined
  selectedDef: BlockDef | undefined
  onChangeSelected: (next: Record<string, unknown>) => void
  onCloseSelected: () => void
  onDeleteSelected: () => void
  onDuplicateSelected: () => void
  userPermissions?: { canEditStyle: boolean; canEditLayout: boolean } | null
  lockUi?: LockUi
  /** Form builder: the Form settings tab body. Its presence also puts the dock in form mode. */
  formPanel?: React.ReactNode
  /** The device being edited (top bar toggle); responsive settings in the panels follow it. */
  device?: EditDevice
  /** Settings for the column selected on the canvas; shown in place of a block's settings. */
  columnPanel?: React.ReactNode
  /** Opens a column of the selected section in the column panel. */
  onSelectColumn?: (index: number) => void
  /** Navigator panel showing all pages/posts/products/events/FAQs in tree view. */
  navigatorPanel?: React.ReactNode
  /** Converts the selected legacy block into editable sections (shown in its settings). */
  onConvertLegacy?: () => void
  /**
   * Build with AI. Its button sits at the top of the Elements tab and opens a dialog. Omit it in form
   * mode. The dialog stays mounted even when the dock is collapsed, so the brief is kept.
   */
  aiBuilder?: AiBuilderPanelProps
}> = ({
  collapsed,
  tab,
  onTabChange,
  targetLabel,
  onPickBlock,
  onPickTemplate,
  selectedNode,
  selectedDef,
  onChangeSelected,
  onCloseSelected,
  onDeleteSelected,
  onDuplicateSelected,
  userPermissions,
  lockUi,
  formPanel,
  device,
  columnPanel,
  onSelectColumn,
  navigatorPanel,
  onConvertLegacy,
  aiBuilder,
}) => {
  const [aiOpen, setAiOpen] = useState(false)
  const buildButtonRef = useRef<HTMLButtonElement>(null)

  const closeAi = useCallback(() => setAiOpen(false), [])

  // The dialog closes itself after a successful insert; the panel and its state stay mounted either way.
  const aiPanel: AiBuilderPanelProps | null = aiBuilder
    ? {
        ...aiBuilder,
        onInsertAtEnd: (sections) => {
          const ok = aiBuilder.onInsertAtEnd(sections)
          if (ok) setAiOpen(false)
          return ok
        },
        onReplaceSelected: (sections, sectionId) => {
          const ok = aiBuilder.onReplaceSelected(sections, sectionId)
          if (ok) setAiOpen(false)
          return ok
        },
      }
    : null

  // Collapsed = the topbar's "/" toggle hid the whole dock so the canvas can use the full width, same as
  // Elementor's panel-collapse. Only the dock markup is hidden; this component stays mounted, so the
  // Build with AI dialog and its draft survive a collapse.
  const dock = collapsed ? null : (
    <div className="ve-dock">
      <div className="ve-dock__tabs" role="tablist" aria-label="Editor panel">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'elements'}
          className={`ve-dock__tab ${tab === 'elements' ? 've-dock__tab--active' : ''}`}
          onClick={() => onTabChange('elements')}
        >
          + Elements
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'settings'}
          className={`ve-dock__tab ${tab === 'settings' ? 've-dock__tab--active' : ''}`}
          onClick={() => onTabChange('settings')}
        >
          {GEAR} Settings
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'navigator'}
          className={`ve-dock__tab ${tab === 'navigator' ? 've-dock__tab--active' : ''}`}
          onClick={() => onTabChange('navigator')}
        >
          {PAGE_ICON} Navigator
        </button>
        {formPanel && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'form'}
            className={`ve-dock__tab ${tab === 'form' ? 've-dock__tab--active' : ''}`}
            onClick={() => onTabChange('form')}
          >
            Form
          </button>
        )}
      </div>

      <div className="ve-dock__body">
        {tab === 'form' && formPanel ? (
          formPanel
        ) : tab === 'navigator' ? (
          navigatorPanel || <p className="ve-dock__empty">Navigator not available.</p>
        ) : tab === 'elements' ? (
          <>
            {aiBuilder && (
              <div className="ve-dock__ai">
                <button
                  ref={buildButtonRef}
                  type="button"
                  className="ve-dock__ai-btn"
                  aria-haspopup="dialog"
                  onClick={() => setAiOpen(true)}
                >
                  <span className="ve-dock__ai-glyph" aria-hidden="true">
                    {SPARKLE}
                  </span>
                  Build with AI
                </button>
              </div>
            )}
            <ElementLibrary targetLabel={targetLabel} onPickBlock={onPickBlock} onPickTemplate={onPickTemplate} formMode={Boolean(formPanel)} />
          </>
        ) : columnPanel ? (
          columnPanel
        ) : selectedNode && selectedDef ? (
          <FieldPanel
            blockDef={selectedDef}
            data={selectedNode}
            onChange={onChangeSelected}
            onClose={onCloseSelected}
            onDelete={onDeleteSelected}
            onDuplicate={onDuplicateSelected}
            userPermissions={userPermissions}
            lockUi={lockUi}
            device={device}
            onSelectColumn={onSelectColumn}
            onConvertLegacy={onConvertLegacy}
          />
        ) : (
          <p className="ve-dock__empty">Select a block on the canvas to edit its settings.</p>
        )}
      </div>
    </div>
  )

  return (
    <>
      {dock}
      {aiPanel && <AiBuildDialog open={aiOpen} onClose={closeAi} returnFocusTo={buildButtonRef} panel={aiPanel} />}
    </>
  )
}
