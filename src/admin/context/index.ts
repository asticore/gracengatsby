/**
 * Barrel for the from-scratch admin context providers (Stage 11).
 *
 * RootLayout (Task #7) wraps the whole admin tree in NavProvider +
 * DocumentEventsProvider once. EditView/GlobalEditView (Task #6) wrap just
 * their own subtree in FormProvider + DocumentInfoProvider per document.
 */

export { DocumentEventsProvider, useDocumentEvents, type DocumentEvent } from './DocumentEventsContext'
export { DocumentInfoProvider, useDocumentInfo, type DocumentInfoValue } from './DocumentInfoContext'
export { FormProvider, useField, useFormFields, useFormModified, useResetFormModified, type FieldsMap } from './FormContext'
export { NavProvider, useNav } from './NavContext'
