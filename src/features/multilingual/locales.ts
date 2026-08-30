/**
 * The world locale list behind the Languages screen and the translation table.
 *
 * Held as tuples rather than objects because the list is long and the shape is
 * uniform - written out as objects it is four times the file for the same
 * data, and a long list nobody can scan is a list nobody maintains.
 *
 * Each entry is [BCP 47 tag, English name, endonym, rtl?]. The endonym matters
 * more than it looks: a language switcher that offers "German" to somebody who
 * only reads German has failed at the one job it has, so the switcher shows
 * the endonym and the admin screens show both.
 *
 * Regional variants are only listed where the written language genuinely
 * differs enough to be worth translating twice (en-AU/en-GB/en-US,
 * pt-BR/pt-PT, zh-Hans/zh-Hant, es-ES/es-MX, fr-CA). Everything else is the
 * plain language subtag - offering forty flavours of one language invites
 * people to split their content across variants that then all need writing.
 */

export type LocaleDef = {
  /** BCP 47 tag. Used as the URL prefix, the cookie value and the storage key. */
  code: string
  /** English name, for the admin screens. */
  label: string
  /** The language's own name, for the visitor-facing switcher. */
  native: string
  /** Right-to-left script. Drives `dir` on the document element. */
  rtl: boolean
}

type LocaleTuple = readonly [code: string, label: string, native: string, rtl?: true]

