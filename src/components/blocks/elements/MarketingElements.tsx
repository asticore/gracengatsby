/* eslint-disable @next/next/no-img-element */
import React from 'react'

import { buttonClassName } from './ButtonElement'

import { safeUrl } from '@/lib/mergeTags'

import { Icon, SocialGlyph } from './icons'
import { StarsRow } from './InteractiveElements'
import { alignClass } from './TextElements'
import { cells, flag, iconName, linkAttrs, linkHref, lines, mediaOf, num, pick, str } from './elementUtil'

type P = Record<string, unknown>

const TITLE_TAGS = ['h2', 'h3', 'h4', 'h5', 'h6', 'p'] as const

const Cta: React.FC<{ text: unknown; url: unknown; variant?: 'primary' | 'secondary' }> = ({ text, url, variant = 'primary' }) => {
  const label = str(text)
  if (!label) return null
  return (
    <a className={buttonClassName(variant)} href={linkHref(url) || '#'} {...linkAttrs(url)}>
      {label}
    </a>
  )
}

const Avatar: React.FC<{ photo: unknown; name: string }> = ({ photo, name }) => {
  const m = mediaOf(photo)
  return m?.url ? <img className="el-avatar" src={m.url} alt={name} loading="lazy" width={64} height={64} /> : null
}

/** `testimonial`: a quote with the person's name, role, photo and optional stars. */
export const TestimonialElement: React.FC<P> = (p) => {
  const name = str(p.name, 'Customer name')
  const rating = num(p.stars, 0, 0, 5)
  return (
    <figure className={`el-testimonial ${alignClass(p.align)}`}>
      {rating > 0 && <StarsRow rating={rating} />}
      <blockquote>
        <p>{str(p.quote, 'What a lovely thing to say about us.')}</p>
      </blockquote>
      <figcaption>
        <Avatar photo={p.photo} name={name} />
        <span className="el-testimonial__who">
          <strong>{name}</strong>
          {str(p.role) && <span>{str(p.role)}</span>}
        </span>
      </figcaption>
    </figure>
  )
}

/** `pricing-table`: one plan card. Feature lines starting with "-" are shown struck through (not included). */
export const PricingTableElement: React.FC<P> = (p) => {
  const features = Array.isArray(p.features)
    ? (p.features as Record<string, unknown>[])
        .map((f) => {
          const t = str(f?.text).trim()
          return t ? (f?.included === false ? `-${t}` : t) : ''
        })
        .filter(Boolean)
    : lines(p.features)
  return (
    <section className={`el-pricing ${flag(p.highlight) ? 'el-pricing--highlight' : ''}`}>
      {str(p.ribbon) && <span className="el-pricing__ribbon">{str(p.ribbon)}</span>}
      <h3 className="el-pricing__title">{str(p.title, 'Plan')}</h3>
      <p className="el-pricing__price">
        <span className="el-pricing__currency">{str(p.currency, '$')}</span>
        <span className="el-pricing__amount">{str(p.price, '0')}</span>
        {str(p.period) && <span className="el-pricing__period">{str(p.period)}</span>}
      </p>
      <ul className="el-pricing__features">
        {features.map((f, i) =>
          f.startsWith('-') ? (
            <li key={i} className="el-pricing__off">
              <s>{f.replace(/^-\s*/, '')}</s>
            </li>
          ) : (
            <li key={i}>{f}</li>
          ),
        )}
      </ul>
      <Cta text={p.buttonText} url={p.buttonUrl} variant={flag(p.highlight) ? 'primary' : 'secondary'} />
    </section>
  )
}

/** `price-list`: a menu-style list, one line per entry as "Name | Description | Price". */
export const PriceListElement: React.FC<P> = (p) => (
  <ul className="el-price-list">
    {cells(p.items, 3).map(([name, desc, price], i) => (
      <li key={i}>
        <div className="el-price-list__row">
          <span className="el-price-list__name">{name}</span>
          <span className="el-price-list__dots" aria-hidden="true" />
          <span className="el-price-list__price">{price ?? ''}</span>
        </div>
        {desc && <p>{desc}</p>}
      </li>
    ))}
  </ul>
)

