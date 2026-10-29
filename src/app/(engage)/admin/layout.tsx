import React from 'react'

type Args = {
  children: React.ReactNode
}

/** The admin is never indexed: this meta applies to every admin screen, and the middleware sends the same rule as a header. */
const AdminLayout = ({ children }: Args) => (
  <>
    <meta name="robots" content="noindex,nofollow" />
    {children}
  </>
)

export default AdminLayout
