import type { DocumentPickerAsset } from 'expo-document-picker';

export type PickedFile = { name: string; mimeType?: string | null; size?: number | null; uri: string; file?: Blob };

export function fromPickerAsset(asset: DocumentPickerAsset): PickedFile {
  return { name: asset.name, mimeType: asset.mimeType, size: asset.size, uri: asset.uri, file: asset.file };
}

/** Web: the picker hands back a File object. */
export async function readPickedFile(file: PickedFile): Promise<ArrayBuffer> {
  if (file.file) return file.file.arrayBuffer();
  const response = await fetch(file.uri);
  return response.arrayBuffer();
}
