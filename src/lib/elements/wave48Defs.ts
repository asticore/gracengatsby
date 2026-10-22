import type { EditorField } from './fieldTypes'
import { EMBED_NAME, EMBED_PROVIDER_GROUPS } from '@/lib/embedProviders'
import type { ElementDef } from './registry'

/**
 * Wave 48: four interactive elements. `chart` (bar, line, pie, radar or polar, as inline SVG), `embed` (video, calendar
 * and form iframes from a fixed host allowlist, plus link cards for social posts), `reviews` (star ratings, optional
 * Review structured data) and `pagination` (links built from a pattern).
 *
 * Renderers live in src/components/blocks/elements/Wave48Elements.tsx and their styles in wave48.css. Icons are
 * String.fromCodePoint escapes so this file stays ASCII.
 */

const opts = (...values: string[]) => values.map((v) => ({ label: v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, ' '), value: v }))
const EMBED_PROVIDER_LABEL: Record<string, string> = {
  ...EMBED_NAME,
  x: 'X (Twitter) post', instagram: 'Instagram post or reel', 'facebook-post': 'Facebook post', 'facebook-video': 'Facebook video', 'facebook-page': 'Facebook page',
  tiktok: 'TikTok video', pinterest: 'Pinterest pin, board or profile', linkedin: 'LinkedIn post', spotify: 'Spotify', soundcloud: 'SoundCloud',
  'google-calendar': 'Google Calendar', lottie: 'Lottie animation', 'custom-iframe': 'Custom iframe',
}
const labelled = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ label, value }))
const text = (name: string, label: string, extra: Partial<EditorField> = {}): EditorField => ({ name, label, type: 'text', ...extra })
const area = (name: string, label: string, helpText?: string): EditorField => ({ name, label, type: 'textarea', helpText })
const select = (name: string, label: string, options: { label: string; value: string }[], extra: Partial<EditorField> = {}): EditorField => ({ name, label, type: 'select', width: 'half', options, ...extra })
const check = (name: string, label: string, helpText?: string): EditorField => ({ name, label, type: 'checkbox', helpText })
const number = (name: string, label: string, helpText?: string): EditorField => ({ name, label, type: 'number', width: 'half', helpText })
/** Range slider for a numeric prop. Stores a plain number. min/max mirror the renderer's clamp. */
const slider = (name: string, label: string, min: number, max: number, step = 1): EditorField => ({ name, label, type: 'range', width: 'half', min, max, step })

