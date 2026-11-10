import type { MaterialStatus } from '@strata/shared';
import type { TFunction } from 'i18next';

import type { ProcessingError } from '@/data/types';

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

const STAGES = new Set([
  'queued',
  'starting',
  'downloading',
  'extracting',
  'reading_scans',
  'indexing',
  'analyzing',
  'organizing',
  'saving',
  'retrying',
]);

/** What the pipeline is doing right now, in the user's language. */
export function stageLabel(stage: string | null, t: TFunction): string {
  return stage && STAGES.has(stage) ? t(`library.processing.${stage}`) : t('library.status.processing');
}

const REASONS = new Set([
  'unsupported_format',
  'unreadable_file',
  'no_text',
  'page_quota',
  'file_missing',
  'file_too_large',
  'checksum_mismatch',
  'model_refused',
  'output_too_long',
  'provider_auth',
  'provider_rejected',
  'handler_error',
]);

/** Failures that retrying the same file cannot fix (the database refuses these retries too). */
const PERMANENT = new Set(['unsupported_format', 'unreadable_file', 'no_text', 'checksum_mismatch']);

export function failureMessage(error: ProcessingError | null, t: TFunction): string {
  const reason = error?.reason && REASONS.has(error.reason) ? error.reason : 'handler_error';
  return t(`library.failure.${reason}`, {
    limit: error?.limit ?? '',
    configure: (error?.configure ?? []).join(', '),
    message: error?.message ?? '',
  });
}

export function canRetry(error: ProcessingError | null): boolean {
  return !PERMANENT.has(error?.reason ?? '');
}
