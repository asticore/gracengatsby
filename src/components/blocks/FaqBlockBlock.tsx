import { FaqList } from '@/components/FaqList'
import { getPayloadClient } from '@/lib/payload'
import type { Faq } from '@/payload-types'

export async function FaqBlockBlock({
  heading,
  source,
  category,
  faqs,
}: {
  heading?: string | null
  source?: 'category' | 'manual' | null
  category?: string | null
  faqs?: (number | string | Faq)[] | null
}) {
  const payload = await getPayloadClient()
  let items: Faq[] = []

  if (source === 'manual' && faqs?.length) {
    const ids = faqs.map((f) => (typeof f === 'object' ? f.id : f))
    const { docs } = await payload.find({ collection: 'faqs', where: { id: { in: ids } }, limit: 100 })
    items = docs as Faq[]
  } else {
    const { docs } = await payload.find({
      collection: 'faqs',
      where: category ? { category: { equals: category } } : undefined,
      sort: 'order',
      limit: 100,
    })
    items = docs as Faq[]
  }

  if (!items.length) return null

  return (
    <section className="built-block built-block--faq">
      <div className="page-shell built-block__inner">
        {heading && <h2>{heading}</h2>}
        <FaqList faqs={items} layout="accordion" />
      </div>
    </section>
  )
}
