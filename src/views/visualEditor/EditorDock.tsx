'use client'

import React from 'react'

import type { SectionNode } from '@/lib/sectionTree'

import type { BlockDef } from './blockSchemas'
import { ElementLibrary } from './ElementLibrary'
import { FieldPanel } from './FieldPanel'

export type DockTab = 'elements' | 'settings'

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
          Settings
        </button>
      </div>

      <div className="ve-dock__body">
        {tab === 'elements' ? (
          <ElementLibrary targetLabel={targetLabel} onPickBlock={onPickBlock} onPickTemplate={onPickTemplate} />
        ) : selectedNode && selectedDef ? (
          <FieldPanel
            blockDef={selectedDef}
            data={selectedNode}
            onChange={onChangeSelected}
            onClose={onCloseSelected}
            onDelete={onDeleteSelected}
            onDuplicate={onDuplicateSelected}
          />
        ) : (
          <p className="ve-dock__empty">Select a block on the canvas to edit its settings.</p>
        )}
      </div>
    </div>
  )
}
