import { getElementDef } from '@/lib/elements/registry'
import { paragraph } from '@/lib/elements/wave26Defs'
import type { BlockStyle } from '@/lib/blockStyle'
import type { SectionNode } from '@/lib/sectionTree'

export type TemplateKind = 'page' | 'section'

export const TEMPLATE_CATEGORY_OPTIONS = [
  { value: 'hero', label: 'Hero' },
  { value: 'features', label: 'Features' },
  { value: 'cta', label: 'Call to action' },
  { value: 'gallery', label: 'Gallery' },
  { value: 'testimonials', label: 'Testimonials' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'team', label: 'Team' },
  { value: 'faq', label: 'FAQ' },
  { value: 'contact', label: 'Contact' },
  { value: 'shop', label: 'Shop' },
  { value: 'blog', label: 'Blog' },
  { value: 'header', label: 'Header' },
  { value: 'footer', label: 'Footer' },
  { value: 'other', label: 'Other' },
] as const

export type TemplateCategory = (typeof TEMPLATE_CATEGORY_OPTIONS)[number]['value']

/**
 * Curated multi-block starting points ("Hero + features + CTA", etc.) -
 * these aren't stored anywhere, they're just a shorthand for dropping a
 * handful of blocks at once instead of one at a time. Alongside the
 * "Templates" source tab in the element library also lists the real Page
 * Templates collection (see TemplateLibrary.tsx), which IS admin-editable;
 * these presets are the "start from a real layout" option that doesn't
 * require anyone to have built a Page Template first.
 *
 * Every block here is a bare object built from the same shape the block
 * schemas' own `defaultValue()` produces - ElementLibrary runs each through
 * `cloneNode` before inserting, which assigns real ids, so none are set here.
 *
 * Presets use only the lean base elements (the ones not marked `hidden` in the
 * registry) and section display modes. Hidden types stay in the registry so
 * saved pages still render, but no preset may build one.
 */

export type TemplatePreset = {
  slug: string
  name: string
  description: string
  kind: TemplateKind
  category: TemplateCategory
  blocks: () => SectionNode[]
}

/** An `element` block built from the element's own defaults, with a few props overridden. */
const el = (elementType: string, props: Record<string, unknown> = {}): SectionNode => ({
  blockType: 'element',
  elementType,
  props: { ...(getElementDef(elementType)?.defaultProps() || {}), ...props },
})

const col = (width: number, blocks: SectionNode[], design?: BlockStyle) => ({ width: width as 12, blocks, ...(design ? { design } : {}) })
const section = (...columns: ReturnType<typeof col>[]): SectionNode => ({ blockType: 'section', columns })
const heading = (text: string, align = 'center', tag = 'h2') => el('heading', { text, tag, align })

/** A section shown as tabs / accordion: every panel is one full-width column titled by `label`. */
const panelSection = (display: 'tabs' | 'accordion', panels: { label: string; blocks: SectionNode[] }[]): SectionNode => ({
  blockType: 'section',
  design: { layout: { display } },
  columns: panels.map((p) => ({ width: 12 as const, label: p.label, blocks: p.blocks })),
})
const panelBlocks = (title: string, body: string): SectionNode[] => [heading(title, 'left', 'h3'), el('text-editor', { align: 'left', content: paragraph(body) })]

/** A section shown as a carousel: every column is one slide holding a heading and some text. */
const carouselSection = (slides: { title: string; body: string }[]): SectionNode => ({
  blockType: 'section',
  design: { layout: { display: 'carousel' } },
  columns: slides.map((s) => ({ width: 12 as const, blocks: panelBlocks(s.title, s.body) })),
})

/** A section shown as a grid: every column is one equal cell holding a heading and some text. */
const gridSection = (cells: { title: string; body: string }[], columns: number): SectionNode => ({
  blockType: 'section',
  design: { layout: { display: 'grid', gridColumns: columns } },
  columns: cells.map((c) => ({ width: 12 as const, blocks: panelBlocks(c.title, c.body) })),
})

/** A section shown as a grid of pictures: every column is one equal cell holding one image element. */
const imageGridSection = (count: number, columns: number): SectionNode => ({
  blockType: 'section',
  design: { layout: { display: 'grid', gridColumns: columns } },
  columns: Array.from({ length: count }, (_, i) => col(12, [el('image', { ratio: '4:3', alt: `Gallery picture ${i + 1}` })])),
})

