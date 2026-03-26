/**
 * Canvas-based ID card renderer.
 * Produces a PNG data URL suitable for sharing or downloading.
 */

export interface CardData {
  commonName: string;
  email: string;
  organization: string;
  country: string;
  fingerprint: string;
  /** ISO date string */
  notAfter: string;
  /** Optional avatar data URL */
  avatar: string | null;
  trustLevel?: 'self' | 'known' | 'verified';
}

const CARD_W = 680;
const CARD_H = 214;
const BAND_W = 56;
const NAVY = '#1a3a6b';
const NAVY_DARK = '#102445';
const GOLD = '#c9a227';
const WHITE = '#ffffff';
const GRAY_TEXT = '#4b5563';
const LIGHT_BG = '#f8fafc';
const LIGHT_BG2 = '#e8f0f8';

/**
 * Render an ID card to a canvas and return a PNG data URL.
 */
export async function renderCardToPng(data: CardData): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W * 2; // 2x for retina
  canvas.height = CARD_H * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, LIGHT_BG);
  bg.addColorStop(1, LIGHT_BG2);
  ctx.fillStyle = bg;
  roundedRect(ctx, 0, 0, CARD_W, CARD_H, 16);
  ctx.fill();

  // Navy band
  const bandGrad = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bandGrad.addColorStop(0, NAVY);
  bandGrad.addColorStop(1, NAVY_DARK);
  ctx.fillStyle = bandGrad;
  roundedRect(ctx, 0, 0, BAND_W, CARD_H, 16, 0, 0, 16);
  ctx.fill();

  // Logo / shield on band
  ctx.save();
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('K', BAND_W / 2, 36);
  ctx.restore();

  // Country code on band
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(data.country || 'XX', BAND_W / 2, CARD_H - 12);
  ctx.restore();

  // Avatar circle
  const avatarX = BAND_W + 18;
  const avatarY = 18;
  const avatarR = 36;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarR, avatarY + avatarR, avatarR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#dde4ef';
  ctx.fill();

  if (data.avatar) {
    const img = await loadImage(data.avatar);
    ctx.clip();
    ctx.drawImage(img, avatarX, avatarY, avatarR * 2, avatarR * 2);
  } else {
    // Initials
    const initials = data.commonName
      .split(/\s+/)
      .map((w) => w[0] ?? '')
      .slice(0, 2)
      .join('')
      .toUpperCase();
    ctx.fillStyle = NAVY;
    ctx.font = `bold ${avatarR * 0.8}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, avatarX + avatarR, avatarY + avatarR + 1);
  }
  ctx.restore();

  // Content area
  const contentX = BAND_W + avatarR * 2 + 28;

  // Name
  ctx.fillStyle = NAVY_DARK;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(truncate(data.commonName, 28), contentX, 36);

  // Organization
  if (data.organization) {
    ctx.fillStyle = GRAY_TEXT;
    ctx.font = '12px sans-serif';
    ctx.fillText(truncate(data.organization, 36), contentX, 54);
  }

  // Email
  if (data.email) {
    ctx.fillStyle = GRAY_TEXT;
    ctx.font = '11px sans-serif';
    ctx.fillText(truncate(data.email, 40), contentX, 70);
  }

  // Divider
  ctx.strokeStyle = '#dde8f2';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(contentX, 82);
  ctx.lineTo(CARD_W - 16, 82);
  ctx.stroke();

  // Fingerprint (monospace, small)
  ctx.fillStyle = '#6b7280';
  ctx.font = '9px monospace';
  const fp = data.fingerprint;
  const fpLine1 = fp.substring(0, 47);
  const fpLine2 = fp.substring(47);
  ctx.fillText(fpLine1, contentX, 96);
  if (fpLine2) ctx.fillText(fpLine2, contentX, 108);

  // Label row
  ctx.fillStyle = GRAY_TEXT;
  ctx.font = '9px sans-serif';
  ctx.fillText('디지털 서명 인증서', contentX, 126);

  // Expiry
  const expDate = new Date(data.notAfter).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  ctx.fillText(`유효기간: ${expDate}`, contentX, 138);

  // Trust badge
  const badgeColors: Record<string, [string, string]> = {
    self: ['#dbeafe', '#1d4ed8'],
    known: ['#dcfce7', '#15803d'],
    verified: ['#f3e8ff', '#7e22ce']
  };
  const badgeLabels: Record<string, string> = {
    self: '본인 발급',
    known: '알려진',
    verified: '검증됨'
  };
  const trust = data.trustLevel ?? 'self';
  const [bgCol, fgCol] = badgeColors[trust];
  const badgeLabel = badgeLabels[trust];
  const badgeW = 56;
  const badgeH = 20;
  const badgeX = CARD_W - badgeW - 14;
  const badgeY = CARD_H - badgeH - 14;
  ctx.fillStyle = bgCol;
  roundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 10);
  ctx.fill();
  ctx.fillStyle = fgCol;
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(badgeLabel, badgeX + badgeW / 2, badgeY + 13);
  ctx.textAlign = 'left';

  // KeyID branding
  ctx.fillStyle = 'rgba(26,58,107,0.18)';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('KeyID', CARD_W - 14, CARD_H - 10);

  return canvas.toDataURL('image/png');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tlr: number,
  trr = tlr,
  brr = tlr,
  blr = tlr
) {
  ctx.beginPath();
  ctx.moveTo(x + tlr, y);
  ctx.lineTo(x + w - trr, y);
  ctx.arcTo(x + w, y, x + w, y + trr, trr);
  ctx.lineTo(x + w, y + h - brr);
  ctx.arcTo(x + w, y + h, x + w - brr, y + h, brr);
  ctx.lineTo(x + blr, y + h);
  ctx.arcTo(x, y + h, x, y + h - blr, blr);
  ctx.lineTo(x, y + tlr);
  ctx.arcTo(x, y, x + tlr, y, tlr);
  ctx.closePath();
}
