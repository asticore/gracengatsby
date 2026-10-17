import React from 'react'

import { asBlockStyle, blockFxClasses, blockStyleClasses, blockStyleCss, blockStyleToCss } from '@/lib/blockStyle'
import {
  carouselStyle,
  gridStyle,
  hscrollStyle,
  modalStyleVars,
  parseSectionLayout,
  sectionLayoutProps,
  stackStyle,
  stickyStepsClass,
  stickyStepsStyle,
} from '@/lib/sectionLayout'
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
    // An arrow jumps one page (carouselPerView slides): with 2+ visible, the neighbour is already on screen and
    // a plain anchor to it would not scroll the track.
    const step = Math.max(1, parsedLayout?.carouselPerView ?? 1)
    const prevIndex = (index: number) => Math.max(0, index - step)
    const nextIndex = (index: number) => Math.min(count - 1, index + step)
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
                <a className="be-carousel__arrow be-carousel__arrow--prev" href={`#${slideId(prevIndex(index))}`} aria-label={`Previous slide, ${prevIndex(index) + 1} of ${count}`}>
                  <span aria-hidden="true">{'\\u2039'}</span>
                </a>
              )}
              {arrows && index < count - 1 && (
                <a className="be-carousel__arrow be-carousel__arrow--next" href={`#${slideId(nextIndex(index))}`} aria-label={`Next slide, ${nextIndex(index) + 1} of ${count}`}>
                  <span aria-hidden="true">{'\\u203a'}</span>
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (display === 'stack') {
    // Every column is a full-width card that sticks to the top of the viewport at its own offset
    // (top + index * offset), so the cards pile up as the page scrolls. Later cards paint above earlier ones.
    return (
      <div className="be-stack" data-depth={depth} style={stackStyle(rawLayout) as React.CSSProperties}>
        {parsed.map((column, index) => (
          <SectionColumnView
            key={column._id || index}
            column={column}
            index={index}
            renderNode={renderNode}
            depth={depth}
            scope={scope}
            extraStyle={{ '--be-stack-i': String(index), zIndex: String(index + 1) } as React.CSSProperties}
          />
        ))}
      </div>
    )
  }

  if (display === 'hscroll') {
    // Columns sit in one track. With scroll-driven animations (tabs.css, @supports) the section is a tall
    // wrapper and the track slides sideways while the page scrolls past it. Everywhere else the track is a
    // plain horizontal scroll-snap strip, so no column is ever hidden.
    return (
      <div className="be-hscroll" data-depth={depth} style={hscrollStyle(rawLayout) as React.CSSProperties}>
        <div className="be-hscroll__sticky" tabIndex={0} role="region" aria-label="Horizontal scroll">
          <div className="be-hscroll__track">
            {parsed.map((column, index) => (
              <SectionColumnView key={column._id || index} column={column} index={index} renderNode={renderNode} depth={depth} scope={scope} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (display === 'sticky-steps') {
    // The first column is the sticky side; the rest stack beside it as scrolling steps. Mobile is plain flow (tabs.css).
    const [lead, ...steps] = parsed
    return (
      <div className={stickyStepsClass(rawLayout)} data-depth={depth} style={stickyStepsStyle(rawLayout) as React.CSSProperties}>
        <div className="be-sticky-steps__lead">
          <SectionColumnView column={lead} index={0} renderNode={renderNode} depth={depth} scope={scope} />
        </div>
        <div className="be-sticky-steps__steps">
          {steps.map((column, index) => (
            <SectionColumnView key={column._id || index + 1} column={column} index={index + 1} renderNode={renderNode} depth={depth} scope={scope} />
          ))}
        </div>
      </div>
    )
  }

  if (display === 'grid') {
    // Each column is a grid cell. Columns per row step down on tablet / mobile in tabs.css (no JavaScript).
    const boxedWidth = layout.style['--be-boxed']
    const vars = { ...gridStyle(rawLayout), ...(boxedWidth ? { '--be-boxed': boxedWidth } : {}) }
    return (
      <div className={layout.className ? `be-grid ${layout.className}` : 'be-grid'} data-depth={depth} style={vars as React.CSSProperties}>
        {parsed.map((column, index) => (
          <SectionColumnView key={column._id || index} column={column} index={index} renderNode={renderNode} depth={depth} scope={scope} />
        ))}
      </div>
    )
  }

  if (display === 'modal') {
    // A checkbox holds the open state and labels toggle it, so no JavaScript is needed. The checkbox is
    // focusable (Space toggles it); the dialog and all columns stay in the HTML, hidden until opened.
    const uid = `be-${safeScope(scope)}`
    const toggleId = `${uid}-m`
    const label = parsedLayout?.modalLabel || 'Open'
    const triggerClass = parsedLayout?.modalStyle === 'link' ? 'be-modal__trigger be-modal__trigger--link' : 'be-modal__trigger be-modal__trigger--button'
    const colorVars = parsedLayout?.tabsColor ? { '--be-tab-color': parsedLayout.tabsColor } : {}
    return (
      <div className="be-modal" data-depth={depth} style={{ ...modalStyleVars(rawLayout), ...colorVars } as React.CSSProperties}>
        <input type="checkbox" id={toggleId} className="be-modal__toggle" aria-label={label} />
        <label htmlFor={toggleId} className={triggerClass}>
          {label}
        </label>
        <div className="be-modal__overlay">
          <label htmlFor={toggleId} className="be-modal__backdrop" aria-hidden="true" />
          <div className="be-modal__panel" role="dialog" aria-modal="true" aria-label={label}>
            <label htmlFor={toggleId} className="be-modal__close" aria-label="Close">
              <span aria-hidden="true">&times;</span>
            </label>
            <div className="be-modal__body">
              {parsed.map((column, index) => (
                <SectionColumnView key={column._id || index} column={column} index={index} renderNode={renderNode} depth={depth} scope={scope} />
              ))}
            </div>
          </div>
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
  /** Extra inline custom properties for this column (e.g. the stack card's index). */
  extraStyle?: React.CSSProperties
}> = ({ column, index, renderNode, depth, scope, panel, extraStyle }) => {
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
      style={{ ...columnWidthVars(column), ...blockStyleToCss(design), ...extraStyle }}
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
