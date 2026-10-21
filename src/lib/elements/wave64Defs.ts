import type { EditorField } from './fieldTypes'
import type { ElementDef } from './registry'

/** Wave 64: audio, code highlight, image accordion and video playlist. Renderers: Wave64Elements.tsx, styles: wave64.css. */

const text = (name: string, label: string, extra: Partial<EditorField> = {}): EditorField => ({ name, label, type: 'text', ...extra })

export const WAVE64_ELEMENTS: ElementDef[] = [
  {
    type: 'audio', label: 'Audio', icon: String.fromCodePoint(0x1f50a), category: 'media',
    description: 'A sound file with the browser audio player. Never plays by itself.',
    fields: [
      { name: 'file', label: 'Audio file', type: 'media' }, text('url', 'Or audio address', { helpText: 'An https address of an mp3, ogg, wav or m4a file. Used when no file is chosen.' }),
      text('title', 'Title'),
      { name: 'loop', label: 'Loop', type: 'checkbox' },
    ],
    defaultProps: () => ({ title: 'Audio', loop: false }),
  },
  {
    type: 'code-highlight', label: 'Code', icon: String.fromCodePoint(0x1f4bb), category: 'text',
    description: 'A block of code with colours, optional line numbers and a copy button.',
    fields: [
      { name: 'code', label: 'Code', type: 'textarea' },
      { name: 'language', label: 'Language', type: 'select', width: 'half', options: ['js', 'ts', 'json', 'html', 'css', 'bash', 'python'].map((v) => ({ label: v, value: v })) },
      { name: 'lineNumbers', label: 'Line numbers', type: 'checkbox' },
      { name: 'copy', label: 'Copy button', type: 'checkbox' },
    ],
    defaultProps: () => ({ code: 'const hello = "world"', language: 'js', lineNumbers: true, copy: true }),
  },
  {
    type: 'image-accordion', label: 'Image accordion', icon: String.fromCodePoint(0x25a4), category: 'media',
    description: 'Three to six pictures side by side. The one you hover, focus or tap grows.',
    fields: [
      { name: 'panels', label: 'Panels (3-6)', type: 'repeater', repeater: { fields: [text('url', 'Image address (https://...)'), text('title', 'Title'), text('alt', 'Alt text'), text('link', 'Link (optional)')] } },
      { name: 'height', label: 'Height (px)', type: 'range', width: 'half', min: 200, max: 700, step: 10 },
    ],
    defaultProps: () => ({ panels: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }], height: 360 }),
  },
  {
    type: 'video-playlist', label: 'Video playlist', icon: String.fromCodePoint(0x1f4fa), category: 'media',
    description: 'A player with a list of videos beside it. YouTube and Vimeo wait for consent.',
    fields: [
      { name: 'items', label: 'Videos', type: 'textarea', helpText: 'One per line: "https://... | Title". YouTube, Vimeo or .mp4 / .webm.' },
      text('label', 'Accessible name'),
    ],
    defaultProps: () => ({ items: '', label: 'Video playlist' }),
  },
]
