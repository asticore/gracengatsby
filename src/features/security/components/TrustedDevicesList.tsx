'use client'

import React, { useEffect, useState } from 'react'

import { revokeAllTrustedDevicesAction, revokeTrustedDeviceAction, twoFactorPanelOptionsAction } from '../twoFactorActions'
import { usePortalText } from '@/features/accounts/components/PortalText'
import type { TrustedDeviceView } from '../trustedDevices'
import './twoFactorExtras.css'

/**
 * The devices that skip the second step, with a button to forget each one. Draws nothing unless the
 * site allows remembered devices or the person still has some. Used on the two-step panel and the
 * sessions screen; everything that decides anything runs in the server actions.
 */

const when = (iso: string | null, unknown: string): string => {
  if (!iso) return unknown
  const time = Date.parse(iso)
  return Number.isFinite(time) ? new Date(time).toLocaleDateString() : unknown
}

export const TrustedDevicesList: React.FC = () => {
  const [devices, setDevices] = useState<TrustedDeviceView[]>([])
  const [allowed, setAllowed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const tx = usePortalText()

  useEffect(() => {
    let cancelled = false
    twoFactorPanelOptionsAction()
      .then((options) => {
        if (cancelled) return
        setAllowed(options.trustedDevicesEnabled)
        setDevices(options.trustedDevices)
      })
      .catch((): undefined => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const run = async (task: () => Promise<{ ok: boolean; message?: string; devices?: TrustedDeviceView[] }>) => {
    setBusy(true)
    setNote('')
    try {
      const result = await task()
      setNote(result.message ?? '')
      if (result.ok && result.devices) setDevices(result.devices)
    } catch {
      setNote(tx('common.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  if (!allowed && devices.length === 0) return null

  return (
    <section className="tf-trusted" aria-labelledby="tf-trusted-heading">
      <h3 id="tf-trusted-heading">{tx('panel.devicesHeading')}</h3>
      <p>{tx('panel.devicesIntro')}</p>
      {note && (
        <p role="status" aria-live="polite">
          {note}
        </p>
      )}
      {devices.length === 0 ? (
        <p>{tx('panel.devicesNone')}</p>
      ) : (
        <>
          <ul className="tf-devices">
            {devices.map((device) => (
              <li key={device.id} className="tf-devices__item">
                <div>
                  <strong>{device.device}</strong>
                  <div>
                    {tx('panel.devicesDetail', { ip: device.ip ?? tx('panel.unknownAddress'), added: when(device.createdAt, tx('panel.unknown')), expires: when(device.expiresAt, tx('panel.unknown')) })}
                  </div>
                </div>
                <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void run(() => revokeTrustedDeviceAction(device.id))}>
                  {tx('panel.forget')}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void run(revokeAllTrustedDevicesAction)}>
            {tx('panel.forgetAll')}
          </button>
        </>
      )}
    </section>
  )
}
