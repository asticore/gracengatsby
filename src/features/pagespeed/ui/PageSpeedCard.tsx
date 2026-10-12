'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import { useCardOpen } from '@/admin/components/collapseStore'

import {
  THRESHOLDS,
  formatBytes,
  formatMetric,
  scoreBand,
  scoreDelta,
  type Band,
  type MetricKey,
  type Scores,
  type StoredResult,
  type Strategy,
} from '../types'
import './pagespeed.css'

type Loaded = {
  testable: boolean
  reason: string | null
  url: string | null
  hasKey: boolean
  canRun: boolean
  results: Record<Strategy, StoredResult[]>
}

const CARD_ID = 'pagespeed'

const RINGS: { key: keyof Scores; label: string; help: string }[] = [
  { key: 'performance', label: 'Performance', help: 'How fast the page loads and becomes usable. 90 or more is good, 50 to 89 needs work, under 50 is poor. Scores vary a few points from run to run.' },
  { key: 'accessibility', label: 'Accessibility', help: 'How usable the page is for people with disabilities: contrast, labels, alt text. Automated checks only catch part of the problems.' },
  { key: 'bestPractices', label: 'Best practices', help: 'Security and modern web standards: https, no console errors, safe libraries.' },
  { key: 'seo', label: 'SEO', help: 'Basic search engine checks: title, description, crawlable links. It does not measure ranking.' },
]

const bandClass = (band: Band | null): string => `ps-band--${band ?? 'none'}`

const BAND_WORD: Record<Band, string> = { good: 'Good', 'needs-work': 'Needs work', poor: 'Poor' }

function Ring({ label, help, score, previous }: { label: string; help: string; score: number | null; previous: number | null }) {
  const band = scoreBand(score)
  const radius = 30
  const circumference = 2 * Math.PI * radius
  const delta = scoreDelta(score, previous)
  return (
    <div className={`ps-ring ${bandClass(band)}`} title={help}>
      <svg className="ps-ring__svg" viewBox="0 0 72 72" role="img" aria-label={`${label}: ${score === null ? 'no score' : `${score} out of 100${band ? `, ${BAND_WORD[band]}` : ''}`}`}>
        <circle className="ps-ring__track" cx="36" cy="36" r={radius} />
        {score !== null && (
          <circle className="ps-ring__value" cx="36" cy="36" r={radius} strokeDasharray={`${(score / 100) * circumference} ${circumference}`} />
        )}
        <text className="ps-ring__text" x="36" y="37">
          {score === null ? '-' : score}
        </text>
      </svg>
      <span className="ps-ring__label">{label}</span>
      {delta && (
        <span className={`ps-delta ps-delta--${delta.direction}`} title="Change since the previous test of this page">
          {delta.direction === 'same' ? 'no change' : `${delta.change > 0 ? '+' : ''}${delta.change} since last`}
        </span>
      )}
    </div>
  )
}

const METRIC_ORDER: MetricKey[] = ['lcp', 'cls', 'tbt', 'fcp', 'speedIndex', 'ttfb']

function Chart({ history }: { history: StoredResult[] }) {
  const points = [...history].reverse().filter((r) => r.scores.performance !== null)
  if (points.length < 2) return <p className="ps__muted ps__help">Run the test a few times on different days to see a trend here.</p>
  const w = 300
  const h = 90
  const x = (i: number) => 8 + (i * (w - 16)) / (points.length - 1)
  const y = (score: number) => h - 8 - (score / 100) * (h - 16)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.scores.performance as number).toFixed(1)}`).join(' ')
  return (
    <svg className="ps-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Performance score over the last ${points.length} tests`} preserveAspectRatio="none">
      <line className="ps-chart__grid" x1="0" x2={w} y1={y(90)} y2={y(90)} />
      <line className="ps-chart__grid" x1="0" x2={w} y1={y(50)} y2={y(50)} />
      <path className="ps-chart__line" d={path} vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => {
        const score = p.scores.performance as number
        return (
          <g key={p.id} className={bandClass(scoreBand(score))}>
            <circle className="ps-chart__dot" cx={x(i)} cy={y(score)} r="3.5">
              <title>{`${score} on ${new Date(p.fetchedAt).toLocaleString()}`}</title>
            </circle>
          </g>
        )
      })}
    </svg>
  )
}

