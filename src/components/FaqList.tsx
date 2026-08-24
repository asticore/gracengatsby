import React from 'react'
import { RichText } from '@payloadcms/richtext-lexical/react'

import type { Faq } from '@/engage-types'

export const FaqList: React.FC<{ faqs: Faq[]; layout?: 'accordion' | 'list'; groupByCategory?: boolean }> = ({
  faqs,
  layout = 'accordion',
  groupByCategory = false,
}) => {
  if (!faqs.length) return null

  const groups = groupByCategory
    ? faqs.reduce<Record<string, Faq[]>>((acc, faq) => {
        const key = faq.category || 'General'
        acc[key] = acc[key] || []
        acc[key].push(faq)
        return acc
      }, {})
    : { '': faqs }

  return (
    <div className={`faq-list faq-list--${layout}`}>
      {Object.entries(groups).map(([category, items]) => (
        <div key={category || 'all'} className="faq-list__group">
          {category && <h3 className="faq-list__category">{category}</h3>}
          {items.map((faq) =>
            layout === 'accordion' ? (
              <details key={faq.id} className="faq-item">
                <summary className="faq-item__question">{faq.question}</summary>
                <div className="faq-item__answer">
                  <RichText data={faq.answer} />
                </div>
              </details>
            ) : (
              <div key={faq.id} className="faq-item faq-item--plain">
                <h4 className="faq-item__question">{faq.question}</h4>
                <div className="faq-item__answer">
                  <RichText data={faq.answer} />
                </div>
              </div>
            ),
          )}
        </div>
      ))}
    </div>
  )
}
