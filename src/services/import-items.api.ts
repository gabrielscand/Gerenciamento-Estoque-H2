import { Platform } from 'react-native';
import type {
  ImportCommitRequest,
  ImportCommitResponse,
  ImportPreviewResponse,
} from '../types/inventory';

export type ImportFileInput = {
  uri: string;
  name: string;
  mimeType?: string | null;
};

export type ImportDefaultsInput = {
  defaultCategory: string;
  defaultMinQuantity: number;
};

const IMPORT_API_URL = (process.env.EXPO_PUBLIC_IMPORT_API_URL ?? '').trim().replace(/\/+$/, '');

const ACCEPTED_XLSX_MIME_TYPES = new Set<string>([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
  'application/zip',
]);

function ensureApiUrl(): string {
  if (!IMPORT_API_URL) {
    throw new Error('EXPO_PUBLIC_IMPORT_API_URL nao configurada. Atualize o .env para usar a importacao.');
  }

  return IMPORT_API_URL;
}

function hasXlsxExtension(fileName: string): boolean {
  return fileName.trim().toLocaleLowerCase().endsWith('.xlsx');
}

export function validateImportFile(file: ImportFileInput): string | null {
  const mimeType = file.mimeType?.trim().toLocaleLowerCase() ?? '';

  if (!hasXlsxExtension(file.name)) {
    return 'Selecione um arquivo .xlsx valido.';
  }

  if (mimeType.length > 0 && !ACCEPTED_XLSX_MIME_TYPES.has(mimeType)) {
    return 'Tipo de arquivo invalido. Envie um arquivo .xlsx.';
  }

  return null;
}

async function parseErrorResponse(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };

    if (data.error && data.error.trim().length > 0) {
      return data.error;
    }
  } catch {
    // Fallback below.
  }

  return `Falha na importacao (${response.status}).`;
}

async function appendFileToFormData(formData: FormData, file: ImportFileInput): Promise<void> {
  if (Platform.OS === 'web') {
    const blobResponse = await fetch(file.uri);

    if (!blobResponse.ok) {
      throw new Error('Nao foi possivel ler o arquivo selecionado.');
    }

    const blob = await blobResponse.blob();
    formData.append('file', blob, file.name);
    return;
  }

  formData.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.mimeType ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  } as unknown as Blob);
}

export async function previewImportItems(
  file: ImportFileInput,
  defaults: ImportDefaultsInput,
): Promise<ImportPreviewResponse> {
  const validationError = validateImportFile(file);

  if (validationError) {
    throw new Error(validationError);
  }

  if (!Number.isFinite(defaults.defaultMinQuantity) || defaults.defaultMinQuantity < 0) {
    throw new Error('Quantidade minima padrao invalida.');
  }

  const formData = new FormData();
  await appendFileToFormData(formData, file);
  formData.append('defaultCategory', defaults.defaultCategory.trim().toLocaleLowerCase());
  formData.append('defaultMinQuantity', String(defaults.defaultMinQuantity));

  const response = await fetch(`${ensureApiUrl()}/api/import-items?phase=preview`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  return (await response.json()) as ImportPreviewResponse;
}

export async function commitImportItems(payload: ImportCommitRequest): Promise<ImportCommitResponse> {
  const response = await fetch(`${ensureApiUrl()}/api/import-items?phase=commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  return (await response.json()) as ImportCommitResponse;
}
