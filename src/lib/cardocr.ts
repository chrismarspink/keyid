/**
 * Business card OCR pipeline.
 * Image → OCR.Space API → regex parse → { text, logotype }
 * No jscanify / OpenCV / Tesseract dependencies (all caused module-load failures).
 */

// ─── Canvas helpers ───────────────────────────────────────────────────────────

export function imgToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width  = img.naturalWidth  || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

function resizeCanvas(src: HTMLCanvasElement, maxPx: number): HTMLCanvasElement {
  const { width: w, height: h } = src;
  if (w <= maxPx && h <= maxPx) return src;
  const scale = maxPx / Math.max(w, h);
  const c = document.createElement('canvas');
  c.width  = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Synchronous canvas → JPEG Blob via toDataURL (works on all browsers). */
function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Blob {
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const b64 = dataUrl.split(',')[1];
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return new Blob([arr], { type: 'image/jpeg' });
}

/** Reduce size iteratively until blob ≤ maxBytes. */
function toBlobUnder(
  src: HTMLCanvasElement,
  maxBytes: number,
  onLog?: DebugLog
): { blob: Blob; canvas: HTMLCanvasElement } {
  let canvas = src;
  let quality = 0.85;

  for (let i = 0; i < 8; i++) {
    const blob = canvasToJpegBlob(canvas, quality);
    dbg(`압축 시도 ${i + 1}: ${canvas.width}×${canvas.height} q=${quality.toFixed(2)} → ${(blob.size / 1024).toFixed(0)} KB`, onLog);
    if (blob.size <= maxBytes) return { blob, canvas };
    if (quality > 0.55) {
      quality = Math.max(0.55, quality - 0.1);
    } else {
      canvas = resizeCanvas(canvas, Math.round(Math.max(canvas.width, canvas.height) * 0.75));
      quality = 0.75;
    }
  }
  return { blob: canvasToJpegBlob(canvas, 0.5), canvas };
}

/**
 * 256×256 logotype image (center-square crop) for the certificate.
 * Returns a JPEG data URL.
 */
export function makeLogotype(src: HTMLCanvasElement): string {
  const size = 256;
  const { width: w, height: h } = src;
  const side = Math.min(w, h);
  const sx = Math.round((w - side) / 2);
  const sy = Math.round((h - side) / 4); // slightly above center for cards
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  c.getContext('2d')!.drawImage(src, sx, sy, side, side, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.88);
}

// ─── Debug log ────────────────────────────────────────────────────────────────

export type OcrProgress = (stage: string, pct: number) => void;
export type DebugLog    = (msg: string) => void;

const _dbg: string[] = [];
export function getDebugLog(): string[] { return _dbg; }

function dbg(msg: string, onLog?: DebugLog) {
  const ts   = new Date().toISOString().slice(11, 23);
  const line = `[${ts}] ${msg}`;
  console.log('[CardOCR]', line);
  _dbg.push(line);
  onLog?.(line);
}

// ─── OCR via OCR.Space ────────────────────────────────────────────────────────

export interface OcrResult {
  text:     string;
  logotype: string; // 256×256 JPEG data URL
}

export async function runOCR(
  source: HTMLCanvasElement | HTMLImageElement,
  onProgress?: OcrProgress,
  onLog?: DebugLog
): Promise<OcrResult> {
  _dbg.length = 0;

  // 1. Normalise to canvas
  dbg('이미지 변환 시작', onLog);
  onProgress?.('이미지 준비 중…', 5);
  let canvas = source instanceof HTMLCanvasElement
    ? source
    : imgToCanvas(source as HTMLImageElement);
  dbg(`원본: ${canvas.width}×${canvas.height}`, onLog);

  // 2. Generate logotype before any resizing (best quality)
  const logotype = makeLogotype(canvas);
  dbg('로고타입 생성 완료 (256×256)', onLog);

  // 3. Compress to < 900 KB for OCR.Space free key
  const MAX = 900 * 1024;
  const quick = canvasToJpegBlob(canvas, 0.85);
  dbg(`초기 blob: ${(quick.size / 1024).toFixed(0)} KB`, onLog);

  let blob: Blob;
  if (quick.size > MAX) {
    onProgress?.(`이미지 크기 조정 중… (${(quick.size / 1024).toFixed(0)} KB → 900 KB 이하)`, 12);
    dbg('크기 초과 — 자동 압축 시작', onLog);
    const result = toBlobUnder(canvas, MAX, onLog);
    blob = result.blob;
    canvas = result.canvas;
  } else {
    blob = quick;
  }
  dbg(`최종 blob: ${(blob.size / 1024).toFixed(0)} KB`, onLog);
  onProgress?.('OCR 서버 전송 중…', 25);

  // 4. POST to OCR.Space
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);

  dbg('OCR.Space POST 시작', onLog);
  const form = new FormData();
  form.append('apikey', 'helloworld');
  form.append('language', 'kor');
  form.append('isOverlayRequired', 'false');
  form.append('detectOrientation', 'true');
  form.append('scale', 'true');
  form.append('file', blob, 'card.jpg');

  let resp: Response;
  try {
    resp = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: form,
      signal: ctrl.signal
    });
  } catch (e: any) {
    clearTimeout(timer);
    const msg = e?.name === 'AbortError'
      ? '30초 타임아웃 — 네트워크를 확인하세요'
      : `네트워크 오류: ${e?.message ?? e}`;
    dbg(`fetch 실패: ${msg}`, onLog);
    throw new Error(msg);
  }
  clearTimeout(timer);
  dbg(`HTTP ${resp.status}`, onLog);
  if (!resp.ok) throw new Error(`OCR 서버 오류: HTTP ${resp.status}`);

  onProgress?.('텍스트 추출 중…', 70);
  const json = await resp.json();
  dbg(`응답: ${JSON.stringify(json).slice(0, 400)}`, onLog);

  if (json.IsErroredOnProcessing) {
    throw new Error(json.ErrorMessage?.[0] ?? 'OCR 처리 오류');
  }

  const text: string = json.ParsedResults?.[0]?.ParsedText ?? '';
  dbg(`추출 완료 — ${text.length}자\n${text.slice(0, 300)}`, onLog);
  onProgress?.('완료', 100);
  return { text, logotype };
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

