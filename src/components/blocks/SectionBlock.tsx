import React from 'react'

import { asBlockStyle, blockStyleClasses, blockStyleToCss } from '@/lib/blockStyle'
import { columnWidthVars, parseColumns, type SectionColumn, type SectionNode } from '@/lib/sectionTree'

import { StyledBlock } from './StyledBlock'

/**
 * Renders a Section: a row of columns, each holding its own stack of blocks.
 *
 * Nesting is handled by recursion - a node whose blockType is 'section' renders
 * through this same component - so a layout can nest as deeply as the editor
 * builds it, with no schema limit.
 *
 * `renderNode` is injected rather than imported so this file does not have to
 * import BlockRenderer, which imports this file back. Passing the renderer down
 * breaks that cycle and keeps both usable on their own.
 */
export const SectionBlock: React.FC<{
  columns: unknown
  renderNode: (node: SectionNode, key: string) => React.ReactNode
  depth?: number
}> = ({ columns, renderNode, depth = 0 }) => {
  const parsed = parseColumns(columns)
  if (parsed.length === 0) return null

  return (
    <div className="be-section" data-depth={depth}>
      {parsed.map((column, index) => (
        <SectionColumnView
          key={column._id || index}
          column={column}
          index={index}
          renderNode={renderNode}
          depth={depth}
        />
      ))}
    </div>
  )
}

const SectionColumnView: React.FC<{
  column: SectionColumn
  index: number
  renderNode: (node: SectionNode, key: string) => React.ReactNode
  depth: number
}> = ({ column, index, renderNode, depth }) => {
  const design = asBlockStyle(column.design)

  return (
    <div
      className={`be-column ${blockStyleClasses(design)}`}
      style={{ ...columnWidthVars(column), ...blockStyleToCss(design) }}
    >
      {(column.blocks || []).map((node, nodeIndex) => {
        const key = node._id || `${index}-${nodeIndex}`

        if (node.blockType === 'section') {
          return (
            <StyledBlock key={key} style={node.design} index={nodeIndex}>
              <SectionBlock columns={node.columns} renderNode={renderNode} depth={depth + 1} />
            </StyledBlock>
          )
        }

        return (
          <StyledBlock key={key} style={node.design} index={nodeIndex}>
            {renderNode(node, key)}
          </StyledBlock>
        )
      })}
    </div>
  )
}
