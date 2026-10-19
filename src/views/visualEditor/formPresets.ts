import type { LayoutNode } from '@/features/forms/layout'

/**
 * Ready-made form definitions for the form builder.
 *
 * Each preset is a list of layout nodes in the same shape the visual form editor stores: an `element` block whose
 * `elementType` is `ff-<field type>` and whose `props` match the field's element def in
 * src/features/forms/elementDefs.ts. Settings hold the submit label and success message that live on the form itself
 * (FormDoc.settings). Nothing here is a new field type or a new backend.
 *
 * Auth presets (login, register, reset): these are field layouts only. The forms feature has no password field type,
 * so no password input is included, and submissions are stored as ordinary form entries. Before using them for real
 * accounts, the form must be wired to the account routes (sign-in, sign-up, reset) by whatever owns those routes;
 * none of that exists in this repo. Do not add a password field here without adding a field type and a secure store.
 */

export type FormPresetSettings = {
  submitButtonLabel: string
  successMessage: string
}

export type FormPreset = {
  id: string
  label: string
  description: string
  /** Field nodes in visual order. */
  fields: LayoutNode[]
  settings: FormPresetSettings
}

const field = (elementType: string, props: Record<string, unknown>): LayoutNode => ({
  blockType: 'element',
  elementType,
  props,
})

const emailField = (): LayoutNode => field('ff-email', { label: 'Email', name: 'email', placeholder: 'you@example.com', required: true })

export const FORM_PRESETS: FormPreset[] = [
  {
    id: 'newsletter-signup',
    label: 'Newsletter signup',
    description: 'One email address and a consent tick-box.',
    fields: [
      emailField(),
      field('ff-consent', {
        label: 'I agree to receive emails from you. I can unsubscribe at any time.',
        name: 'consent',
        required: true,
      }),
    ],
    settings: {
      submitButtonLabel: 'Subscribe',
      successMessage: 'Thanks for subscribing. Check your inbox to confirm.',
    },
  },
  {
    id: 'login',
    label: 'Login',
    description: 'Email field for sign-in. Needs a password field and account wiring before use.',
    fields: [emailField()],
    settings: {
      submitButtonLabel: 'Log in',
      successMessage: 'Thanks. We have received your sign-in request.',
    },
  },
  {
    id: 'register',
    label: 'Register',
    description: 'Name, email and consent for creating an account. Needs a password field and account wiring before use.',
    fields: [
      field('ff-text', { label: 'Full name', name: 'name', required: true }),
      emailField(),
      field('ff-consent', {
        label: 'I agree to the terms and the privacy policy.',
        name: 'consent',
        required: true,
      }),
    ],
    settings: {
      submitButtonLabel: 'Create account',
      successMessage: 'Thanks for registering. Check your email to finish.',
    },
  },
  {
    id: 'password-reset',
    label: 'Password reset',
    description: 'Email field that asks for a reset link. Needs account wiring before use.',
    fields: [
      field('ff-email', {
        label: 'Email address',
        name: 'email',
        placeholder: 'you@example.com',
        helpText: 'We will send a link to reset your password.',
        required: true,
      }),
    ],
    settings: {
      submitButtonLabel: 'Send reset link',
      successMessage: 'If an account exists for that address, a reset link is on its way.',
    },
  },
  {
    id: 'contact',
    label: 'Contact',
    description: 'Name, email, optional phone and a message.',
    fields: [
      field('ff-text', { label: 'Name', name: 'name', required: true }),
      emailField(),
      field('ff-phone', { label: 'Phone (optional)', name: 'phone' }),
      field('ff-textarea', { label: 'Message', name: 'message', required: true }),
    ],
    settings: {
      submitButtonLabel: 'Send message',
      successMessage: 'Thanks, your message has been sent.',
    },
  },
]
