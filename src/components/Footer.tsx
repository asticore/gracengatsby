import Link from 'next/link'
import React from 'react'

export const Footer: React.FC = () => {
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer" id="about">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <h2>Grace &amp; Gatsby</h2>
          <p>
            A curated boutique for the modern romantic - considered pieces, small-batch goods, and
            evenings worth dressing up for.
          </p>
        </div>

        <div className="site-footer__columns">
          <div>
            <h3>Shop</h3>
            <Link href="/shop">All products</Link>
          </div>
          <div>
            <h3>Events</h3>
            <Link href="/events">What&apos;s on</Link>
          </div>
          <div>
            <h3>Visit</h3>
            <p>Brisbane, Australia</p>
          </div>
        </div>
      </div>

      <div className="site-footer__bottom">
        <p>&copy; {year} Grace &amp; Gatsby. All rights reserved.</p>
      </div>
    </footer>
  )
}