/** A section shown as a popup: one column of content behind a button. */
const modalSection = (label: string, title: string, body: string): SectionNode => ({
  blockType: 'section',
  design: { layout: { display: 'modal', modalLabel: label, modalWidth: 640 } },
  columns: [{ width: 12 as const, blocks: panelBlocks(title, body) }],
})

/** A full-width band with its own background (colour here; switch it to an image under the section's Design). */
const band = (design: Record<string, unknown>, ...columns: ReturnType<typeof col>[]): SectionNode => ({
  blockType: 'section',
  design: { bgType: 'color', bgColor: '#111827', textColor: '#ffffff', paddingTop: 80, paddingBottom: 80, ...design },
  columns,
})
const button = (text: string, url: string, variant = 'primary', align = 'center') => el('button', { text, url, variant, align })

/** Hero built from element blocks: a background band holding a heading, a paragraph and a button. */
const heroBand = (title: string, text: string, buttonText: string, buttonUrl: string): SectionNode =>
  band({ minHeight: 480, bgOverlay: 45 }, col(12, [heading(title, 'center', 'h1'), el('text-editor', { align: 'center', content: paragraph(text) }), button(buttonText, buttonUrl)]))

/** Closing call to action built from element blocks. */
const ctaBand = (title: string, text: string, buttonText: string, buttonUrl: string, light = false): SectionNode =>
  band(light ? { bgColor: '#f3f4f6', textColor: '#111827', paddingTop: 56, paddingBottom: 56 } : { paddingTop: 56, paddingBottom: 56 }, col(12, [heading(title, 'center', 'h2'), el('text-editor', { align: 'center', content: paragraph(text) }), button(buttonText, buttonUrl)]))

/** Picture beside heading + text, both editable straight on the canvas. */
const imageTextRow = (side: 'left' | 'right', title: string): SectionNode => {
  const picture = col(6, [el('image', { ratio: '4:3' })])
  const words = col(6, [heading(title, 'left', 'h2'), el('text-editor', { align: 'left' }), button('Learn more', '/about', 'secondary', 'left')])
  return section(...(side === 'left' ? [picture, words] : [words, picture]))
}

/** A heading over a grid of pictures. */
const galleryBlocks = (title: string): SectionNode[] => [section(col(12, [heading(title)])), imageGridSection(6, 3)]

/** One card element in its own column. Card props: see wave47Defs.ts. */
const cardCol = (width: number, props: Record<string, unknown>) => col(width, [el('card', props)])

const FEATURE_ITEMS: Array<[string, string, string]> = [
  ['leaf', 'Made to last', 'Quality materials and honest craft in every piece.'],
  ['sparkle', 'Thoughtful details', 'Small touches that make it a pleasure to use.'],
  ['heart', 'Loved by customers', 'Real people who keep coming back.'],
  ['check', 'Easy returns', 'Not right? Send it back within 30 days.'],
]

/** Plan features as the pricing-table repeater expects them. A line starting with "- " is not included. */
const planFeatures = (lines: string[]) => lines.map((line) => (line.startsWith('- ') ? { text: line.slice(2), included: false } : { text: line, included: true }))

const pricingPlan = (title: string, price: string, features: string, highlight = false, period = '/ month') =>
  el('pricing-table', { title, price, period, features: planFeatures(features.split('\n')), highlight, ribbon: highlight ? 'Most popular' : '', buttonText: `Choose ${title}`, buttonUrl: '/contact' })

/** White card styling for a column used as a card (padding, 1px border, rounded, medium shadow). */
const CARD_DESIGN: BlockStyle = {
  bgType: 'color',
  bgColor: '#ffffff',
  textColor: '#111827',
  paddingTop: 28,
  paddingBottom: 28,
  paddingLeft: 28,
  paddingRight: 28,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '#e5e7eb',
  borderRadius: 12,
  boxShadow: 'md',
}
/** The highlighted card: same styling, accent-coloured 2px border. */
const HIGHLIGHT_CARD_DESIGN: BlockStyle = { ...CARD_DESIGN, borderWidth: 2, borderColor: '#6366f1' }

const pricingCard = (name: string, price: string, features: string[], highlight = false) => {
  const items = features.map((text) => ({ text, href: '' }))
  return col(
    4,
    [
      heading(name, 'center', 'h3'),
      heading(`$${price}`, 'center', 'h2'),
      el('text-editor', { align: 'center', content: paragraph('per month') }),
      el('list', { items, marker: 'check', align: 'left' }),
      button(`Choose ${name}`, '/contact', highlight ? 'primary' : 'secondary'),
    ],
    highlight ? HIGHLIGHT_CARD_DESIGN : CARD_DESIGN,
  )
}

