'use client'

/**
 * One small generic icon per top-level nav GROUP (Content/Shop/Members/
 * Courses/Settings/Other) - not per entity. There are only ~6 of these
 * (vs. ~50 entities, why NavLinkBadge uses letters instead - see
 * AdminNavClient.tsx's own comment), so a real icon set is actually feasible
 * here and reads much closer to the WordPress-style collapsed-rail request
 * than a two-letter code would (Content/Courses and Shop/Settings both
 * collide on their first two letters).
 *
 * Used only by NavGroup.tsx's collapsed-rail trigger button. Falls back to a
 * generic folder glyph for any group label not explicitly listed, so a
 * newly-added NAV_STRUCTURE group (or the "Other" fallback group) never
 * renders a blank rail icon.
 */

import React from 'react'

const ICON_PROPS = {
  'aria-hidden': true,
  fill: 'none',
  height: 17,
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  strokeWidth: 1.4,
  viewBox: '0 0 16 16',
  width: 17,
}

const ContentIcon: React.FC = () => (
  <svg {...ICON_PROPS}>
    <rect x="2.5" y="1.5" width="11" height="13" rx="1.4" />
    <path d="M5 5h6M5 8h6M5 11h3.5" />
  </svg>
)

const ShopIcon: React.FC = () => (
  <svg {...ICON_PROPS}>
    <path d="M2 4.5h12l-1 8.5a1.4 1.4 0 0 1-1.4 1.2H4.4A1.4 1.4 0 0 1 3 13L2 4.5Z" />
    <path d="M5 4.5V4a3 3 0 0 1 6 0v.5" />
  </svg>
)

const MembersIcon: React.FC = () => (
  <svg {...ICON_PROPS}>
    <circle cx="8" cy="5.3" r="2.6" />
    <path d="M2.8 14c.4-2.8 2.6-4.5 5.2-4.5s4.8 1.7 5.2 4.5" />
  </svg>
)

const CoursesIcon: React.FC = () => (
  <svg {...ICON_PROPS}>
    <path d="M1.5 6 8 3l6.5 3L8 9 1.5 6Z" />
    <path d="M4.5 7.4v3c0 1 1.6 1.9 3.5 1.9s3.5-.9 3.5-1.9v-3" />
    <path d="M14 6v4" />
  </svg>
)

const SettingsIcon: React.FC = () => (
  <svg {...ICON_PROPS}>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.2 3.8l-1.1 1.1M4.9 11.1l-1.1 1.1M12.2 12.2l-1.1-1.1M4.9 4.9 3.8 3.8" />
  </svg>
)

const OtherIcon: React.FC = () => (
  <svg {...ICON_PROPS}>
    <path d="M1.8 4.4c0-.8.6-1.4 1.4-1.4h2.8l1.2 1.4h5.6c.8 0 1.4.6 1.4 1.4v6.8c0 .8-.6 1.4-1.4 1.4H3.2c-.8 0-1.4-.6-1.4-1.4V4.4Z" />
  </svg>
)

const ICONS_BY_LABEL: Record<string, React.FC> = {
  content: ContentIcon,
  courses: CoursesIcon,
  members: MembersIcon,
  settings: SettingsIcon,
  shop: ShopIcon,
}

export const NavGroupIcon: React.FC<{ label: string }> = ({ label }) => {
  const Icon = ICONS_BY_LABEL[label.trim().toLowerCase()] ?? OtherIcon
  return <Icon />
}

export default NavGroupIcon
