import React from 'react'

import { asBlockStyle, blockStyleClasses, blockStyleCss, blockStyleToCss } from '@/lib/blockStyle'
import { sectionLayoutProps } from '@/lib/sectionLayout'
import { columnWidthVars, parseColumns, type SectionColumn, type SectionNode } from '@/lib/sectionTree'

import { safeScope, StyledBlock } from './StyledBlock'

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
  /** The section's own design (its optional `layout` drives flow direction, gap, wrap...). */
  design?: unknown
  depth?: number
  /** Unique prefix for the responsive-CSS ids of everything inside (the section's own render key). */
  scope?: string
}> = ({ columns, renderNode, design, depth = 0, scope = 's' }) => {
  const parsed = parseColumns(columns)
  if (parsed.length === 0) return null
  const layout = sectionLayoutProps(asBlockStyle(design).layout)

  return (
    <div
      className={layout.className ? `be-section ${layout.className}` : 'be-section'}
      data-depth={depth}
      {...layout.attrs}
      style={Object.keys(layout.style).length > 0 ? (layout.style as React.CSSProperties) : undefined}
    >
      {parsed.map((column, index) => (
        <SectionColumnView
          key={column._id || index}
          column={column}
          index={index}
          renderNode={renderNode}
          depth={depth}
          scope={scope}
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
  scope: string
}> = ({ column, index, renderNode, depth, scope }) => {
  const design = asBlockStyle(column.design)
  const columnScope = `be-c-${safeScope(`${scope}-${index}`)}`
  // Tablet / mobile padding and hide settings of the column itself.
  const columnCss = blockStyleCss(design, design.anchorId || columnScope)

  return (
    <div
      id={design.anchorId || (columnCss ? columnScope : undefined)}
      className={`be-column ${blockStyleClasses(design)}`}
      style={{ ...columnWidthVars(column), ...blockStyleToCss(design) }}
    >
      {columnCss && <style dangerouslySetInnerHTML={{ __html: columnCss }} />}
      {(column.blocks || []).map((node, nodeIndex) => {
        const key = node._id || `${index}-${nodeIndex}`
        const nodeScope = `${scope}-${index}-${nodeIndex}`

        if (node.blockType === 'section') {
          return (
            <StyledBlock key={key} style={node.design} index={nodeIndex} scope={nodeScope}>
              <SectionBlock columns={node.columns} renderNode={renderNode} design={node.design} depth={depth + 1} scope={nodeScope} />
            </StyledBlock>
          )
        }

        return (
          <StyledBlock key={key} style={node.design} index={nodeIndex} scope={nodeScope}>
            {renderNode(node, key)}
          </StyledBlock>
        )
      })}
    </div>
  )
}