const teamCard = (name: string, role: string, bio: string) =>
  col(
    4,
    [
      el('image', { ratio: '1:1', alt: `Photo of ${name}` }),
      heading(name, 'center', 'h3'),
      el('text-editor', { align: 'center', content: paragraph(role) }),
      el('text-editor', { align: 'center', content: paragraph(bio) }),
    ],
    CARD_DESIGN,
  )

/** One timeline step: the year on the left, a card on the right with a heading, text, a list and a button. */
const timelineStep = (year: string, title: string, body: string, points: string[]): SectionNode =>
  section(
    col(3, [heading(year, 'left', 'h3')]),
    col(
      9,
      [
        heading(title, 'left', 'h3'),
        el('text-editor', { align: 'left', content: paragraph(body) }),
        el('list', { items: points.map((text) => ({ text, href: '' })), marker: 'check', align: 'left' }),
        button('Read more', '/about', 'secondary', 'left'),
      ],
      CARD_DESIGN,
    ),
  )

/** A section with its own design (background, effects) and columns. */
const sectionWith = (design: BlockStyle, ...columns: ReturnType<typeof col>[]): SectionNode => ({ blockType: 'section', design, columns })
/** Adds design keys to a block without dropping any it already has. */
const withDesign = (node: SectionNode, design: BlockStyle): SectionNode => ({ ...node, design: { ...(node.design ?? {}), ...design } })

/** Effect pack: every value below is a real BlockStyle key (see sanitizeFx in src/lib/blockStyle.ts). */
const FADE_UP: BlockStyle = { reveal: 'fade-up', revealDistance: 24, revealDuration: 50 }
const AURORA_BG: BlockStyle = {
  bgType: 'color',
  bgColor: '#0f172a',
  textColor: '#ffffff',
  paddingTop: 96,
  paddingBottom: 96,
  minHeight: 520,
  bgEffect: 'aurora',
  bgEffectColor: '#6366f1',
  bgEffectColor2: '#22d3ee',
  bgEffectIntensity: 60,
  auroraBlur: 80,
  auroraSize: 35,
  auroraSpeed: 18,
  overlayType: 'none',
  dividerBottom: 'wave',
  dividerBottomColor: '#ffffff',
  dividerBottomHeight: 80,
  dividerBottomAnim: 'drift',
  dividerBottomSpeed: 14,
}
const GRAIN_BG: BlockStyle = { bgType: 'color', bgColor: '#f5f0e6', textColor: '#1c1917', paddingTop: 96, paddingBottom: 96, bgEffect: 'grain', grainOpacity: 18, grainSize: 160 }
const SHIFT_BG: BlockStyle = {
  bgType: 'color',
  bgColor: '#0f172a',
  textColor: '#f8fafc',
  paddingTop: 88,
  paddingBottom: 88,
  bgEffect: 'gradient-shift',
  bgEffectColor: '#6366f1',
  bgEffectColor2: '#14b8a6',
  gradientAngle: 120,
  gradientSpeed: 16,
}
const GLASS_CARD: BlockStyle = {
  glass: true,
  glassBlur: 14,
  glassOpacity: 14,
  glassBorder: 40,
  borderRadius: 16,
  paddingTop: 32,
  paddingBottom: 32,
  paddingLeft: 28,
  paddingRight: 28,
  hover: 'lift',
  hoverLift: 10,
  reveal: 'fade-up',
  revealDistance: 32,
  revealDuration: 50,
}
const NEON_BG: BlockStyle = { bgType: 'color', bgColor: '#05060f', textColor: '#e0e7ff', paddingTop: 88, paddingBottom: 88, bgEffect: 'grid', bgEffectColor: '#22d3ee', gridSize: 48, gridLineWidth: 1 }
const SPOTLIGHT_BG: BlockStyle = {
  bgType: 'color',
  bgColor: '#0b1020',
  textColor: '#f8fafc',
  paddingTop: 88,
  paddingBottom: 88,
  pointerFx: 'spotlight',
  pointerFxStrength: 60,
  spotlightColor: 'rgba(99,102,241,0.35)',
}
const TILT_BLOCK: BlockStyle = { pointerFx: 'tilt', pointerFxStrength: 40 }

