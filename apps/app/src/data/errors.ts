import type { TFunction } from 'i18next';

type MaybeError = { message?: string; hint?: string | null; code?: string; status?: number; name?: string };

/** A sentence for the user. Known database and auth errors get a translated message. */
export function describeError(error: unknown, t: TFunction): string {
  if (!error) return t('common.errorBody');
  const e = error as MaybeError;
  const known: Record<string, string> = {
    quota_exceeded: 'errors.quotaExceeded',
    file_too_large: 'errors.fileTooLarge',
    upload_missing: 'errors.uploadMissing',
    not_found: 'errors.notFound',
    not_retryable: 'errors.notRetryable',
  };
  if (e.hint && known[e.hint]) return t(known[e.hint]);
  const message = e.message ?? '';
  if (/invalid login credentials/i.test(message)) return t('errors.invalidCredentials');
  if (/email not confirmed/i.test(message)) return t('errors.emailNotConfirmed');
  if (/user already registered|already been registered/i.test(message)) return t('errors.alreadyRegistered');
  if (/password should be at least|weak password|password is too weak/i.test(message)) return t('errors.weakPassword');
  if (/rate limit|too many requests|security purposes/i.test(message) || e.status === 429)
    return t('errors.rateLimited');
  if (/network request failed|failed to fetch|load failed|networkerror/i.test(message)) return t('errors.network');
  if (/mime type .* is not supported|invalid_mime_type/i.test(message)) return t('errors.unsupportedType');
  if (/payload too large|exceeded the maximum allowed size/i.test(message)) return t('errors.fileTooLarge');
  if (/is not configured/i.test(message)) return message;
  return t('common.errorBody');
}
