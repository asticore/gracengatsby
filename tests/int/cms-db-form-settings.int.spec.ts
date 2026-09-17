// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { RealEngine as Engine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
import { describe, expect, it } from 'vitest'

import { findFormSettings, updateFormSettings } from '@/cms/db'

/**
 * FormSettings: the one global with two levels of nesting (group within group
 * within group within the top-level `fields` array). See
 * src/cms/db/globals/formSettings.ts's doc comment for the confirmed real DDL
 * this checks against.
 */
describe('cms/db - form-settings global', () => {
  let engine: Engine

  it('reads a global updated by Payload: fields group with nested sub-fields', async () => {
    engine = await getEngine()
    await engine.updateGlobal({
      slug: 'form-settings',
      data: {
        fields: [
          {
            enabled: true,
            name: 'firstName',
            label: 'First Name',
            required: true,
            fieldType: 'text',
          },
          {
            enabled: true,
            name: 'address',
            label: 'Address',
            required: false,
            fieldType: 'group',
            fields: [
              { enabled: true, name: 'street', label: 'Street', required: false, fieldType: 'text' },
              { enabled: true, name: 'city', label: 'City', required: false, fieldType: 'text' },
              {
                enabled: true,
                name: 'coordinates',
                label: 'Coordinates',
                required: false,
                fieldType: 'group',
                fields: [
                  { enabled: true, name: 'latitude', label: 'Latitude', required: false, fieldType: 'number' },
                  { enabled: true, name: 'longitude', label: 'Longitude', required: false, fieldType: 'number' },
                ],
              },
            ],
          },
        ],
      },
    })

    const viaOurs = await findFormSettings()
    expect(viaOurs?.fields).toHaveLength(2)
    expect(viaOurs?.fields?.[0].name).toBe('firstName')
    expect(viaOurs?.fields?.[1].name).toBe('address')
    expect((viaOurs?.fields?.[1] as any).fields).toHaveLength(3)
    expect((viaOurs?.fields?.[1] as any).fields[0].name).toBe('street')
    expect((viaOurs?.fields?.[1] as any).fields[2].name).toBe('coordinates')
    expect(((viaOurs?.fields?.[1] as any).fields[2] as any).fields).toHaveLength(2)
    expect(((viaOurs?.fields?.[1] as any).fields[2] as any).fields[0].name).toBe('latitude')
  })

  it('writes a global Payload can read back', async () => {
    const ours = await updateFormSettings({
      fields: [
        {
          enabled: true,
          name: 'fullName',
          label: 'Full Name',
          required: true,
          fieldType: 'text',
        },
        {
          enabled: true,
          name: 'contactInfo',
          label: 'Contact',
          required: false,
          fieldType: 'group',
          fields: [
            { enabled: true, name: 'email', label: 'Email', required: true, fieldType: 'text' },
            { enabled: true, name: 'phone', label: 'Phone', required: false, fieldType: 'text' },
          ],
        },
      ],
    })
    expect(ours.fields).toHaveLength(2)
    expect(ours.fields?.[1].name).toBe('contactInfo')

    const viaPayload = await engine.findGlobal({ slug: 'form-settings', depth: 0 })
    expect((viaPayload.fields as any)?.length).toBe(2)
    expect((viaPayload.fields as any)?.[1].name).toBe('contactInfo')
    expect(((viaPayload.fields as any)?.[1] as any).fields?.length).toBe(2)
  })
})