function Report({ latest, previous, hasKey }: { latest: StoredResult; previous: StoredResult | null; hasKey: boolean }) {
  const metrics = METRIC_ORDER.filter((key) => latest.metrics[key])
  const field = latest.fieldData
  const fieldKeys = field ? (['lcp', 'cls', 'inp', 'fcp', 'ttfb'] as const).filter((key) => field.metrics[key]) : []
  return (
    <>
      <div className="ps__rings">
        {RINGS.map((ring) => (
          <Ring key={ring.key} label={ring.label} help={ring.help} score={latest.scores[ring.key]} previous={previous ? previous.scores[ring.key] : null} />
        ))}
      </div>
      <p className="ps__muted ps__help">
        Tested {new Date(latest.fetchedAt).toLocaleString()}
        {latest.source === 'auto' ? ' (automatic test after publishing)' : ''}
        {previous ? `, compared with the test on ${new Date(previous.fetchedAt).toLocaleDateString()}` : ''}. Scores shift a few points between runs, so look at the trend rather than one number.
        {!hasKey ? ' No Google API key is set, so tests share a small free allowance (Integrations > Google).' : ''}
      </p>

      {metrics.length > 0 && (
        <div>
          <h3 className="ps__h">Core Web Vitals and speed (lab test)</h3>
          <table className="ps__table">
            <tbody>
              {metrics.map((key) => {
                const metric = latest.metrics[key]
                if (!metric) return null
                const prev = previous?.metrics[key]
                return (
                  <tr key={key} className={bandClass(metric.band)}>
                    <th scope="row">
                      <span className="ps-dot" aria-hidden="true" />
                      <span className="ps__tip" title={THRESHOLDS[key].help}>{THRESHOLDS[key].label}</span>
                    </th>
                    <td>
                      <span className="ps__value">{formatMetric(key, metric.value)}</span> <span className="ps__muted">{BAND_WORD[metric.band]}</span>
                      {prev && prev.value !== metric.value ? (
                        <span className="ps__muted"> (was {formatMetric(key, prev.value)})</span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {field && fieldKeys.length > 0 && (
        <div>
          <h3 className="ps__h" title="Measured from real Chrome visitors over the last 28 days. Only shown by Google for pages with enough traffic.">
            Real visitors (Chrome UX Report){field.originFallback ? ', whole site' : ''}
          </h3>
          <table className="ps__table">
            <tbody>
              {fieldKeys.map((key) => {
                const metric = field.metrics[key]
                if (!metric) return null
                return (
                  <tr key={key} className={bandClass(metric.band)}>
                    <th scope="row">
                      <span className="ps-dot" aria-hidden="true" />
                      <span className="ps__tip" title={THRESHOLDS[key].help}>{THRESHOLDS[key].label}</span>
                    </th>
                    <td>
                      <span className="ps__value">{formatMetric(key, metric.percentile)}</span> <span className="ps__muted">{BAND_WORD[metric.band]}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {field.originFallback && <p className="ps__muted ps__help">This page has too little traffic for its own figures, so these describe the whole site.</p>}
        </div>
      )}

      {latest.suggestions.opportunities.length > 0 && (
        <div>
          <h3 className="ps__h" title="Changes Google estimates would make the page load faster, biggest first. Savings are estimates.">Opportunities</h3>
          <ul className="ps__list">
            {latest.suggestions.opportunities.map((item) => (
              <li key={item.id}>
                <span>{item.title}</span>
                <span className="ps__saving">
                  {item.savingsMs ? `${formatMetric('fcp', item.savingsMs)}` : ''}
                  {item.savingsMs && item.savingsBytes ? ', ' : ''}
                  {item.savingsBytes ? formatBytes(item.savingsBytes) : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {latest.suggestions.diagnostics.length > 0 && (
        <div>
          <h3 className="ps__h" title="Things worth looking at that do not have a direct time saving.">Diagnostics</h3>
          <ul className="ps__list">
            {latest.suggestions.diagnostics.map((item) => (
              <li key={item.id}>
                <span>{item.title}</span>
                {item.displayValue ? <span className="ps__saving">{item.displayValue}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function PageSpeedBody({ collectionSlug, id }: { collectionSlug: string; id: number }) {
  const [open] = useCardOpen(CARD_ID)
  const [data, setData] = useState<Loaded | null>(null)
  const [strategy, setStrategy] = useState<Strategy>('mobile')
  const [busy, setBusy] = useState<Strategy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requested = useRef(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin-pagespeed?collection=${encodeURIComponent(collectionSlug)}&id=${id}`)
      const json = (await response.json().catch((): null => null)) as (Loaded & { error?: string }) | null
      if (!response.ok || !json) throw new Error(json?.error || 'Could not load PageSpeed results.')
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load PageSpeed results.')
    }
  }, [collectionSlug, id])

  // Load once, the first time the card is opened.
  useEffect(() => {
    if (!open || requested.current) return
    requested.current = true
    void load()
  }, [open, load])

  const run = async (which: Strategy) => {
    setBusy(which)
    setError(null)
    setStrategy(which)
    try {
      const response = await fetch('/api/admin-pagespeed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: collectionSlug, id, strategy: which }),
      })
      const json = (await response.json().catch((): null => null)) as { error?: string } | null
      if (!response.ok) throw new Error(json?.error || 'The test failed.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The test failed.')
    } finally {
      setBusy(null)
    }
  }

  const history = data?.results[strategy] ?? []
  const latest = history[0]
  const previous = history[1] ?? null

  return (
    <div className="ps">
      {!data && !error && <p className="ps__muted">Loading...</p>}
      {data && !data.testable && <p className="ps__muted">{data.reason}</p>}
      {data && (
        <div className="ps__bar">
          <div className="ps__tabs" role="group" aria-label="Device">
            {(['mobile', 'desktop'] as const).map((which) => (
              <button key={which} type="button" className="ps__tab" aria-pressed={strategy === which} onClick={() => setStrategy(which)}>
                {which === 'mobile' ? 'Mobile' : 'Desktop'}
              </button>
            ))}
          </div>
          {data.canRun && (
            <button
              type="button"
              className="btn"
              disabled={busy !== null || !data.testable}
              title="Asks Google to load the live page and score it. Takes 15 to 60 seconds. Google limits how many tests can run, and results vary a little each time."
              onClick={() => void run(strategy)}
            >
              {busy ? `Testing ${busy}...` : `Run ${strategy} test`}
            </button>
          )}
          {data.url && <span className="ps__muted">{data.url}</span>}
        </div>
      )}
      {error && <p className="ps__error" role="alert">{error}</p>}
      {data && latest && <Report latest={latest} previous={previous} hasKey={data.hasKey} />}
      {data && !latest && data.testable && <p className="ps__muted">No {strategy} test yet. Run one to see scores, Core Web Vitals and suggestions.</p>}
      {history.length > 0 && (
        <div>
          <h3 className="ps__h" title="Performance score of each past test of this page on this device. Lines at 90 and 50 mark the green and red limits.">History ({strategy})</h3>
          <Chart history={history} />
        </div>
      )}
    </div>
  )
}

/**
 * Collapsed card on the edit screen of pages, posts, products and events: run a Google PageSpeed test
 * on the live page and read the scores, Core Web Vitals, suggestions and history.
 */
export function PageSpeedCard({ collectionSlug, id }: { collectionSlug: string; id?: number }) {
  if (id === undefined) return null
  return (
    <CollapsibleCard id={CARD_ID} title="PageSpeed" className="doc-pagespeed-card">
      <PageSpeedBody collectionSlug={collectionSlug} id={id} />
    </CollapsibleCard>
  )
}

export default PageSpeedCard