const LOCALE_TUPLES: readonly LocaleTuple[] = [
  ['af', 'Afrikaans', 'Afrikaans'],
  ['am', 'Amharic', 'አማርኛ'],
  ['ar', 'Arabic', 'العربية', true],
  ['ar-EG', 'Arabic (Egypt)', 'العربية (مصر)', true],
  ['ar-SA', 'Arabic (Saudi Arabia)', 'العربية (السعودية)', true],
  ['as', 'Assamese', 'অসমীয়া'],
  ['az', 'Azerbaijani', 'Azərbaycan dili'],
  ['be', 'Belarusian', 'Беларуская'],
  ['bg', 'Bulgarian', 'Български'],
  ['bn', 'Bengali', 'বাংলা'],
  ['bs', 'Bosnian', 'Bosanski'],
  ['ca', 'Catalan', 'Català'],
  ['ceb', 'Cebuano', 'Cebuano'],
  ['ckb', 'Kurdish (Sorani)', 'کوردیی ناوەندی', true],
  ['cs', 'Czech', 'Čeština'],
  ['cy', 'Welsh', 'Cymraeg'],
  ['da', 'Danish', 'Dansk'],
  ['de', 'German', 'Deutsch'],
  ['de-AT', 'German (Austria)', 'Deutsch (Österreich)'],
  ['de-CH', 'German (Switzerland)', 'Deutsch (Schweiz)'],
  ['dv', 'Dhivehi', 'ދިވެހި', true],
  ['el', 'Greek', 'Ελληνικά'],
  ['en-AU', 'English (Australia)', 'English (Australia)'],
  ['en-CA', 'English (Canada)', 'English (Canada)'],
  ['en-GB', 'English (United Kingdom)', 'English (United Kingdom)'],
  ['en-IE', 'English (Ireland)', 'English (Ireland)'],
  ['en-IN', 'English (India)', 'English (India)'],
  ['en-NZ', 'English (New Zealand)', 'English (New Zealand)'],
  ['en-US', 'English (United States)', 'English (United States)'],
  ['en-ZA', 'English (South Africa)', 'English (South Africa)'],
  ['eo', 'Esperanto', 'Esperanto'],
  ['es-AR', 'Spanish (Argentina)', 'Español (Argentina)'],
  ['es-ES', 'Spanish (Spain)', 'Español (España)'],
  ['es-MX', 'Spanish (Mexico)', 'Español (México)'],
  ['et', 'Estonian', 'Eesti'],
  ['eu', 'Basque', 'Euskara'],
  ['fa', 'Persian', 'فارسی', true],
  ['fi', 'Finnish', 'Suomi'],
  ['fil', 'Filipino', 'Filipino'],
  ['fo', 'Faroese', 'Føroyskt'],
  ['fr', 'French', 'Français'],
  ['fr-BE', 'French (Belgium)', 'Français (Belgique)'],
  ['fr-CA', 'French (Canada)', 'Français (Canada)'],
  ['fr-CH', 'French (Switzerland)', 'Français (Suisse)'],
  ['fy', 'Frisian', 'Frysk'],
  ['ga', 'Irish', 'Gaeilge'],
  ['gd', 'Scottish Gaelic', 'Gàidhlig'],
  ['gl', 'Galician', 'Galego'],
  ['gu', 'Gujarati', 'ગુજરાતી'],
  ['ha', 'Hausa', 'Hausa'],
  ['haw', 'Hawaiian', 'ʻŌlelo Hawaiʻi'],
  ['he', 'Hebrew', 'עברית', true],
  ['hi', 'Hindi', 'हिन्दी'],
  ['hr', 'Croatian', 'Hrvatski'],
  ['ht', 'Haitian Creole', 'Kreyòl ayisyen'],
  ['hu', 'Hungarian', 'Magyar'],
  ['hy', 'Armenian', 'Հայերեն'],
  ['id', 'Indonesian', 'Bahasa Indonesia'],
  ['ig', 'Igbo', 'Asụsụ Igbo'],
  ['is', 'Icelandic', 'Íslenska'],
  ['it', 'Italian', 'Italiano'],
  ['it-CH', 'Italian (Switzerland)', 'Italiano (Svizzera)'],
  ['ja', 'Japanese', '日本語'],
  ['jv', 'Javanese', 'Basa Jawa'],
  ['ka', 'Georgian', 'ქართული'],
  ['kk', 'Kazakh', 'Қазақ тілі'],
  ['km', 'Khmer', 'ភាសាខ្មែរ'],
  ['kn', 'Kannada', 'ಕನ್ನಡ'],
  ['ko', 'Korean', '한국어'],
  ['ku', 'Kurdish (Kurmanji)', 'Kurdî'],
  ['ky', 'Kyrgyz', 'Кыргызча'],
  ['lb', 'Luxembourgish', 'Lëtzebuergesch'],
  ['lo', 'Lao', 'ລາວ'],
  ['lt', 'Lithuanian', 'Lietuvių'],
  ['lv', 'Latvian', 'Latviešu'],
  ['mg', 'Malagasy', 'Malagasy'],
  ['mi', 'Maori', 'Te Reo Māori'],
  ['mk', 'Macedonian', 'Македонски'],
  ['ml', 'Malayalam', 'മലയാളം'],
  ['mn', 'Mongolian', 'Монгол'],
  ['mr', 'Marathi', 'मराठी'],
  ['ms', 'Malay', 'Bahasa Melayu'],
  ['mt', 'Maltese', 'Malti'],
  ['my', 'Burmese', 'မြန်မာ'],
  ['nb', 'Norwegian Bokmål', 'Norsk bokmål'],
  ['ne', 'Nepali', 'नेपाली'],
  ['nl', 'Dutch', 'Nederlands'],
  ['nl-BE', 'Dutch (Belgium)', 'Nederlands (België)'],
  ['nn', 'Norwegian Nynorsk', 'Norsk nynorsk'],
  ['ny', 'Chichewa', 'Chichewa'],
  ['or', 'Odia', 'ଓଡ଼ିଆ'],
  ['pa', 'Punjabi', 'ਪੰਜਾਬੀ'],
  ['pl', 'Polish', 'Polski'],
  ['ps', 'Pashto', 'پښتو', true],
  ['pt-BR', 'Portuguese (Brazil)', 'Português (Brasil)'],
  ['pt-PT', 'Portuguese (Portugal)', 'Português (Portugal)'],
  ['ro', 'Romanian', 'Română'],
  ['ru', 'Russian', 'Русский'],
  ['rw', 'Kinyarwanda', 'Ikinyarwanda'],
  ['sd', 'Sindhi', 'سنڌي', true],
  ['si', 'Sinhala', 'සිංහල'],
  ['sk', 'Slovak', 'Slovenčina'],
  ['sl', 'Slovenian', 'Slovenščina'],
  ['sm', 'Samoan', 'Gagana Samoa'],
  ['sn', 'Shona', 'ChiShona'],
  ['so', 'Somali', 'Soomaali'],
  ['sq', 'Albanian', 'Shqip'],
  ['sr', 'Serbian', 'Српски'],
  ['st', 'Sesotho', 'Sesotho'],
  ['su', 'Sundanese', 'Basa Sunda'],
  ['sv', 'Swedish', 'Svenska'],
  ['sw', 'Swahili', 'Kiswahili'],
  ['ta', 'Tamil', 'தமிழ்'],
  ['te', 'Telugu', 'తెలుగు'],
  ['tg', 'Tajik', 'Тоҷикӣ'],
  ['th', 'Thai', 'ไทย'],
  ['ti', 'Tigrinya', 'ትግርኛ'],
  ['tk', 'Turkmen', 'Türkmençe'],
  ['to', 'Tongan', 'Lea faka-Tonga'],
  ['tr', 'Turkish', 'Türkçe'],
  ['tt', 'Tatar', 'Татарча'],
  ['ug', 'Uyghur', 'ئۇيغۇرچە', true],
  ['uk', 'Ukrainian', 'Українська'],
  ['ur', 'Urdu', 'اردو', true],
  ['uz', 'Uzbek', 'Oʻzbekcha'],
  ['vi', 'Vietnamese', 'Tiếng Việt'],
  ['xh', 'Xhosa', 'isiXhosa'],
  ['yi', 'Yiddish', 'ייִדיש', true],
  ['yo', 'Yoruba', 'Yorùbá'],
  ['zh-Hans', 'Chinese (Simplified)', '简体中文'],
  ['zh-Hant', 'Chinese (Traditional)', '繁體中文'],
  ['zh-HK', 'Chinese (Hong Kong)', '繁體中文 (香港)'],
  ['zu', 'Zulu', 'isiZulu'],
]

export const LOCALES: LocaleDef[] = LOCALE_TUPLES.map(([code, label, native, rtl]) => ({
  code,
  label,
  native,
  rtl: rtl === true,
}))

/** The site's primary language until somebody changes it. */
export const DEFAULT_LOCALE = 'en-AU'

const BY_CODE = new Map(LOCALES.map((locale) => [locale.code, locale]))

export const findLocale = (code: string | null | undefined): LocaleDef | undefined =>
  code ? BY_CODE.get(code) : undefined

export const isKnownLocale = (code: string | null | undefined): boolean => Boolean(findLocale(code))

/** Falls back to the code itself so an unknown tag still renders as something. */
export const localeLabel = (code: string): string => findLocale(code)?.label ?? code

export const localeNativeName = (code: string): string => findLocale(code)?.native ?? code

export const isRtlLocale = (code: string): boolean => findLocale(code)?.rtl ?? false

/** Select-field options for the Languages screen, sorted by English name. */
export const LOCALE_OPTIONS: { label: string; value: string }[] = [...LOCALES]
  .sort((a, b) => a.label.localeCompare(b.label))
  .map((locale) => ({ label: `${locale.label} - ${locale.native}`, value: locale.code }))