export interface ParsedCard {
  name:         string;
  email:        string;
  phone:        string;
  organization: string;
}

const ORG_RE = /(주식회사|유한회사|\(주\)|\(유\)|법인|그룹|홀딩스|파트너스|Corp\.?|Inc\.?|Ltd\.?|LLC\.?|Co\.|Group|Solutions?|Systems?|Tech|Labs?|Studio|Global|Korea|International)/i;
const KR_SURNAMES = '김이박최정강조윤장임한오서신권황안송류전홍고문손양배백허유남심노하곽성차주우구민나진지엄채원천방공';

export function parseBizCard(text: string): ParsedCard {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // ① Email
  const email = text.match(/[\w._%+\-]+@[\w.\-]+\.[a-zA-Z]{2,}/)?.[0] ?? '';

  // ② Phone (handles 010.3418.6434 and 010. 3418. 6434)
  const phoneRaw = text.match(
    /(?:\+82[\s\-.]+)?0?(?:10|2|31|32|33|41|42|43|44|51|52|53|54|55|61|62|63|64|70|80|1[0-9]{3})[\s\-.]\s*\d{3,4}[\s\-.]\s*\d{4}/
  )?.[0] ?? '';
  const phone = phoneRaw.replace(/[\s.]/g, '-').replace(/-+/g, '-');

  // ③ Organization
  let organization = '';
  for (const line of lines) {
    if (ORG_RE.test(line) && line.length < 80) { organization = line.trim(); break; }
  }
  if (!organization && email) {
    const dom = email.split('@')[1]?.split('.')[0] ?? '';
    if (dom) organization = dom.charAt(0).toUpperCase() + dom.slice(1);
  }

  // ④ Name — must be at START of line (avoids job titles like 이사, 부장)
  let name = '';
  for (const line of lines) {
    if (line.includes('@') || ORG_RE.test(line)) continue;
    if (/\d{3}/.test(line)) continue;
    if (line === organization) continue;

    // Korean: "김진규" or "김 진 규 그룹장…" → 김진규
    const krStart = line.match(
      new RegExp(`^([${KR_SURNAMES}]\\s?[\\uAC00-\\uD7A3]\\s?[\\uAC00-\\uD7A3]?)(?:\\s|[^\\uAC00-\\uD7A3]|$)`)
    );
    if (krStart) {
      const kr = krStart[1].replace(/\s+/g, '');
      if (kr.length >= 2 && kr.length <= 4) { name = kr; break; }
    }

    // English: "KIM, Jin-Kyu" / "Kim Jin-Kyu"
    const enMatch = line.match(/^([A-Z][A-Z\-']{1,15}),?\s+([A-Z][a-zA-Z\-']{1,15})(?:\s[A-Z][a-zA-Z\-']{1,15})?$/);
    if (enMatch) { name = `${enMatch[1]} ${enMatch[2]}`; break; }
  }

  // Fallback: derive from email local-part
  if (!name && email) {
    const local = email.split('@')[0].replace(/[._\-]/g, ' ');
    const words = local.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1));
    if (words[0].length >= 2) name = words.join(' ');
  }

  return { name, email, phone, organization };
}
