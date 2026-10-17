'use client'

import React from 'react'

import type { SectionNode } from '@/lib/sectionTree'

import type { BlockDef } from './blockSchemas'
import { ElementLibrary } from './ElementLibrary'
import { FieldPanel } from './FieldPanel'
import type { EditDevice } from './DesignPanel'
import type { LockUi } from './LockControls'

export type DockTab = 'elements' | 'settings' | 'form' | 'navigator'

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
}) => {
  // Collapsed = the topbar's «/» toggle hid the whole dock so the canvas can
  // use the full width, same as Elementor's panel-collapse - nothing renders
  // here at all rather than a narrow icon rail, since the canvas's own
  // per-block "+" already covers adding elements while collapsed.
  if (collapsed) return null

  return (
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
          ⚙ Settings
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'navigator'}
          className={`ve-dock__tab ${tab === 'navigator' ? 've-dock__tab--active' : ''}`}
          onClick={() => onTabChange('navigator')}
        >
          📄 Navigator
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
          <ElementLibrary targetLabel={targetLabel} onPickBlock={onPickBlock} onPickTemplate={onPickTemplate} formMode={Boolean(formPanel)} />
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
}
