import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';

export type PickedFile = { name: string; mimeType?: string | null; size?: number | null; uri: string; file?: Blob };

export function fromPickerAsset(asset: DocumentPickerAsset): PickedFile {
  return { name: asset.name, mimeType: asset.mimeType, size: asset.size, uri: asset.uri, file: asset.file };
}

/** Native: read the picked file from the app cache. */
export async function readPickedFile(file: PickedFile): Promise<ArrayBuffer> {
  return new File(file.uri).arrayBuffer();
}
