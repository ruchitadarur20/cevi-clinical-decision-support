import type { PreprocessPreview } from '@/lib/types';

/** Everything here runs in the visitor's browser; the file never leaves the page. */

export interface InspectedImage {
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  sha256: string;
  thumb: string;
  preprocess: PreprocessPreview;
}

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export class ImageRejected extends Error {
  constructor(public field: string, message: string) { super(message); }
}

/** Signature check, mirroring the API's magic-byte validation (extension and declared MIME are not trusted). */
async function sniff(file: File): Promise<'image/png' | 'image/jpeg'> {
  const b = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v);
  if (png) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  throw new ImageRejected('file', 'File content is not a PNG or JPEG image (signature check failed)');
}

async function sha256(file: File): Promise<string> {
  try {
    const d = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
  } catch {
    return 'unavailable-in-this-context'.padEnd(64, '0');
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new ImageRejected('file', 'Canvas is not available in this browser');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { c, ctx };
}

export async function inspectImage(file: File): Promise<InspectedImage> {
  const mimeType = await sniff(file);
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); } catch { throw new ImageRejected('file', 'The image could not be decoded (file may be truncated or corrupt)'); }
  const { width, height } = bmp;
  if (width < 32 || height < 32) { bmp.close(); throw new ImageRejected('file', `Image is too small (${width}×${height}). Minimum is 32×32 px`); }
  if (width > 8192 || height > 8192 || width * height > 40_000_000) { bmp.close(); throw new ImageRejected('file', 'Image dimensions exceed the supported maximum'); }

  // Thumbnail (kept after reload) — the original bytes are never persisted.
  const t = Math.min(1, 256 / Math.max(width, height));
  const th = canvas(Math.max(1, Math.round(width * t)), Math.max(1, Math.round(height * t)));
  th.ctx.fillStyle = '#fff';
  th.ctx.fillRect(0, 0, th.c.width, th.c.height);
  th.ctx.drawImage(bmp, 0, 0, th.c.width, th.c.height);
  const thumb = th.c.toDataURL('image/jpeg', 0.8);

  // EfficientNet-B0 preprocessing, same recipe as the ML service: RGB (alpha on white) → resize shorter side
  // to 256 → centre-crop 224 → /255 → ImageNet mean/std. Resampling uses the browser's canvas filter, which is
  // an approximation of the service's PIL bicubic resize, so statistics differ slightly.
  const s = 256 / Math.min(width, height);
  const rw = Math.max(256, Math.round(width * s));
  const rh = Math.max(256, Math.round(height * s));
  const rs = canvas(rw, rh);
  rs.ctx.fillStyle = '#fff';
  rs.ctx.fillRect(0, 0, rw, rh);
  rs.ctx.drawImage(bmp, 0, 0, rw, rh);
  bmp.close();
  const x0 = Math.floor((rw - 224) / 2);
  const y0 = Math.floor((rh - 224) / 2);
  const px = rs.ctx.getImageData(x0, y0, 224, 224).data;
  let min = Infinity, max = -Infinity, sum = 0, sumSq = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) {
    for (let ch = 0; ch < 3; ch++) {
      const v = (px[i + ch] / 255 - MEAN[ch]) / STD[ch];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v; sumSq += v * v; n++;
    }
  }
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  const r = (x: number) => Math.round(x * 1e4) / 1e4;

  const preprocess: PreprocessPreview = {
    preprocessing: {
      input: { width, height, format: mimeType === 'image/png' ? 'PNG' : 'JPEG', original_mode: 'browser-decoded' },
      color_mode: 'RGB',
      resize: { shorter_side: 256, interpolation: 'canvas (browser approximation of bicubic)' },
      center_crop: [224, 224],
      scale: 'uint8 -> float32 / 255',
      normalize: { mean: MEAN, std: STD },
      layout: 'NCHW',
      dtype: 'float32',
      output_shape: [1, 3, 224, 224],
    },
    tensor: { shape: [1, 3, 224, 224], dtype: 'float32', min: r(min), max: r(max), mean: r(mean), std: r(std) },
    timing: { preprocess_ms: 0 },
  };
  return { mimeType, width, height, sha256: await sha256(file), thumb, preprocess };
}
