import React from 'react'
import { RichText } from '@/engine/editor/react'

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

  const questionClassName = 'cursor-pointer font-[family-name:var(--font-display)] text-[1.05rem]'
  const answerClassName = 'mt-3 opacity-85'
  const itemClassName = 'faq-item mb-3 border border-[var(--color-line)] px-5 py-[18px]'

  return (
    <div>
      {Object.entries(groups).map(([category, items]) => (
        <div key={category || 'all'} className="mb-8">
          {category && (
            <h3 className="mb-3 text-[0.8rem] uppercase tracking-[0.08em] text-[var(--color-gold)]">
              {category}
            </h3>
          )}
          {items.map((faq) =>
            layout === 'accordion' ? (
              <details key={faq.id} className={itemClassName}>
                <summary className={questionClassName}>{faq.question}</summary>
                <div className={answerClassName}>
                  <RichText data={faq.answer} />
                </div>
              </details>
            ) : (
              <div key={faq.id} className={itemClassName}>
                <h4 className={questionClassName}>{faq.question}</h4>
                <div className={answerClassName}>
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
