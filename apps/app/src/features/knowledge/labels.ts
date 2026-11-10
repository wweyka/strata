import type { TFunction } from 'i18next';

/** "p. 12" or "pp. 12–18", or null when the material has no pages. */
export function pageRange(start: number | null, end: number | null, t: TFunction): string | null {
  if (start == null) return null;
  if (end == null || end === start) return t('material.page', { page: start });
  return t('material.pageRange', { start, end });
}
