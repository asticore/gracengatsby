/**
 * Who may use the ad-platform connections. Admins always may. A user with the
 * tracking permission (update) may connect, pick a pixel and disconnect, as the
 * Roles screen describes. Saving an app secret stays admin-only, and so does
 * reading any secret (field-level access on the global).
 */

export type ConnectionViewer = {
  user: unknown
  isAdmin: boolean
  can: (resource: 'tracking', action: 'update') => boolean
}

export function canManageTrackingConnections(viewer: ConnectionViewer): boolean {
  return Boolean(viewer.user) && (viewer.isAdmin || viewer.can('tracking', 'update'))
}

export function canSaveAppSecret(viewer: ConnectionViewer): boolean {
  return Boolean(viewer.user) && viewer.isAdmin
}
