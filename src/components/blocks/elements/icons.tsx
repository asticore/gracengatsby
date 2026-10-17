import React from 'react'

/** Stroke icons on a 24x24 grid. Inline SVG so nothing is fetched and no icon font is needed. */
const PATHS: Record<string, string> = {
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  heart: 'M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z',
  check: 'M4 12.5l5 5L20 6.5',
  arrow: 'M4 12h16M14 6l6 6-6 6',
  mail: 'M3 6h18v12H3zM3 7l9 7 9-7',
  phone: 'M6 3h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z',
  pin: 'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  bolt: 'M13 2L5 14h6l-1 8 8-12h-6z',
  gift: 'M3 9h18v4H3zM5 13h14v8H5zM12 9v12M12 9c-2-4-6-3-5 0M12 9c2-4 6-3 5 0',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  leaf: 'M5 19C5 9 11 4 20 4c0 9-5 15-15 15zM5 19l8-8',
  sparkle: 'M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3',
  truck: 'M2 6h11v10H2zM13 10h4l3 3v3h-7zM6 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.5',
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
}

export const ICON_OPTIONS = Object.keys(PATHS).map((k) => ({ label: k.charAt(0).toUpperCase() + k.slice(1), value: k }))
/** Every built-in icon name (the keys of PATHS). Stored element props hold one of these as a plain string. */
export const ICON_NAMES: string[] = Object.keys(PATHS)

export const Icon: React.FC<{ name?: string; size?: number; className?: string; filled?: boolean }> = ({ name = 'star', size = 24, className, filled }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d={PATHS[name] || PATHS.star} />
  </svg>
)

/** Simplified network glyphs (not the official marks) so no brand assets are shipped. */
const SOCIAL: Record<string, React.ReactNode> = {
  facebook: <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8.5c0-.3.2-.5.5-.5z" />,
  instagram: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <circle cx="12" cy="12" r="3.6" />
      <circle cx="16.6" cy="7.4" r=".6" />
    </>
  ),
  x: <path d="M5 4l14 16M19 4L5 20" />,
  youtube: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="3.5" />
      <path d="M10.5 9.5v5l4.2-2.5z" />
    </>
  ),
  linkedin: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 10.5V16M8 8v.1M11.5 16v-5.5M11.5 13c0-2 1.2-2.6 2.3-2.6 1.3 0 2.2.8 2.2 2.4V16" />
    </>
  ),
  tiktok: <path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5M14 4c.3 2.2 1.8 3.7 4 4" />,
  pinterest: <path d="M12 21l1.4-6.5M9 15.5C7 11 9 6.5 13 6.5c3.5 0 5 3.5 3.2 6.2-1.4 2-3.8 1.6-3.6-.2" />,
  email: (
    <>
      <path d="M3 6h18v12H3z" />
      <path d="M3 7l9 7 9-7" />
    </>
  ),
  website: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </>
  ),
}

export const SOCIAL_NETWORKS = Object.keys(SOCIAL)

export const SocialGlyph: React.FC<{ network: string; size?: number }> = ({ network, size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {SOCIAL[network] || SOCIAL.website}
  </svg>
)
