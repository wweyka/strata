import type { MaterialKind } from './enums';

/** File types the ingestion pipeline accepts, by MIME type. */
export const ACCEPTED_MATERIAL_TYPES: Record<string, MaterialKind> = {
  'application/pdf': 'pdf',
  'application/epub+zip': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.oasis.opendocument.text': 'document',
  'application/rtf': 'document',
  'application/vnd.ms-powerpoint': 'presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation',
  'application/vnd.oasis.opendocument.presentation': 'presentation',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/heic': 'image',
  'text/plain': 'text',
  'text/markdown': 'note',
  'text/html': 'document',
};

const EXTENSION_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  html: 'text/html',
  htm: 'text/html',
};

/** Resolve a usable MIME type: pickers often report octet-stream or nothing at all. */
export function resolveMimeType(fileName: string, reported?: string | null): string | null {
  if (reported && reported in ACCEPTED_MATERIAL_TYPES) return reported;
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[extension] ?? null;
}

export function materialKindFor(mimeType: string): MaterialKind {
  return ACCEPTED_MATERIAL_TYPES[mimeType] ?? 'other';
}

/** A storage object name that is safe and unique: `<user>/<material>/<slug>.<ext>`. */
export function materialStoragePath(userId: string, materialId: string, fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${userId}/${materialId}/${base || 'file'}${extension ? `.${extension}` : ''}`;
}

/** Title shown in the library: the file name without extension, tidied. */
export function titleFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName).replace(/[_]+/g, ' ').trim();
  return (base || fileName).slice(0, 200);
}
