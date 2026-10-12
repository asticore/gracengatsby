import { describe, expect, it } from 'vitest'

import { planStoredValue } from '@/features/ecommerce/lib/storedValue'
import { cardAmountOf, enforceMinimumCard, parseSnapshot } from '@/features/ecommerce/lib/storedValueOrder'
import { renderGiftCardEmail } from '@/features/ecommerce/server/storedValue'

const plan = (total: number, credit: number, cards: number[]) =>
  planStoredValue({
    totalCents: total,
    lines: [{ productId: '1', netCents: total }],
    giftCards: cards.map((balance, i) => ({ id: i + 1, code: `C${i}`, balance })),
    creditBalanceCents: credit,
    useCredit: credit > 0,
  })

describe('stored value on an order', () => {
  it('leaves the card at least 50 cents when stored value would leave less', () => {
    const p = enforceMinimumCard(plan(1000, 980, []), 1000)
    expect(p.payableCents).toBe(50)
    expect(p.creditCents).toBe(950)
  })

  it('trims gift cards from the last when credit is not enough to trim', () => {
    const p = enforceMinimumCard(plan(1000, 0, [600, 380]), 1000)
    expect(p.payableCents).toBe(50)
    expect(p.giftCards.map((c) => c.cents)).toEqual([600, 350])
  })

  it('does not touch a plan that covers everything or leaves enough', () => {
    expect(enforceMinimumCard(plan(1000, 1000, []), 1000).payableCents).toBe(0)
    expect(enforceMinimumCard(plan(1000, 100, []), 1000).payableCents).toBe(900)
  })

  it('works out what the card must pay', () => {
    expect(cardAmountOf({ amount: 5000, giftCardTotal: 2000, storeCreditTotal: 500 })).toBe(2500)
    expect(cardAmountOf({ amount: 1000, giftCardTotal: 5000 })).toBe(0)
  })

  it('reads a saved snapshot defensively', () => {
    expect(parseSnapshot('not json')).toEqual({ giftCards: [], creditUserId: null, creditCents: 0 })
    const s = parseSnapshot({ giftCards: [{ id: 3, code: 'X', cents: 100 }, { id: 'bad', cents: 5 }], creditUserId: 9, creditCents: 40 })
    expect(s.giftCards).toHaveLength(1)
    expect(s.creditUserId).toBe(9)
  })

  it('renders the gift card email with the code and escapes the message', () => {
    const mail = renderGiftCardEmail({ recipientName: 'Sam', senderName: 'Alex', initialAmount: 5000, currency: 'AUD', message: '<b>hi</b>', code: 'ABCD-EFGH-JKMN-PQRS' }, null, 'Shop')
    expect(mail.text).toContain('ABCD-EFGH-JKMN-PQRS')
    expect(mail.html).not.toContain('<b>hi</b>')
    expect(mail.subject).toContain('Alex')
  })
})
