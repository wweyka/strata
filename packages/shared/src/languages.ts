/** Interface languages with full translations. */
export const INTERFACE_LANGUAGES = ['en', 'es', 'ru'] as const;
export type InterfaceLanguage = (typeof INTERFACE_LANGUAGES)[number];

/** Languages a learner can study in; names are shown in their own language. */
export const LEARNING_LANGUAGES: { tag: string; name: string }[] = [
  { tag: 'en', name: 'English' },
  { tag: 'es', name: 'Español' },
  { tag: 'ru', name: 'Русский' },
  { tag: 'uk', name: 'Українська' },
  { tag: 'de', name: 'Deutsch' },
  { tag: 'fr', name: 'Français' },
  { tag: 'it', name: 'Italiano' },
  { tag: 'pt', name: 'Português' },
  { tag: 'pl', name: 'Polski' },
  { tag: 'tr', name: 'Türkçe' },
  { tag: 'ar', name: 'العربية' },
  { tag: 'hi', name: 'हिन्दी' },
  { tag: 'zh', name: '中文' },
  { tag: 'ja', name: '日本語' },
  { tag: 'ko', name: '한국어' },
];

export function isInterfaceLanguage(tag: string | null | undefined): tag is InterfaceLanguage {
  return !!tag && (INTERFACE_LANGUAGES as readonly string[]).includes(tag);
}
