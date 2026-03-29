/**
 * In-memory store for files to be viewed in the PDF viewer.
 * Files are never written to disk — they live only in memory.
 */
import { writable } from 'svelte/store';

export interface ViewerFile {
  name: string;
  data: Uint8Array;
  mimeType?: string;
}

export const pendingViewerFiles = writable<ViewerFile[]>([]);
