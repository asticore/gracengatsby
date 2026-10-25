'use client'

import React, { useEffect, useState } from 'react'

import { revokeAllTrustedDevicesAction, revokeTrustedDeviceAction, twoFactorPanelOptionsAction } from '../twoFactorActions'
import type { TrustedDeviceView } from '../trustedDevices'
import './twoFactorExtras.css'

/**
 * The devices that skip the second step, with a button to forget each one. Draws nothing unless the
 * site allows remembered devices or the person still has some. Used on the two-step panel and the
 * sessions screen; everything that decides anything runs in the server actions.
 */

const when = (iso: string | null): string => {
  if (!iso) return 'Unknown'
  const time = Date.parse(iso)
  return Number.isFinite(time) ? new Date(time).toLocaleDateString() : 'Unknown'
}

export const TrustedDevicesList: React.FC = () => {
  const [devices, setDevices] = useState<TrustedDeviceView[]>([])
  const [allowed, setAllowed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

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
      setNote('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!allowed && devices.length === 0) return null

  return (
    <section className="tf-trusted" aria-labelledby="tf-trusted-heading">
      <h3 id="tf-trusted-heading">Remembered devices</h3>
      <p>These devices skip the second step until they expire. A password change forgets all of them.</p>
      {note && (
        <p role="status" aria-live="polite">
          {note}
        </p>
      )}
      {devices.length === 0 ? (
        <p>No devices are remembered.</p>
      ) : (
        <>
          <ul className="tf-devices">
            {devices.map((device) => (
              <li key={device.id} className="tf-devices__item">
                <div>
                  <strong>{device.device}</strong>
                  <div>
                    Near {device.ip ?? 'unknown address'} - added {when(device.createdAt)} - expires {when(device.expiresAt)}
                  </div>
                </div>
                <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void run(() => revokeTrustedDeviceAction(device.id))}>
                  Forget
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void run(revokeAllTrustedDevicesAction)}>
            Forget all devices
          </button>
        </>
      )}
    </section>
  )
}
