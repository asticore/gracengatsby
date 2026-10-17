import React from 'react'

import { asBlockStyle, blockFxClasses, blockStyleClasses, blockStyleCss, blockStyleToCss } from '@/lib/blockStyle'
import { carouselStyle, parseSectionLayout, sectionLayoutProps } from '@/lib/sectionLayout'
import { columnWidthVars, parseColumns, type SectionColumn, type SectionNode } from '@/lib/sectionTree'

import { safeScope, StyledBlock } from './StyledBlock'
import './tabs.css'

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
  const rawLayout = asBlockStyle(design).layout
  const layout = sectionLayoutProps(rawLayout)
  const parsedLayout = parseSectionLayout(rawLayout)
  const display = parsedLayout?.display

  if (display === 'carousel') {
    // Every column is a slide in a horizontal scroll-snap track. All slides stay in the HTML (SEO);
    // the arrows are plain anchors to the neighbouring slide, so no JavaScript is needed.
    const uid = `be-${safeScope(scope)}`
    const count = parsed.length
    const slideId = (index: number) => `${uid}-s${index}`
    const arrows = parsedLayout?.carouselArrows === true && count > 1
    return (
      <div className="be-carousel" data-depth={depth} style={carouselStyle(rawLayout) as React.CSSProperties} role="region" aria-roledescription="carousel" aria-label="Carousel">
        <div className="be-carousel__track" tabIndex={0}>
          {parsed.map((column, index) => (
            <div
              key={column._id || index}
              id={slideId(index)}
              className="be-carousel__slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${count}`}
            >
              <SectionColumnView column={column} index={index} renderNode={renderNode} depth={depth} scope={scope} />
              {arrows && index > 0 && (
                <a className="be-carousel__arrow be-carousel__arrow--prev" href={`#${slideId(index - 1)}`} aria-label={`Previous slide, ${index} of ${count}`}>
                  <span aria-hidden="true">{'\u2039'}</span>
                </a>
              )}
              {arrows && index < count - 1 && (
                <a className="be-carousel__arrow be-carousel__arrow--next" href={`#${slideId(index + 1)}`} aria-label={`Next slide, ${index + 2} of ${count}`}>
                  <span aria-hidden="true">{'\u203a'}</span>
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (display === 'tabs' || display === 'accordion') {
    // Every panel is rendered into the HTML; only CSS (tabs) or <details> (accordion) hides it.
    const uid = `be-${safeScope(scope)}`
    const colorVar = parsedLayout?.tabsColor ? ({ '--be-tab-color': parsedLayout.tabsColor } as React.CSSProperties) : undefined
    if (display === 'accordion') {
      return (
        <div className="be-acc" data-depth={depth} style={colorVar}>
          {parsed.map((column, index) => (
            <details key={column._id || index} name={uid} className="be-acc__item" open={index === 0}>
              <summary className="be-acc__summary">{column.label || `Panel ${index + 1}`}</summary>
              <SectionColumnView
                column={column}
                index={index}
                renderNode={renderNode}
                depth={depth}
                scope={scope}
                panel={{ id: `${uid}-p${index}`, role: 'region' }}
              />
            </details>
          ))}
        </div>
      )
    }
    return (
      <div className="be-tabs" data-depth={depth} data-align={parsedLayout?.tabsAlign || 'start'} style={colorVar}>
        {parsed.map((column, index) => (
          <input
            key={`r-${column._id || index}`}
            type="radio"
            className="be-tabs__radio"
            name={uid}
            id={`${uid}-r${index}`}
            defaultChecked={index === 0}
            aria-label={column.label || `Tab ${index + 1}`}
          />
        ))}
        <div className="be-tabs__list" role="tablist">
          {parsed.map((column, index) => (
            <label key={column._id || index} htmlFor={`${uid}-r${index}`} id={`${uid}-t${index}`} className="be-tabs__tab" role="tab" aria-controls={`${uid}-p${index}`}>
              {column.label || `Tab ${index + 1}`}
            </label>
          ))}
        </div>
        <div className="be-tabs__panels">
          {parsed.map((column, index) => (
            <SectionColumnView
              key={column._id || index}
              column={column}
              index={index}
              renderNode={renderNode}
              depth={depth}
              scope={scope}
              panel={{ id: `${uid}-p${index}`, role: 'tabpanel', labelledBy: `${uid}-t${index}` }}
            />
          ))}
        </div>
      </div>
    )
  }

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
  /** Set when the column is a tab / accordion panel (id + ARIA role). */
  panel?: { id: string; role: 'tabpanel' | 'region'; labelledBy?: string }
}> = ({ column, index, renderNode, depth, scope, panel }) => {
  const design = asBlockStyle(column.design)
  const columnScope = `be-c-${safeScope(`${scope}-${index}`)}`
  // Tablet / mobile padding and hide settings of the column itself.
  const columnCss = blockStyleCss(design, design.anchorId || columnScope)

  return (
    <div
      id={design.anchorId || (columnCss ? columnScope : panel?.id)}
      role={panel?.role}
      aria-labelledby={panel?.labelledBy}
      className={`be-column ${blockStyleClasses(design)} ${blockFxClasses(design)}`}
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
