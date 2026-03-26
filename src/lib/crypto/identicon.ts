/**
 * Generates a deterministic identicon SVG data URL from a seed string.
 * 5×5 symmetric pixel grid, FNV-1a hash, HSL color.
 */
export function generateIdenticon(seed: string, size = 80): string {
  // FNV-1a 32-bit
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }

  const hue = h % 360;
  const fg = `hsl(${hue},60%,62%)`;
  const bg = `hsl(${hue},20%,18%)`;

  // 5×5 left-right symmetric (3 unique columns)
  const cells: boolean[][] = [];
  let r = h;
  for (let y = 0; y < 5; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < 3; x++) {
      r = (r ^ (x * 7 + y * 13)) >>> 0;
      r = Math.imul(r, 2246822519) >>> 0;
      r ^= r >>> 13;
      row.push((r & 1) === 1);
    }
    cells.push([row[0], row[1], row[2], row[1], row[0]]);
  }

  const pad = size * 0.1;
  const cell = (size - pad * 2) / 5;
  let rects = '';
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      if (cells[y][x]) {
        const cx = (pad + x * cell + 1).toFixed(1);
        const cy = (pad + y * cell + 1).toFixed(1);
        const sz = (cell - 2).toFixed(1);
        rects += `<rect x="${cx}" y="${cy}" width="${sz}" height="${sz}" rx="2" fill="${fg}"/>`;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${bg}"/>${rects}</svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}
