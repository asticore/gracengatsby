import type { Field } from '@/engine'

import { validateAudioUrl } from './config'

/**
 * Background audio for one page. Columns: `page_audio_*` (and `version_page_audio_*` on the
 * versions table) - see migration 20261107_100000_page_audio.
 */
export const pageAudioField: Field = {
  type: 'group',
  name: 'pageAudio',
  label: 'Background audio',
  admin: {
    position: 'sidebar',
    description:
      'Play a sound while this page is open. Browsers block sound before the visitor interacts, so it starts muted or on their first click, scroll or key press.',
  },
  fields: [
    { name: 'enabled', type: 'checkbox', label: 'Play background audio', defaultValue: false },
    {
      name: 'sourceType',
      type: 'select',
      label: 'Audio source',
      defaultValue: 'upload',
      options: [
        { label: 'Uploaded file', value: 'upload' },
        { label: 'Link to an audio file', value: 'url' },
      ],
      admin: { condition: (_d, s) => Boolean(s?.enabled) },
    },
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      label: 'Audio file',
      admin: {
        condition: (_d, s) => Boolean(s?.enabled) && s?.sourceType !== 'url',
        description: 'Upload an .mp3 or .ogg file in the Media library, then pick it here. Keep it small - it loads on every visit.',
      },
    },
    {
      name: 'url',
      type: 'text',
      label: 'Audio link',
      validate: validateAudioUrl,
      admin: {
        condition: (_d, s) => Boolean(s?.enabled) && s?.sourceType === 'url',
        description: 'An https:// link straight to an .mp3 or .ogg file. Spotify and SoundCloud pages are not supported.',
      },
    },
    { name: 'loop', type: 'checkbox', label: 'Loop', defaultValue: true, admin: { condition: (_d, s) => Boolean(s?.enabled) } },
    {
      name: 'volume',
      type: 'number',
      label: 'Volume (0-100)',
      defaultValue: 80,
      min: 0,
      max: 100,
      admin: { condition: (_d, s) => Boolean(s?.enabled), description: 'Keep it low; background sound should not startle people.' },
    },
    {
      name: 'startMuted',
      type: 'checkbox',
      label: 'Start muted',
      defaultValue: true,
      admin: {
        condition: (_d, s) => Boolean(s?.enabled),
        description: 'Recommended. Browsers refuse unmuted autoplay, so the visitor unmutes with the button.',
      },
    },
    {
      name: 'showControls',
      type: 'checkbox',
      label: 'Show a mute/play button',
      defaultValue: true,
      admin: { condition: (_d, s) => Boolean(s?.enabled), description: 'A small floating button. Turning it off leaves visitors no way to stop the sound.' },
    },
    {
      name: 'startOnFirstInteraction',
      type: 'checkbox',
      label: 'Start on first click, scroll or key press',
      defaultValue: true,
      admin: { condition: (_d, s) => Boolean(s?.enabled) },
    },
    {
      name: 'respectReducedData',
      type: 'checkbox',
      label: 'Skip when the visitor saves data',
      defaultValue: true,
      admin: { condition: (_d, s) => Boolean(s?.enabled), description: 'Does not load the file for visitors with Data Saver or a very slow connection.' },
    },
  ],
}
