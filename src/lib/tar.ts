/**
 * Minimal browser-compatible TAR implementation (POSIX UStar format).
 * No external dependencies — uses only standard typed arrays and TextEncoder/Decoder.
 *
 * Used to bundle multiple files into a single CMS payload, since
 * EncapsulatedContentInfo can hold only one octet string.
 */

export interface TarEntry {
  name: string;
  data: Uint8Array;
  mimeType?: string;
}

// ─── Write ──────────────────────────────────────────────────────────────────

function makeHeader(name: string, size: number, mtime: number): Uint8Array {
  const header = new Uint8Array(512);
  const enc = new TextEncoder();

  // Filename (offset 0, 100 bytes — null-terminated)
  const nameBytes = enc.encode(name.slice(0, 99));
  header.set(nameBytes, 0);

  // File permissions: 0000644 (offset 100, 8 bytes)
  header.set(enc.encode('0000644\0'), 100);

  // UID / GID: 0000000 (offsets 108, 116 — 8 bytes each)
  header.set(enc.encode('0000000\0'), 108);
  header.set(enc.encode('0000000\0'), 116);

  // File size in octal (offset 124, 12 bytes)
  const sizeOctal = size.toString(8).padStart(11, '0') + '\0';
  header.set(enc.encode(sizeOctal), 124);

  // Modification time in octal (offset 136, 12 bytes)
  const mtimeOctal = mtime.toString(8).padStart(11, '0') + '\0';
  header.set(enc.encode(mtimeOctal), 136);

  // Checksum placeholder — 8 spaces (offset 148, 8 bytes)
  header.fill(0x20, 148, 156);

  // File type: '0' = regular file (offset 156)
  header[156] = 0x30;

  // UStar magic (offset 257, 6 bytes) + version "00" (offset 263, 2 bytes)
  header.set(enc.encode('ustar\0'), 257);
  header.set(enc.encode('00'), 263);

  // Compute checksum (treat checksum field as 8 spaces)
  let checksum = 0;
  for (let i = 0; i < 512; i++) checksum += header[i];
  // Already filled with spaces (0x20×8=256) in the checksum field
  const csStr = checksum.toString(8).padStart(6, '0') + '\0 ';
  header.set(enc.encode(csStr.slice(0, 8)), 148);

  return header;
}

/** Pack an array of files into a TAR archive. */
export function packTar(files: TarEntry[]): Uint8Array {
  const mtime = Math.floor(Date.now() / 1000);
  const parts: Uint8Array[] = [];

  for (const file of files) {
    parts.push(makeHeader(file.name, file.data.length, mtime));
    parts.push(file.data);

    // Pad data to 512-byte boundary
    const rem = file.data.length % 512;
    if (rem > 0) parts.push(new Uint8Array(512 - rem));
  }

  // End-of-archive: two zero 512-byte blocks
  parts.push(new Uint8Array(1024));

  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

// ─── Read ───────────────────────────────────────────────────────────────────

/** Unpack a TAR archive into individual file entries. */
export function unpackTar(data: Uint8Array): TarEntry[] {
  const dec = new TextDecoder();
  const entries: TarEntry[] = [];
  let offset = 0;

  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);

    // End-of-archive marker: two consecutive zero blocks
    if (header.every(b => b === 0)) break;

    // Filename (offset 0–99)
    let end = 0;
    while (end < 100 && header[end] !== 0) end++;
    const name = dec.decode(header.subarray(0, end));
    if (!name) break;

    // File size in octal (offset 124–135)
    const sizeStr = dec.decode(header.subarray(124, 136)).replace(/\0/g, '').trim();
    const size = parseInt(sizeStr, 8) || 0;

    // File type flag (offset 156): '0' or '\0' = regular file, '5' = directory
    const typeFlag = String.fromCharCode(header[156]);

    offset += 512; // advance past header

    if (typeFlag === '0' || typeFlag === '\0') {
      entries.push({ name, data: new Uint8Array(data.subarray(offset, offset + size)) });
    }

    // Skip padded data blocks
    offset += Math.ceil(size / 512) * 512;
  }

  return entries;
}

/** Returns true if the given bytes look like a UStar TAR archive. */
export function isTar(data: Uint8Array): boolean {
  if (data.length < 512) return false;
  // UStar magic at byte offset 257
  const magic = String.fromCharCode(...data.subarray(257, 262));
  return magic === 'ustar';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Given a FileList or File array, return a single File to sign/encrypt.
 * If only one file: returns it as-is.
 * If multiple files: bundles them into a TAR and returns a File wrapping the TAR bytes.
 */
export async function filesToPayload(files: File[]): Promise<File> {
  if (files.length === 0) throw new Error('파일이 없습니다.');
  if (files.length === 1) return files[0];

  const entries: TarEntry[] = await Promise.all(
    files.map(async f => ({
      name: f.name,
      data: new Uint8Array(await f.arrayBuffer()),
      mimeType: f.type
    }))
  );
  const tar = packTar(entries);
  const bundleName = files.map(f => f.name.replace(/\.[^.]+$/, '')).join('+') + '.tar';
  return new File([tar], bundleName, { type: 'application/x-tar' });
}