const counter = (value: number, prefix: string, suffix: string, title: string) =>
  el('counter', { number: value, prefix, suffix, title, decimals: 0, separator: true, animate: true, start: 0, duration: 1600, align: 'center' })

/** The FAQ panels, shared by the accordion section and the full landing page. */
const FAQ_PANELS = [
  { label: 'How long is delivery?', blocks: panelBlocks('Delivery', 'Usually 3 to 5 working days.') },
  { label: 'Can I return something?', blocks: panelBlocks('Returns', 'Yes, within 30 days.') },
  { label: 'Do you ship abroad?', blocks: panelBlocks('Shipping abroad', 'Yes, to most countries.') },
]

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    slug: 'hero-simple',
    name: 'Simple hero',
    description: 'Heading, subheading, one button.',
    kind: 'section',
    category: 'hero',
    blocks: () => [
      heroBand('New heading', 'Add a line of supporting copy here.', 'Learn more', '/'),
    ],
  },
  {
    slug: 'hero-centered',
    name: 'Centered hero',
    description: 'A big centred headline, a short paragraph and two buttons.',
    kind: 'section',
    category: 'hero',
    blocks: () => [section(col(12, [heading('A headline that says it all', 'center', 'h1'), el('text-editor', { align: 'center' }), button('Get started', '/contact'), button('Learn more', '/about', 'secondary')]))],
  },
  {
    slug: 'hero-split-image',
    name: 'Split hero with image',
    description: 'Headline, text and buttons on the left, a picture on the right.',
    kind: 'section',
    category: 'hero',
    blocks: () => [
      section(
        col(6, [heading('Welcome to our shop', 'left', 'h1'), el('text-editor', { align: 'left' }), button('Get started', '/contact', 'primary', 'left')]),
        col(6, [el('image', { ratio: '4:3' })]),
      ),
    ],
  },
  {
    slug: 'hero-story',
    name: 'Hero with story',
    description: 'A hero banner followed by an image-and-text story section.',
    kind: 'section',
    category: 'hero',
    blocks: () => [
      heroBand('Our story', 'Where we started and what we care about.', 'Read more', '/about'),
      imageTextRow('right', 'Our story'),
    ],
  },
  {
    slug: 'hero-story-cta',
    name: 'Hero + story + CTA',
    description: 'Hero banner, an image-and-text section, and a call-to-action banner.',
    kind: 'page',
    category: 'hero',
    blocks: () => [
      heroBand('New heading', 'Add a line of supporting copy here.', 'Shop now', '/shop'),
      imageTextRow('left', 'What we do'),
      ctaBand('New call to action', 'Tell people what to do next.', 'Get started', '/'),
    ],
  },
  {
    slug: 'three-up-features',
    name: 'Three-column features',
    description: 'A section with three equal columns, each with a rich text block to fill in.',
    kind: 'section',
    category: 'features',
    blocks: () => [
      {
        blockType: 'section',
        columns: [
          { width: 4, blocks: [el('text-editor')] },
          { width: 4, blocks: [el('text-editor')] },
          { width: 4, blocks: [el('text-editor')] },
        ],
      },
    ],
  },
  {
    slug: 'features-3up-icons',
    name: 'Features, 3 icon cards',
    description: 'A heading over three cards, each with an icon, a title and a short text.',
    kind: 'section',
    category: 'features',
    blocks: () => [
      section(col(12, [heading('Why choose us')])),
      section(...FEATURE_ITEMS.slice(0, 3).map(([icon, title, text]) => cardCol(4, { media: 'icon', icon, title, text, hoverEffect: 'lift', align: 'left' }))),
    ],
  },
  {
    slug: 'features-4up-icons',
    name: 'Features, 4 icon cards',
    description: 'A heading over four cards, each with an icon, a title and a short text.',
    kind: 'section',
    category: 'features',
    blocks: () => [
      section(col(12, [heading('What you get')])),
      section(...FEATURE_ITEMS.map(([icon, title, text]) => cardCol(3, { media: 'icon', icon, title, text, hoverEffect: 'lift', align: 'left', iconSize: 36 }))),
    ],
  },
  {
    slug: 'cta-banner',
    name: 'Call to action',
    description: 'A centred band with a heading, a line of text and a button, on a coloured background.',
    kind: 'section',
    category: 'cta',
    blocks: () => [ctaBand('Ready when you are', 'Tell people what to do next.', 'Get started', '/contact')],
  },
  {
    slug: 'cta-two-buttons',
    name: 'Call to action, two buttons',
    description: 'A centred band with a heading, text and two buttons.',
    kind: 'section',
    category: 'cta',
    blocks: () => [
      band({ paddingTop: 56, paddingBottom: 56 }, col(12, [heading('Ready to get started?', 'center', 'h2'), el('text-editor', { align: 'center', content: paragraph('Join us today.') }), button('Get started', '/contact'), button('Talk to us', '/contact', 'secondary')])),
    ],
  },
  {
    slug: 'icon-box-set',
    name: 'Icon cards',
    description: 'Three cards side by side, each with an icon, a heading and a short text.',
    kind: 'section',
    category: 'features',
    blocks: () => [
      section(
        cardCol(4, { media: 'icon', icon: 'leaf', title: 'Made to last', text: 'A short line about why it matters.', align: 'centre', shadow: 'sm', hoverEffect: 'lift' }),
        cardCol(4, { media: 'icon', icon: 'sparkle', title: 'Thoughtful details', text: 'A short line about the details.', align: 'centre', shadow: 'sm', hoverEffect: 'lift' }),
        cardCol(4, { media: 'icon', icon: 'heart', title: 'Loved by customers', text: 'A short line about your customers.', align: 'centre', shadow: 'sm', hoverEffect: 'lift' }),
      ),
    ],
  },
  {
    slug: 'image-box-set',
    name: 'Image cards',
    description: 'Three cards side by side, each with a picture, a heading and a short text. The picture zooms on hover.',
    kind: 'section',
    category: 'features',
    blocks: () => [
      section(
        cardCol(4, { media: 'image', imageRatio: '4:3', title: 'A title for the picture', text: 'A short description under the picture.', align: 'left', shadow: 'sm', hoverEffect: 'zoom-image' }),
        cardCol(4, { media: 'image', imageRatio: '4:3', title: 'Another picture', text: 'Tell people what this one shows.', align: 'left', shadow: 'sm', hoverEffect: 'zoom-image' }),
        cardCol(4, { media: 'image', imageRatio: '4:3', title: 'One more', text: 'Add a line about this picture.', align: 'left', shadow: 'sm', hoverEffect: 'zoom-image' }),
      ),
    ],
  },
  {
    slug: 'testimonial-quote',
    name: 'Testimonial (quote + name)',
    description: 'A quotation with the customer name beneath.',
    kind: 'section',
    category: 'testimonials',
    blocks: () => [section(col(12, [el('quote', { text: 'Exactly what I hoped for. Will order again.', cite: '', style: 'large', align: 'center' }), heading('Sam T.', 'center', 'h3')]))],
  },
  {
    slug: 'testimonial-single',
    name: 'Testimonial',
    description: 'One customer testimonial with a quote, name, role and stars.',
    kind: 'section',
    category: 'testimonials',
    blocks: () => [section(col(12, [el('testimonial', { quote: 'Beautiful quality and it arrived the next day.', name: 'Alex P.', role: 'Customer', stars: 5, align: 'center' })]))],
  },
  {
    slug: 'gallery-grid',
    name: 'Image gallery',
    description: 'A heading and a grid of six pictures to fill in.',
    kind: 'section',
    category: 'gallery',
    blocks: () => galleryBlocks('Gallery'),
  },
  {
    slug: 'gallery-cta',
    name: 'Gallery + CTA',
    description: 'An image gallery followed by a call-to-action banner.',
    kind: 'section',
    category: 'gallery',
    blocks: () => [
      ...galleryBlocks('Gallery'),
      ctaBand('New call to action', 'Tell people what to do next.', 'Get started', '/', true),
    ],
  },
  {
    slug: 'testimonials-3up',
    name: 'Testimonials, 3 up',
    description: 'A heading over three customer quotes.',
    kind: 'section',
    category: 'testimonials',
    blocks: () => [
      section(col(12, [heading('What people say')])),
      section(
        col(4, [el('testimonial')]),
        col(4, [el('testimonial', { quote: 'Exactly what I hoped for. Will order again.', name: 'Sam T.' })]),
        col(4, [el('testimonial', { quote: 'Friendly service and lovely packaging.', name: 'Riley K.' })]),
      ),
    ],
  },
  {
    slug: 'pricing-3-plans',
    name: 'Pricing, 3 plans',
    description: 'Three side-by-side plans with the middle one highlighted.',
    kind: 'section',
    category: 'pricing',
    blocks: () => [
      section(col(12, [heading('Simple pricing')])),
      section(
        col(4, [pricingPlan('Starter', '9', 'One user\nEmail support\n- Priority support')]),
        col(4, [pricingPlan('Standard', '29', 'Five users\nEmail support\nPriority support', true)]),
        col(4, [pricingPlan('Pro', '59', 'Unlimited users\nEmail support\nPriority support')]),
      ),
    ],
  },
  {
    slug: 'pricing-table',
    name: 'Pricing table, 2 plans',
    description: 'Two pricing tables, monthly and annual, with the annual plan highlighted.',
    kind: 'section',
    category: 'pricing',
    blocks: () => [
      section(col(12, [heading('Choose your plan')])),
      section(
        col(6, [pricingPlan('Monthly', '12', 'Full access\nEmail support\n- Priority support', false, '/ month')]),
        col(6, [pricingPlan('Annual', '108', 'Full access\nPriority support\nFree onboarding', true, '/ year')]),
      ),
    ],
  },
  {
    slug: 'price-list',
    name: 'Price list',
    description: 'A menu-style list of items, each with a short description and a price.',
    kind: 'section',
    category: 'pricing',
    blocks: () => [
      section(col(12, [heading('Menu'), el('price-list', {
        items: [
          { name: 'Flat white', description: 'Double shot, steamed milk', price: '3.50' },
          { name: 'Croissant', description: 'Baked this morning', price: '2.80' },
          { name: 'Filter coffee', description: 'Ask for today\'s beans', price: '2.20' },
        ],
      }), el('divider')])),
    ],
  },
  {
    slug: 'team-3up',
    name: 'Team, 3 people',
    description: 'Meet the team: three people cards.',
    kind: 'section',
    category: 'team',
    blocks: () => [
      section(col(12, [heading('Meet the team')])),
      section(
        col(4, [el('team-member')]),
        col(4, [el('team-member', { name: 'Casey Morgan', role: 'Designer', bio: 'Makes everything look just right.' })]),
        col(4, [el('team-member', { name: 'Robin Ash', role: 'Customer care', bio: 'The friendly voice on the other end.' })]),
      ),
    ],
  },
  {
    slug: 'team-member-single',
    name: 'Team member',
    description: 'One person: photo, name, role, a short bio and social links.',
    kind: 'section',
    category: 'team',
    blocks: () => [section(col(12, [el('team-member', { name: 'Jordan Lee', role: 'Founder', bio: 'Started the studio in a spare room.', social: 'instagram | https://instagram.com/' })]))],
  },
  {
    slug: 'timeline',
    name: 'Timeline',
    description: 'A heading over three dated steps. Each step has a card with a heading, text, a list and a button.',
    kind: 'section',
    category: 'other',
    blocks: () => [
      section(col(12, [heading('Our story')])),
      timelineStep('2019', 'Founded', 'Started in a spare room with two people.', ['Two founders', 'First products made by hand']),
      timelineStep('2021', 'First shop open', 'Moved to a shop on the high street.', ['Walk-in customers', 'Local workshops']),
      timelineStep('2024', 'Online store launched', 'Orders now ship across the country.', ['Free returns', 'Next-day dispatch']),
    ],
  },
  {
    slug: 'tabs-section',
    name: 'Tabs',
    description: 'Three tabs; put any blocks (text, images, buttons, inner sections) inside each tab.',
    kind: 'section',
    category: 'other',
    blocks: () => [
      panelSection('tabs', [
        { label: 'Overview', blocks: panelBlocks('Overview', 'A short introduction.') },
        { label: 'Details', blocks: panelBlocks('Details', 'The finer points.') },
        { label: 'Shipping', blocks: panelBlocks('Shipping', 'How it gets to you.') },
      ]),
    ],
  },
  {
    slug: 'carousel-section',
    name: 'Carousel',
    description: 'Three slides you can scroll through; each slide holds a heading and some text.',
    kind: 'section',
    category: 'other',
    blocks: () => [
      carouselSection([
        { title: 'First slide', body: 'Add a short message here.' },
        { title: 'Second slide', body: 'Each column of the section is one slide.' },
        { title: 'Third slide', body: 'Swap in your own text, images or buttons.' },
      ]),
    ],
  },
  {
    slug: 'grid-section',
    name: 'Grid',
    description: 'Three equal cells side by side; each holds a heading and some text. Cards in a row share a height.',
    kind: 'section',
    category: 'other',
    blocks: () => [
      gridSection(
        [
          { title: 'First cell', body: 'Add a short message here.' },
          { title: 'Second cell', body: 'Each column of the section is one cell.' },
          { title: 'Third cell', body: 'Swap in your own text, images or buttons.' },
        ],
        3,
      ),
    ],
  },
  {
    slug: 'modal-section',
    name: 'Popup',
    description: 'A button that opens a dialog holding a heading and some text.',
    kind: 'section',
    category: 'other',
    blocks: () => [modalSection('Learn more', 'More about this', 'Put the details you want to show in the popup here.')],
  },
  {
    slug: 'accordion-section',
    name: 'Accordion',
    description: 'Three panels that open and close; each can hold any blocks.',
    kind: 'section',
    category: 'faq',
    blocks: () => [panelSection('accordion', FAQ_PANELS)],
  },
  {
    slug: 'faq-section',
    name: 'FAQ',
    description: 'A heading and a list of questions that open and close.',
    kind: 'section',
    category: 'faq',
    blocks: () => [section(col(12, [heading('Questions? Answers.')])), panelSection('accordion', FAQ_PANELS)],
  },
  {
    slug: 'contact-form',
    name: 'Contact form',
    description: 'A short intro above a form. Pick the form in the block settings.',
    kind: 'section',
    category: 'contact',
    blocks: () => [section(col(12, [heading('Get in touch'), el('text-editor', { align: 'center' })])), { blockType: 'form', showTitle: false }],
  },
  {
    slug: 'blog-intro',
    name: 'Blog intro',
    description: 'A page title and short welcome above your posts.',
    kind: 'section',
    category: 'blog',
    blocks: () => [section(col(12, [heading('From the journal', 'left', 'h1'), el('text-editor', { align: 'left' }), el('divider')]))],
  },
  {
    slug: 'shop-landing',
    name: 'Shop landing',
    description: 'Hero, product grid, and a newsletter CTA - a common landing-page shape.',
    kind: 'page',
    category: 'shop',
    blocks: () => [
      heroBand('Shop the collection', 'Handmade pieces, made to last.', 'Browse all', '/shop'),
      { blockType: 'productGrid', heading: 'Shop', limit: 8 },
      ctaBand('Join the list', 'News and offers, now and then.', 'Sign up', '/contact'),
    ],
  },
  {
    slug: 'landing-page-full',
    name: 'Full landing page',
    description: 'Hero, features, testimonials, pricing, FAQ and a closing call to action.',
    kind: 'page',
    category: 'other',
    blocks: () => [
      heroBand('One clear promise', 'Say what you do and who it is for.', 'Get started', '/contact'),
      section(col(12, [heading('Why choose us')])),
      section(...FEATURE_ITEMS.slice(0, 3).map(([icon, title, text]) => cardCol(4, { media: 'icon', icon, title, text, hoverEffect: 'lift', align: 'left' }))),
      section(col(4, [el('testimonial')]), col(4, [el('testimonial', { name: 'Sam T.' })]), col(4, [el('testimonial', { name: 'Riley K.' })])),
      section(col(4, [pricingPlan('Starter', '9', 'One user\nEmail support')]), col(4, [pricingPlan('Standard', '29', 'Five users\nPriority support', true)]), col(4, [pricingPlan('Pro', '59', 'Unlimited users\nPriority support')])),
      panelSection('accordion', FAQ_PANELS),
      ctaBand('Ready when you are', 'Tell people what to do next.', 'Get started', '/contact'),
    ],
  },
  {
    slug: 'pricing-cards',
    name: 'Pricing cards',
    description: 'Three plan cards side by side, each with a price, a feature list and a button. The middle plan is highlighted.',
    kind: 'section',
    category: 'pricing',
    blocks: () => [
      section(col(12, [heading('Simple pricing')])),
      section(
        pricingCard('Starter', '9', ['One user', 'Email support', 'Basic reports']),
        pricingCard('Standard', '29', ['Five users', 'Priority support', 'Advanced reports'], true),
        pricingCard('Pro', '59', ['Unlimited users', 'Priority support', 'Custom reports']),
      ),
    ],
  },
  {
    slug: 'team-cards',
    name: 'Team cards',
    description: 'Three team member cards, each with a photo, name, role and short bio.',
    kind: 'section',
    category: 'team',
    blocks: () => [
      section(col(12, [heading('Meet the team')])),
      section(
        teamCard('Casey Morgan', 'Designer', 'Makes everything look just right.'),
        teamCard('Robin Ash', 'Customer care', 'The friendly voice on the other end.'),
        teamCard('Jordan Lee', 'Founder', 'Started the studio in a spare room.'),
      ),
    ],
  },
  {
    slug: 'feature-cards',
    name: 'Feature cards',
    description: 'Three feature cards, each with an icon, a title and a short text.',
    kind: 'section',
    category: 'features',
    blocks: () => [
      section(col(12, [heading('Why choose us')])),
      section(...FEATURE_ITEMS.slice(0, 3).map(([icon, title, text]) => cardCol(4, { media: 'icon', icon, title, text, align: 'left', shadow: 'md', hoverEffect: 'lift' }))),
    ],
  },
  {
    slug: 'fx-aurora-hero',
    name: 'Aurora hero',
    description: 'A dark hero with a slowly moving aurora behind a centred headline, text and two buttons. Wave divider at the bottom.',
    kind: 'section',
    category: 'hero',
    blocks: () => [
      sectionWith(
        AURORA_BG,
        col(12, [
          withDesign(heading('A brighter way to begin', 'center', 'h1'), FADE_UP),
          withDesign(el('text-editor', { align: 'center', content: paragraph('Add a line of supporting copy here.') }), FADE_UP),
          withDesign(button('Get started', '/contact'), FADE_UP),
          withDesign(button('Learn more', '/about', 'secondary'), FADE_UP),
        ]),
      ),
    ],
  },
  {
    slug: 'fx-grain-editorial',
    name: 'Editorial grain',
    description: 'A paper-toned band with film grain, a large word that changes colour on hover, and a short text block.',
    kind: 'section',
    category: 'other',
    blocks: () => [
      sectionWith(
        GRAIN_BG,
        col(12, [
          withDesign(heading('BIG IDEAS', 'left', 'h2'), { ...FADE_UP, fontSize: 180, fontSizeUnit: 'px', textColor: '#1c1917', hoverTextColor: '#c2410c', hoverTransitionMs: 300 }),
          withDesign(el('text-editor', { align: 'left', content: paragraph('A few words about what drives the work, in the open and in your own voice.') }), FADE_UP),
        ]),
      ),
    ],
  },
  {
    slug: 'fx-glass-cards',
    name: 'Glass cards',
    description: 'Three frosted glass cards, each with a heading and text, that lift on hover and fade in. Sits on a slowly shifting gradient.',
    kind: 'section',
    category: 'features',
    blocks: () => [
      sectionWith(
        SHIFT_BG,
        ...FEATURE_ITEMS.slice(0, 3).map(([, title, text]) =>
          col(4, [heading(title, 'left', 'h3'), el('text-editor', { align: 'left', content: paragraph(text) })], GLASS_CARD),
        ),
      ),
    ],
  },
  {
    slug: 'fx-neon-grid',
    name: 'Neon grid stats',
    description: 'A dark grid background with a two-tone heading over a row of three counting numbers.',
    kind: 'section',
    category: 'other',
    blocks: () => [
      sectionWith(NEON_BG, {
        width: 12,
        blocks: [
          el('heading', { text: 'Numbers that', secondText: 'move', secondColour: '#22d3ee', tag: 'h2', align: 'center', effect: 'two-tone' }),
          {
            blockType: 'section',
            columns: [
              col(4, [counter(1250, '', '+', 'Happy customers')]),
              col(4, [counter(98, '', '%', 'Five-star reviews')]),
              col(4, [counter(24, '', '/7', 'Support hours')]),
            ],
          },
        ],
      }),
    ],
  },
  {
    slug: 'fx-spotlight-features',
    name: 'Spotlight features',
    description: 'A dark section with a spotlight that follows the pointer, and three cards that tilt as you move over them.',
    kind: 'section',
    category: 'features',
    blocks: () => [
      sectionWith(
        SPOTLIGHT_BG,
        ...FEATURE_ITEMS.slice(0, 3).map(([icon, title, text]) => col(4, [withDesign(el('card', { media: 'icon', icon, title, text, align: 'left', hoverEffect: 'lift' }), TILT_BLOCK)])),
      ),
    ],
  },
]
