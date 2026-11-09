import { isInterfaceLanguage, type InterfaceLanguage } from '@strata/shared';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { localPrefs } from '@/lib/local-prefs';

import en from './locales/en';
import es from './locales/es';
import ru from './locales/ru';

export function deviceLanguage(): InterfaceLanguage {
  for (const locale of getLocales()) {
    if (isInterfaceLanguage(locale.languageCode)) return locale.languageCode;
  }
  return 'en';
}

const stored = localPrefs.get('language');

// eslint-disable-next-line import/no-named-as-default-member
i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es }, ru: { translation: ru } },
  lng: isInterfaceLanguage(stored) ? stored : deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Switch the interface language and remember it on this device for the next cold start. */
export function setInterfaceLanguage(language: string) {
  if (!isInterfaceLanguage(language)) return;
  localPrefs.set('language', language);
  // eslint-disable-next-line import/no-named-as-default-member
  if (i18n.language !== language) void i18n.changeLanguage(language);
}

export default i18n;
