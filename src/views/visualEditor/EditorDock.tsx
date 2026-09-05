'use client'

import React from 'react'

import type { SectionNode } from '@/lib/sectionTree'

import type { BlockDef } from './blockSchemas'
import { ElementLibrary } from './ElementLibrary'
import { FieldPanel } from './FieldPanel'

/**
 * The persistent left dock - Elementor's left sidebar, not a popup: Shows
 * either ElementLibrary (browse/search blocks and templates, click to insert)
 * or FieldPanel (the selected block's Content/Design fields) depending on
 * whether a block is selected. See VisualEditor.tsx for how selection drives
 * this - clicking a block selects it and shows settings, selecting nothing
 * shows the element browser for adding new blocks.
 */
export const EditorDock: React.FC<{
  collapsed: boolean
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
      {selectedNode && selectedDef && (
        <div className="ve-dock__header">
          <button
            type="button"
            className="ve-dock__back"
            onClick={onCloseSelected}
            aria-label="Back to element browser"
            title="Back to element browser"
          >
            Back
          </button>
          <span className="ve-dock__header-title">⚙ Settings</span>
        </div>
      )}

      <div className="ve-dock__body">
        {selectedNode && selectedDef ? (
          <FieldPanel
            blockDef={selectedDef}
            data={selectedNode}
            onChange={onChangeSelected}
            onClose={onCloseSelected}
            onDelete={onDeleteSelected}
            onDuplicate={onDuplicateSelected}
          />
        ) : (
          <ElementLibrary targetLabel={targetLabel} onPickBlock={onPickBlock} onPickTemplate={onPickTemplate} />
        )}
      </div>
    </div>
  )
}
