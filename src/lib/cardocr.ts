/**
 * Business card OCR pipeline (browser-only, zero external API).
 *
 * Pipeline:
 *  1. cropCard()  — raw image → canvas (instant).
 *                   jscanify + OpenCV.js perspective transform attempted
 *                   in the background with a 6-second timeout; if it wins
 *                   the race the cropped canvas is used, otherwise the raw
 *                   canvas is used immediately so OCR is never blocked.
 *  2. runOCR()    — Tesseract.js (kor + eng, cached in browser storage)
 *  3. parseBizCard() — regex-based field extraction
 */

// ─── Raw canvas helper ───────────────────────────────────────────────────────

function imgToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width  = img.naturalWidth  || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

// ─── OpenCV + jscanify (best-effort, non-blocking) ───────────────────────────

async function tryJscanify(img: HTMLImageElement): Promise<HTMLCanvasElement | null> {
  // Race: load OpenCV within 6 s, otherwise give up
  const cv = await Promise.race([
    new Promise<unknown>((resolve, reject) => {
      const w = window as any;
      if (w.cv?.Mat) { resolve(w.cv); return; }
      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.10.0/opencv.js';
      script.async = true;
      script.onload = () => {
        const poll = setInterval(() => {
          if (w.cv?.Mat) { clearInterval(poll); resolve(w.cv); }
        }, 50);
        setTimeout(() => { clearInterval(poll); reject(); }, 8000);
      };
      script.onerror = () => reject();
      document.head.appendChild(script);
    }),
    new Promise<null>((_, reject) => setTimeout(reject, 6000))
  ]).catch(() => null);

  if (!cv) return null;

  try {
    const { default: Jscanify } = await import('jscanify');
    const scanner = new (Jscanify as any)();
    const result = scanner.scanImage(img) as HTMLCanvasElement | null;
    if (result && result.width > 10) return result;
  } catch { /* ignore */ }
  return null;
}

/**
 * Return a canvas ready for OCR.
 * Immediately returns the raw canvas; the caller may optionally await
 * the jscanify enhancement via the returned promise pair.
 */
export async function cropCard(img: HTMLImageElement): Promise<HTMLCanvasElement> {
  // Always resolve quickly with the raw canvas
  return imgToCanvas(img);
}

/**
 * Try perspective-correcting the image in the background.
 * Resolves with the corrected canvas, or null if unavailable within timeout.
 */
export function tryCropEnhanced(img: HTMLImageElement): Promise<HTMLCanvasElement | null> {
  return tryJscanify(img);
}

// ─── OCR ────────────────────────────────────────────────────────────────────

export type OcrProgress = (stage: string, pct: number) => void;

export async function runOCR(
  source: HTMLCanvasElement | HTMLImageElement,
  onProgress?: OcrProgress
): Promise<string> {
  onProgress?.('언어 팩 준비 중…', 3);
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(['kor', 'eng'], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status.includes('load')) {
        onProgress?.('언어 팩 로드 중…', 3 + Math.round(m.progress * 12));
      } else if (m.status.includes('init')) {
        onProgress?.('초기화 중…', 15 + Math.round(m.progress * 5));
      } else if (m.status.includes('recogniz')) {
        onProgress?.('텍스트 인식 중…', 20 + Math.round(m.progress * 75));
      }
    }
  });
  const { data: { text } } = await worker.recognize(source);
  await worker.terminate();
  onProgress?.('완료', 100);
  return text;
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

export interface ParsedCard {
  name:         string;
  email:        string;
  phone:        string;
  organization: string;
}

const ORG_RE = /(주식회사|유한회사|\(주\)|\(유\)|법인|그룹|홀딩스|파트너스|어소시에이츠|Corp\.?|Inc\.?|Ltd\.?|LLC\.?|Co\.|Group|Solutions?|Systems?|Tech|Labs?|Studio|Global|Korea|International)/i;

// Top-30 Korean surnames
const KR_SURNAMES = '김이박최정강조윤장임한오서신권황안송류전홍고문손양배백허유남심노하곽성차주우구민나진지엄채원천방공';

export function parseBizCard(text: string): ParsedCard {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // ① Email — highest confidence
  const email = text.match(/[\w._%+\-]+@[\w.\-]+\.[a-zA-Z]{2,}/)?.[0] ?? '';

  // ② Phone — Korean mobile / landline / international
  const phoneRaw = text.match(
    /(?:\+82[\s\-]?)?0?(?:10|2|31|32|33|41|42|43|44|51|52|53|54|55|61|62|63|64|70|80|1[0-9]{3})[\s\-]?\d{3,4}[\s\-]?\d{4}/
  )?.[0] ?? '';
  const phone = phoneRaw.replace(/\s/g, '-');

  // ③ Organization — lines matching company keywords
  let organization = '';
  for (const line of lines) {
    if (ORG_RE.test(line) && line.length < 80) {
      organization = line.trim();
      break;
    }
  }
  // Fallback: infer from email domain
  if (!organization && email) {
    const dom = email.split('@')[1]?.split('.')[0] ?? '';
    if (dom) organization = dom.charAt(0).toUpperCase() + dom.slice(1);
  }

  // ④ Name — position + pattern based
  let name = '';
  for (const line of lines) {
    if (line.includes('@') || ORG_RE.test(line)) continue;
    if (/\d{3}/.test(line)) continue;                          // skip digit-heavy lines
    if (line === organization) continue;

    // Korean: 2–5 chars starting with a known surname
    if (/^[\uAC00-\uD7A3]{2,5}$/.test(line) && KR_SURNAMES.includes(line[0])) {
      name = line; break;
    }
    const krInLine = line.match(new RegExp(`[${KR_SURNAMES}][\uAC00-\uD7A3]{1,4}`));
    if (krInLine?.[0] && krInLine[0].length <= 5) { name = krInLine[0]; break; }

    // English: 2–3 capitalized words
    const enMatch = line.match(/^[A-Z][a-zA-Z\-']{1,20}(?:\s[A-Z][a-zA-Z\-']{1,20}){1,2}$/);
    if (enMatch) { name = enMatch[0]; break; }
  }

  return { name, email, phone, organization };
}
