/**
 * Camera QR code scanner using jsQR.
 * Returns decoded text from video frames.
 */

import jsQR, { type QRCode } from 'jsqr';

export interface ScanResult {
  text: string;
  /** Bounding box corners in image coordinates */
  location: QRCode['location'];
}

export class QRScanner {
  private stream: MediaStream | null = null;
  private animationId: number | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  /** Start camera and begin scanning. Calls onResult for each unique decode. */
  async start(
    videoElement: HTMLVideoElement,
    onResult: (result: ScanResult) => void,
    onError?: (err: Error) => void
  ): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      videoElement.srcObject = this.stream;
      await videoElement.play();

      const scan = () => {
        if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
          this.canvas.width = videoElement.videoWidth;
          this.canvas.height = videoElement.videoHeight;
          this.ctx.drawImage(videoElement, 0, 0);
          const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert'
          });
          if (code) {
            onResult({ text: code.data, location: code.location });
          }
        }
        this.animationId = requestAnimationFrame(scan);
      };

      this.animationId = requestAnimationFrame(scan);
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /** Stop camera stream and scanning loop. */
  stop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  get isActive(): boolean {
    return this.stream !== null;
  }
}

/**
 * One-shot: scan a single frame from an image file or data URL.
 */
export async function scanImageFile(file: File): Promise<ScanResult | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      URL.revokeObjectURL(url);
      if (code) {
        resolve({ text: code.data, location: code.location });
      } else {
        resolve(null);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
