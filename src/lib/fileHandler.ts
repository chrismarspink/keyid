/**
 * File extension routing for PWA file_handlers.
 * Maps .pkis* file extensions to app routes and handles launchQueue.
 */

export type PkisExtension = '.pkis' | '.pkis-cert' | '.pkis-req' | '.pkis-key' | '.pkis-sig';

export interface LaunchedFile {
  file: File;
  extension: PkisExtension;
  route: string;
}

const EXTENSION_ROUTES: Record<PkisExtension, string> = {
  '.pkis': '/file/sign',
  '.pkis-cert': '/file/cert',
  '.pkis-req': '/file/request',
  '.pkis-key': '/file/key',
  '.pkis-sig': '/file/verify'
};

export function getExtension(filename: string): PkisExtension | null {
  for (const ext of Object.keys(EXTENSION_ROUTES) as PkisExtension[]) {
    if (filename.toLowerCase().endsWith(ext)) return ext;
  }
  return null;
}

export function getRouteForExtension(ext: PkisExtension): string {
  return EXTENSION_ROUTES[ext];
}

/**
 * Register a LaunchQueue consumer to handle files opened via file_handlers.
 * Call this once on app initialization (browser only).
 */
export function registerLaunchQueueHandler(
  onFile: (launched: LaunchedFile) => void
): void {
  if (typeof window === 'undefined') return;
  const lq = (window as unknown as { launchQueue?: { setConsumer: (fn: (params: { files: FileSystemFileHandle[] }) => void) => void } }).launchQueue;
  if (!lq) return;

  lq.setConsumer(async (launchParams) => {
    if (!launchParams.files || launchParams.files.length === 0) return;
    for (const handle of launchParams.files) {
      let file: File;
      try {
        file = await handle.getFile();
      } catch {
        console.warn('KeyID: launched file could not be read (permission denied or file moved)');
        continue;
      }
      const ext = getExtension(file.name);
      if (!ext) continue;
      onFile({
        file,
        extension: ext,
        route: getRouteForExtension(ext)
      });
    }
  });
}

/**
 * Store a launched file in sessionStorage for retrieval by route pages.
 */
export function storeLaunchedFile(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      sessionStorage.setItem('launched_file_name', file.name);
      sessionStorage.setItem('launched_file_type', file.type);
      sessionStorage.setItem('launched_file_data', reader.result as string);
      resolve();
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Retrieve a launched file from sessionStorage.
 */
export function retrieveLaunchedFile(): { name: string; type: string; data: ArrayBuffer } | null {
  const name = sessionStorage.getItem('launched_file_name');
  const type = sessionStorage.getItem('launched_file_type');
  const dataUrl = sessionStorage.getItem('launched_file_data');
  if (!name || !dataUrl) return null;

  const b64 = dataUrl.split(',')[1];
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  sessionStorage.removeItem('launched_file_name');
  sessionStorage.removeItem('launched_file_type');
  sessionStorage.removeItem('launched_file_data');

  return { name, type: type ?? '', data: bytes.buffer };
}

/**
 * Download a file to the user's device.
 */
export function downloadFile(data: ArrayBuffer, filename: string, mimeType = 'application/octet-stream'): void {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
