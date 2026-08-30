/**
 * Every string this site renders itself, as opposed to strings somebody typed
 * into a page.
 *
 * The engine's own admin interface is not in here and never should be - it
 * ships translated, and duplicating its labels would mean maintaining a second
 * worse copy of somebody else's work. This list is only the storefront's own
 * furniture: buttons, empty states, form labels, the words around the content.
 *
 * `en` here is the source text AND the fallback. There is no separate English
 * file to keep in step, so a string can never be missing from the language the
 * site was written in.
 *
 * Adding a string: add it here, and it appears on the translation screen on
 * the next load. Nothing else to register.
 */

export type InterfaceStringDef = {
  /** Stable key. Changing it orphans existing translations, so don't. */
  key: string
  /** Source-language text. */
  en: string
  /** Shown to the translator so an ambiguous word can be translated correctly. */
  context: string
  group: string
}

export const INTERFACE_STRINGS: InterfaceStringDef[] = [
  // Navigation and chrome
  { key: 'nav.home', en: 'Home', context: 'Main navigation link to the front page.', group: 'Navigation' },
  { key: 'nav.shop', en: 'Shop', context: 'Main navigation link to the product listing.', group: 'Navigation' },
  { key: 'nav.blog', en: 'Blog', context: 'Main navigation link to the post archive.', group: 'Navigation' },
  { key: 'nav.events', en: 'Events', context: 'Main navigation link to the events calendar.', group: 'Navigation' },
  { key: 'nav.faq', en: 'FAQs', context: 'Main navigation link to the questions page.', group: 'Navigation' },
  { key: 'nav.cart', en: 'Cart', context: 'Link to the shopping cart.', group: 'Navigation' },
  { key: 'nav.account', en: 'Account', context: 'Link to the signed-in visitor area.', group: 'Navigation' },
  { key: 'nav.menu', en: 'Menu', context: 'Label on the button that opens navigation on small screens.', group: 'Navigation' },
  { key: 'nav.close', en: 'Close', context: 'Label on the button that closes an overlay.', group: 'Navigation' },
  { key: 'nav.language', en: 'Language', context: 'Label above the language chooser.', group: 'Navigation' },

  // Shop
  { key: 'shop.addToCart', en: 'Add to cart', context: 'Button on a product. Verb.', group: 'Shop' },
  { key: 'shop.adding', en: 'Adding…', context: 'Button text while the add-to-cart request is in flight.', group: 'Shop' },
  { key: 'shop.outOfStock', en: 'Out of stock', context: 'Shown in place of the add-to-cart button.', group: 'Shop' },
  { key: 'shop.viewProduct', en: 'View product', context: 'Link on a product card.', group: 'Shop' },
  { key: 'shop.price', en: 'Price', context: 'Label beside an amount of money.', group: 'Shop' },
  { key: 'shop.quantity', en: 'Quantity', context: 'Label on the number input in the cart.', group: 'Shop' },
  { key: 'shop.subtotal', en: 'Subtotal', context: 'Cart total before shipping and tax.', group: 'Shop' },
  { key: 'shop.total', en: 'Total', context: 'Final amount payable.', group: 'Shop' },
  { key: 'shop.emptyCart', en: 'Your cart is empty.', context: 'Shown on the cart page when nothing has been added.', group: 'Shop' },
  { key: 'shop.continueShopping', en: 'Continue shopping', context: 'Link back to the product listing.', group: 'Shop' },
  { key: 'shop.checkout', en: 'Checkout', context: 'Button that starts payment. Noun or verb, whichever suits.', group: 'Shop' },
  { key: 'shop.remove', en: 'Remove', context: 'Removes one line from the cart.', group: 'Shop' },
  { key: 'shop.orderConfirmed', en: 'Thank you - your order is confirmed.', context: 'Heading on the post-payment page.', group: 'Shop' },
  { key: 'shop.noProducts', en: 'No products to show yet.', context: 'Empty state on the shop page.', group: 'Shop' },

  // Blog
  { key: 'blog.readMore', en: 'Read more', context: 'Link at the end of a post excerpt.', group: 'Blog' },
  { key: 'blog.publishedOn', en: 'Published on', context: 'Precedes a date.', group: 'Blog' },
  { key: 'blog.by', en: 'by', context: 'Precedes an author name. Lower case on purpose.', group: 'Blog' },
  { key: 'blog.allPosts', en: 'All posts', context: 'Link to the unfiltered archive.', group: 'Blog' },
  { key: 'blog.noPosts', en: 'No posts published yet.', context: 'Empty state on the blog archive.', group: 'Blog' },
  { key: 'blog.categories', en: 'Categories', context: 'Heading above the category list.', group: 'Blog' },

  // Events
  { key: 'events.upcoming', en: 'Upcoming events', context: 'Heading on the events page.', group: 'Events' },
  { key: 'events.past', en: 'Past events', context: 'Heading above events that have finished.', group: 'Events' },
  { key: 'events.register', en: 'Register', context: 'Button that starts event sign-up. Verb.', group: 'Events' },
  { key: 'events.rsvp', en: 'RSVP', context: 'Button to reserve a place. Translate to the local equivalent.', group: 'Events' },
  { key: 'events.online', en: 'Online', context: 'Marks an event with no physical venue.', group: 'Events' },
  { key: 'events.soldOut', en: 'Fully booked', context: 'Shown when an event has reached capacity.', group: 'Events' },
  { key: 'events.noEvents', en: 'Nothing scheduled at the moment.', context: 'Empty state on the events page.', group: 'Events' },
  { key: 'events.addToCalendar', en: 'Add to calendar', context: 'Downloads a calendar file.', group: 'Events' },

  // Forms and feedback
  { key: 'form.name', en: 'Name', context: 'Form field label.', group: 'Forms' },
  { key: 'form.email', en: 'Email', context: 'Form field label.', group: 'Forms' },
  { key: 'form.phone', en: 'Phone', context: 'Form field label.', group: 'Forms' },
  { key: 'form.message', en: 'Message', context: 'Form field label for a free-text box.', group: 'Forms' },
  { key: 'form.submit', en: 'Submit', context: 'Default button on a form. Verb.', group: 'Forms' },
  { key: 'form.sending', en: 'Sending…', context: 'Button text while a form is being submitted.', group: 'Forms' },
  { key: 'form.required', en: 'This field is required.', context: 'Validation message.', group: 'Forms' },
  { key: 'form.invalidEmail', en: 'Please enter a valid email address.', context: 'Validation message.', group: 'Forms' },
  { key: 'form.success', en: 'Thanks - we have received your message.', context: 'Shown after a successful submission.', group: 'Forms' },
  { key: 'form.error', en: 'Something went wrong. Please try again.', context: 'Shown when a submission fails.', group: 'Forms' },

  // Search, pagination and general
  { key: 'common.search', en: 'Search', context: 'Placeholder and button on the search box.', group: 'General' },
  { key: 'common.noResults', en: 'No results found.', context: 'Empty state after a search.', group: 'General' },
  { key: 'common.previous', en: 'Previous', context: 'Pagination control.', group: 'General' },
  { key: 'common.next', en: 'Next', context: 'Pagination control.', group: 'General' },
  { key: 'common.loading', en: 'Loading…', context: 'Placeholder while content is being fetched.', group: 'General' },
  { key: 'common.backToTop', en: 'Back to top', context: 'Link at the foot of long pages.', group: 'General' },
  { key: 'common.notFound', en: 'We could not find that page.', context: 'Heading on the 404 page.', group: 'General' },
  { key: 'common.share', en: 'Share', context: 'Opens sharing options.', group: 'General' },

  // FAQs
  { key: 'faq.heading', en: 'Frequently asked questions', context: 'Heading on the FAQ page.', group: 'FAQs' },
  { key: 'faq.noQuestions', en: 'No questions have been published yet.', context: 'Empty state on the FAQ page.', group: 'FAQs' },
]

export const INTERFACE_SOURCE_ID = 'ui'

const BY_KEY = new Map(INTERFACE_STRINGS.map((entry) => [entry.key, entry]))

/** Source text for a key, or the key itself so a typo is visible rather than blank. */
export const interfaceSourceText = (key: string): string => BY_KEY.get(key)?.en ?? key

export const INTERFACE_GROUPS: string[] = [...new Set(INTERFACE_STRINGS.map((entry) => entry.group))]
