import { validateAdminPath, type AdminPathError } from './adminPath'

/** Field validator for the Admin URL setting. Returns true, or the message shown beside the field. */
const MESSAGES: Record<AdminPathError, string> = {
  format: 'Use lowercase letters, digits and hyphens, in one part, for example /studio-7f3.',
  length: 'The admin URL must be between 3 and 40 characters.',
  reserved: 'That word is used by the site itself. Choose another admin URL.',
}

export const validateAdminPathField = (value: unknown): true | string => {
  if (value === null || value === undefined || value === '') return true
  const error = validateAdminPath(value)
  return error === null ? true : MESSAGES[error]
}