/** `team-member`: photo, name, role, short bio and social links ("network | url" per line). */
export const TeamMemberElement: React.FC<P> = (p) => {
  const name = str(p.name, 'Team member')
  const m = mediaOf(p.photo)
  const social = cells(p.social, 2)
  return (
    <article className={`el-team ${alignClass(p.align ?? 'center')}`}>
      {m?.url ? <img className="el-team__photo" src={m.url} alt={str(p.alt) || name} loading="lazy" /> : <div className="el-placeholder el-team__photo">Photo</div>}
      <h3>{name}</h3>
      {str(p.role) && <p className="el-team__role">{str(p.role)}</p>}
      {str(p.bio) && <p>{str(p.bio)}</p>}
      {social.length > 0 && (
        <ul className="el-social el-social--plain">
          {social.map(([network, url], i) => {
            const href = safeUrl(url)
            return href ? (
              <li key={i}>
                <a href={href} aria-label={`${name} on ${network}`} rel="noopener noreferrer">
                  <SocialGlyph network={network.toLowerCase()} />
                </a>
              </li>
            ) : null
          })}
        </ul>
      )}
    </article>
  )
}

/** `flip-box`: two faces; hover or keyboard focus turns it over (pure CSS). */
export const FlipBoxElement: React.FC<P> = (p) => {
  const height = num(p.height, 260, 120, 600)
  return (
    <div className="el-flip" tabIndex={0} style={{ height }}>
      <div className="el-flip__inner">
        <div className="el-flip__face el-flip__front">
          <Icon name={iconName(p.icon) || 'sparkle'} size={36} />
          <h3>{str(p.frontTitle, 'Front')}</h3>
          <p>{str(p.frontText)}</p>
        </div>
        <div className="el-flip__face el-flip__back">
          <h3>{str(p.backTitle, 'Back')}</h3>
          <p>{str(p.backText)}</p>
          <Cta text={p.buttonText} url={p.buttonUrl} variant="secondary" />
        </div>
      </div>
    </div>
  )
}

/** `call-to-action`: a boxed message with one or two buttons. */
export const CallToActionElement: React.FC<P> = (p) => {
  const tone = pick(p.tone, ['dark', 'light', 'accent'] as const, 'dark')
  return (
    <section className={`el-cta el-cta--${tone} ${alignClass(p.align ?? 'center')}`}>
      <h2>{str(p.title, 'Ready to get started?')}</h2>
      {str(p.text) && <p>{str(p.text)}</p>}
      <div className="el-cta__buttons">
        <Cta text={p.buttonText} url={p.buttonUrl} />
        <Cta text={p.secondText} url={p.secondUrl} variant="secondary" />
      </div>
    </section>
  )
}

const Titled: React.FC<{ tag: unknown; link: unknown; children: React.ReactNode }> = ({ tag, link, children }) => {
  const href = linkHref(link)
  const inner = href ? <a href={href} {...linkAttrs(link)}>{children}</a> : children
  switch (pick(tag, TITLE_TAGS, 'h3')) {
    case 'h2':
      return <h2 className="el-box__title">{inner}</h2>
    case 'h4':
      return <h4 className="el-box__title">{inner}</h4>
    case 'h5':
      return <h5 className="el-box__title">{inner}</h5>
    case 'h6':
      return <h6 className="el-box__title">{inner}</h6>
    case 'p':
      return <p className="el-box__title">{inner}</p>
    default:
      return <h3 className="el-box__title">{inner}</h3>
  }
}

/** `icon-box`: an icon above (or beside) a title and text. */
export const IconBoxElement: React.FC<P> = (p) => (
  <div className={`el-box el-box--icon el-box--${pick(p.layout, ['top', 'left'] as const, 'top')} ${alignClass(p.align)}`}>
    <Icon name={iconName(p.icon) || 'star'} size={num(p.size, 40, 16, 120)} className="el-box__icon" />
    <div className="el-box__body">
      <Titled tag={p.tag} link={p.link}>
        {str(p.title, 'Icon box')}
      </Titled>
      {str(p.text) && <p>{str(p.text)}</p>}
    </div>
  </div>
)

/** `image-box`: a picture above a title and text. */
export const ImageBoxElement: React.FC<P> = (p) => {
  const m = mediaOf(p.image) || mediaOf(p.url)
  return (
    <div className={`el-box el-box--image ${alignClass(p.align)}`}>
      {m?.url ? <img src={m.url} alt={str(p.alt) || str(m.alt)} loading="lazy" className="el-box__img" /> : <div className="el-placeholder">Choose an image</div>}
      <div className="el-box__body">
        <Titled tag={p.tag} link={p.link}>
          {str(p.title, 'Image box')}
        </Titled>
        {str(p.text) && <p>{str(p.text)}</p>}
      </div>
    </div>
  )
}
