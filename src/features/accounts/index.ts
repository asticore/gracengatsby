/**
 * Public surface of the customer account area.
 *
 * Routes take screens from here and nothing deeper, the RSVP collection takes
 * one access function, and nothing else outside this folder needs anything -
 * so the internal layout can change without touching an integration point.
 *
 * This feature registers no collection and owns no table. Customers are the
 * `users` rows the shop already writes; orders, addresses and RSVPs belong to
 * the shop and to events. The `accounts` flag is honoured in exactly two
 * places - `requireFeature`, which every screen starts with, and the guard at
 * the top of every server action - so switching it off 404s the screens and
 * makes the forms inert without touching a stored row.
 */

export { isAdminOrRsvpOwner } from './access'

export {
  AccountHomeScreen,
  AddressEditScreen,
  AddressesScreen,
  BookingsScreen,
  OrderScreen,
  OrdersScreen,
  ProfileScreen,
} from './components/AccountScreens'

export {
  ForgotPasswordScreen,
  RegisterScreen,
  ResetPasswordScreen,
  SignInScreen,
} from './components/AuthScreens'

export { accountMetadata } from './meta'

export { MIN_PASSWORD_LENGTH, RESET_TTL_MINUTES } from './auth'

export { accountContext, type AccountContext, type AccountUser } from './session'

export { requireCustomer, requireFeature, type SignedIn } from './guards'

export { ACCOUNTS_FEATURE_KEY } from './types'
