import React from 'react'

/**
 * Shown instead of the content of a password-protected page or post.
 * A plain HTML form posting to /api/content-unlock (no client JS needed):
 * the route sets the unlock cookie and redirects back to `currentPath`.
 */
export const PasswordGate: React.FC<{
  collection: string
  id: number
  currentPath: string
  wrongPassword?: boolean
}> = ({ collection, id, currentPath, wrongPassword = false }) => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh', padding: '2rem' }}>
    <div style={{ maxWidth: '400px', width: '100%', padding: '2rem', border: '1px solid #e0e0e0', borderRadius: '8px', backgroundColor: '#fff' }}>
      <h1 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: 600, color: '#212121' }}>Password protected</h1>
      <p style={{ margin: '0 0 1.5rem 0', color: '#666', fontSize: '0.95rem' }}>
        This content is password protected. Enter the password to continue.
      </p>
      {wrongPassword && (
        <div role="alert" style={{ padding: '0.75rem', marginBottom: '1rem', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '4px', fontSize: '0.9rem' }}>
          Wrong password. Please try again.
        </div>
      )}
      <form action="/api/content-unlock" method="post">
        <input name="collection" type="hidden" value={collection} />
        <input name="id" type="hidden" value={String(id)} />
        <input name="redirect" type="hidden" value={currentPath} />
        <input
          aria-label="Password"
          autoComplete="current-password"
          name="password"
          placeholder="Enter password"
          required
          style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '1rem', fontFamily: 'inherit', boxSizing: 'border-box' }}
          type="password"
        />
        <button
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '1rem', fontWeight: 500, cursor: 'pointer' }}
          type="submit"
        >
          Unlock
        </button>
      </form>
    </div>
  </div>
)
