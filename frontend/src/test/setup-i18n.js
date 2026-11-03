// Tests render synchronously: register both dictionaries before any test runs (the app itself
// loads them lazily, one language at a time; see src/i18n/index.jsx).
import { registerDict } from '../i18n/index.jsx'
import en from '../i18n/locales/en/index.js'
import vi from '../i18n/locales/vi/index.js'

registerDict('vi', vi)
registerDict('en', en)