export const WAVE48_ELEMENTS: ElementDef[] = [
  {
    type: 'chart', label: 'Chart', icon: String.fromCodePoint(0x1f4ca), category: 'interactive',
    description: 'A bar, line, pie, radar or polar area chart of up to 12 values, drawn as SVG. The same data is available to screen readers as a table.',
    fields: [
      select('chartType', 'Chart type', labelled([['bar', 'Bar'], ['line', 'Line'], ['pie', 'Pie'], ['radar', 'Radar'], ['polar', 'Polar area']])),
      text('title', 'Title'),
      area('data', 'Data', 'One row per line: "label | value". Up to 12 rows. A row with a value that is not a number is skipped. Negative values count as zero.'),
      text('colors', 'Colours', { helpText: 'Comma-separated hex colours, reused in turn. Invalid ones are dropped. Line and radar use the first colour.' }),
      check('showLegend', 'Show legend'),
      check('showValues', 'Show values'),
    ],
    defaultProps: () => ({
      chartType: 'bar',
      title: 'Sales by month',
      data: 'Jan | 120\nFeb | 95\nMar | 160\nApr | 140',
      colors: '#2e3192, #00a9ff, #f5a623, #2ecc71, #e74c3c',
      showLegend: false,
      showValues: true,
    }),
  },
  {
    type: 'embed', label: 'Embed', icon: String.fromCodePoint(0x1f3ac), category: 'media',
    description: 'A video, social post, audio, calendar or form embed. Pick a network and paste its address. Iframes load only from fixed hosts (YouTube, Vimeo, TikTok, Instagram, X, Facebook, Pinterest, LinkedIn, Spotify, SoundCloud, Google Calendar, Typeform, Lottie) and only after consent.',
    fields: [
      select('provider', 'Provider', labelled(EMBED_PROVIDER_GROUPS.flatMap((g) => g.providers.map((v): [string, string] => [v, `${g.group}: ${EMBED_PROVIDER_LABEL[v]}`])))),
      text('url', 'Address', { width: 'full', helpText: 'Paste the post, video, pin, track or page address (https://). Only the matching network is accepted, and the embed loads after the visitor accepts marketing cookies. Pinterest boards and profiles show a link card. Custom iframe accepts YouTube, Vimeo, Calendar and Typeform hosts. Lottie: a lottie.host embed link.' }),
      select('ratio', 'Aspect ratio', labelled([['16:9', '16:9'], ['4:3', '4:3'], ['1:1', '1:1']]), { helpText: 'Used by video, calendar and form embeds. Social and audio embeds use their own size.' }),
      text('title', 'Title', { helpText: 'Read by screen readers. Leave empty to use the provider name.' }),
    ],
    defaultProps: () => ({
      provider: 'youtube',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      ratio: '16:9',
      title: 'Product tour',
    }),
  },
  {
    type: 'reviews', label: 'Reviews', icon: String.fromCodePoint(0x2b50), category: 'marketing',
    description: 'A set of customer reviews with star ratings, in a grid or a list. Can add Review structured data for search engines.',
    fields: [
      {
        name: 'items', label: 'Reviews', type: 'repeater',
        repeater: {
          fields: [
            text('name', 'Name'),
            select('rating', 'Rating', labelled([['5', '5 stars'], ['4', '4 stars'], ['3', '3 stars'], ['2', '2 stars'], ['1', '1 star']])),
            area('text', 'Review'),
            text('source', 'Source label', { helpText: 'For example Google or Trustpilot.' }),
            { name: 'avatar', label: 'Avatar', type: 'media' },
          ],
        },
      },
      select('layout', 'Layout', opts('grid', 'list')),
      check('showStars', 'Show stars'),
      check('jsonLd', 'Add Review structured data (JSON-LD)', 'Adds schema.org data for search engines. Only turn it on for real reviews that are shown on this page.'),
      text('itemName', 'Reviewed item name', { helpText: 'Used in the structured data only: the product, service or business being reviewed.' }),
    ],
    defaultProps: () => ({
      items: [
        { name: 'Priya S.', rating: '5', text: 'Fast delivery, and the candle smells lovely.', source: 'Google' },
        { name: 'Tom H.', rating: '5', text: 'Burns evenly and the jar is sturdy.', source: 'Google' },
        { name: 'Ana K.', rating: '4', text: 'Lovely scent. I would like a larger size.', source: 'Trustpilot' },
      ],
      layout: 'grid',
      showStars: true,
      jsonLd: false,
      itemName: 'Hand-poured candles',
    }),
  },
  {
    type: 'pagination', label: 'Pagination', icon: String.fromCodePoint(0x1f522), category: 'interactive',
    description: 'Previous and next links with numbered pages, in a navigation landmark. Page links come from the link pattern.',
    fields: [
      number('current', 'Current page', 'Clamped to the range 1 to the total.'),
      number('total', 'Total pages'),
      text('baseUrl', 'Link pattern', { helpText: 'Use {page} where the page number goes, for example ?page={page} or /blog/page/{page}.' }),
      slider('maxLinks', 'Most page links shown', 5, 11, 1),
      text('prevLabel', 'Previous label'),
      text('nextLabel', 'Next label'),
      select('align', 'Alignment', opts('left', 'centre', 'right')),
    ],
    defaultProps: () => ({
      current: 3,
      total: 12,
      baseUrl: '?page={page}',
      maxLinks: 7,
      prevLabel: 'Previous',
      nextLabel: 'Next',
      align: 'centre',
    }),
  },
]
