'use client'

import React from 'react'
import { FieldLabel, useField } from '@/engine/ui'
import type { Field } from '@/engine'

import { BILLING_INTERVALS, intervalPhrase, normalisePlan, planProblems, type BillingInterval, type SubscriptionPlan } from '../plan'

type Props = { field: Field; path: string; readOnly?: boolean }

const INTERVAL_LABELS: Record<BillingInterval, string> = { day: 'Days', week: 'Weeks', month: 'Months', year: 'Years' }

const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginTop: 8 }
const cell: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 150 }
const hint: React.CSSProperties = { fontSize: 12, opacity: 0.75, margin: '4px 0 0' }

const num = (raw: number): number => (Number.isNaN(raw) ? 0 : raw)

/**
 * Admin card for a product's subscription plan. Edits the whole plan as one object, so the form
 * saves it with the product. Everything is plain English; the tooltips are the `title` attributes.
 */
export function SubscriptionPlanField({ path, readOnly }: Props) {
  const { setValue, value } = useField<unknown>({ path })
  const plan = normalisePlan(value)
  const problems = planProblems(plan)
  const update = (patch: Partial<SubscriptionPlan>) => setValue({ ...plan, ...patch })
  const locked = readOnly === true

  return (
    <div className="field-type checkbox">
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }} title="Turns subscriptions on for this product. Customers then see a Subscribe option on the product page.">
        <input type="checkbox" checked={plan.enabled} disabled={locked} onChange={(e) => update({ enabled: e.target.checked })} />
        Sell this product as a subscription
      </label>
      {plan.enabled ? (
        <>
          <div style={row}>
            <div style={cell}>
              <FieldLabel htmlFor={`${path}-count`} label="Bill every" required={false} />
              <input
                id={`${path}-count`}
                type="number"
                min={1}
                step={1}
                readOnly={locked}
                value={plan.intervalCount}
                title="How many days, weeks, months or years make up one billing period. Stripe allows up to one year."
                onChange={(e) => update({ intervalCount: num(e.target.valueAsNumber) })}
              />
            </div>
            <div style={cell}>
              <FieldLabel htmlFor={`${path}-interval`} label="Period" required={false} />
              <select
                id={`${path}-interval`}
                disabled={locked}
                value={plan.interval}
                title="The unit of time the billing period is counted in."
                onChange={(e) => update({ interval: e.target.value as BillingInterval })}
              >
                {BILLING_INTERVALS.map((value) => (
                  <option key={value} value={value}>
                    {INTERVAL_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div style={cell}>
              <FieldLabel htmlFor={`${path}-trial`} label="Free trial (days)" required={false} />
              <input
                id={`${path}-trial`}
                type="number"
                min={0}
                step={1}
                readOnly={locked}
                value={plan.trialDays}
                title="Days before the first payment. 0 means the first payment is taken at checkout."
                onChange={(e) => update({ trialDays: num(e.target.valueAsNumber) })}
              />
            </div>
            <div style={cell}>
              <FieldLabel htmlFor={`${path}-fee`} label="Sign-up fee ($)" required={false} />
              <input
                id={`${path}-fee`}
                type="number"
                min={0}
                step={0.01}
                readOnly={locked}
                value={plan.signupFee}
                title="A one-off amount added to the first payment only. Leave 0 for none."
                onChange={(e) => update({ signupFee: num(e.target.valueAsNumber) })}
              />
            </div>
            <div style={cell}>
              <FieldLabel htmlFor={`${path}-payments`} label="Number of payments" required={false} />
              <input
                id={`${path}-payments`}
                type="number"
                min={0}
                step={1}
                readOnly={locked}
                value={plan.paymentsLimit}
                title="How many payments are taken before the subscription ends by itself. 0 means it runs until the customer cancels."
                onChange={(e) => update({ paymentsLimit: num(e.target.valueAsNumber) })}
              />
            </div>
          </div>
          <p style={hint}>Customers are billed {intervalPhrase(plan.interval, plan.intervalCount)} at this product&apos;s price. Tax and shipping are not added to subscription payments.</p>
          {problems.map((problem) => (
            <p key={problem} style={{ ...hint, opacity: 1, color: 'var(--theme-error-500, #b42318)' }}>
              {problem}
            </p>
          ))}
        </>
      ) : null}
    </div>
  )
}
