import type { MaterialStatus } from '@strata/shared';

export const statusTone: Record<MaterialStatus, 'neutral' | 'info' | 'success' | 'danger' | 'warning' | 'accent'> = {
  uploading: 'neutral',
  queued: 'neutral',
  processing: 'info',
  ready: 'success',
  failed: 'danger',
  awaiting_credentials: 'warning',
};

export function formatBytes(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value)} ${units[unit]}`;
}
