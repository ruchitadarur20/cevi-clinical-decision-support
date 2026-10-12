import { createHash, randomUUID } from 'node:crypto';
import { imageSize } from 'image-size';
import { AppError } from './errors';

export const IMAGE_LIMITS = { minDim: 32, maxDim: 8192, maxPixels: 40_000_000 } as const;

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface ValidatedImage {
  mimeType: 'image/png' | 'image/jpeg';
  extension: 'png' | 'jpg';
  width: number;
  height: number;
  sha256: string;
  storageKey: string;
}

/** Walks PNG chunks and requires a terminating IEND chunk (detects truncated / spliced files). */
function pngIsComplete(buf: Buffer): boolean {
  let off = 8;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const next = off + 12 + len;
    if (next > buf.length) return false;
    if (type === 'IEND') return true;
    off = next;
  }
  return false;
}

/** A JPEG must end with the End-Of-Image marker (trailing zero padding tolerated). */
function jpegIsComplete(buf: Buffer): boolean {
  let end = buf.length;
  while (end > 2 && buf[end - 1] === 0) end--;
  return buf[end - 2] === 0xff && buf[end - 1] === 0xd9;
}

/**
 * Never trusts the client-declared Content-Type or file extension: the file
 * signature (magic bytes) decides the type, then the header is parsed for dimensions.
 */
export function validateImage(buf: Buffer): ValidatedImage {
  if (buf.length < 16) throw new AppError(422, 'INVALID_IMAGE', 'File is empty or too small to be an image');

  let mimeType: ValidatedImage['mimeType'];
  let extension: ValidatedImage['extension'];
  if (buf.subarray(0, 8).equals(PNG_SIG)) {
    mimeType = 'image/png';
    extension = 'png';
  } else if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    mimeType = 'image/jpeg';
    extension = 'jpg';
  } else {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG and PNG images are accepted (file signature check failed)');
  }

  const complete = extension === 'png' ? pngIsComplete(buf) : jpegIsComplete(buf);
  if (!complete) throw new AppError(422, 'INVALID_IMAGE', 'Image file is truncated or corrupt');

  let width: number | undefined;
  let height: number | undefined;
  try {
    const dim = imageSize(buf);
    width = dim.width;
    height = dim.height;
  } catch {
    throw new AppError(422, 'INVALID_IMAGE', 'Image header could not be parsed - the file may be corrupt');
  }
  if (!width || !height) throw new AppError(422, 'INVALID_IMAGE', 'Image dimensions could not be determined');

  const { minDim, maxDim, maxPixels } = IMAGE_LIMITS;
  if (width < minDim || height < minDim)
    throw new AppError(422, 'IMAGE_TOO_SMALL', `Image must be at least ${minDim}x${minDim} pixels`);
  if (width > maxDim || height > maxDim || width * height > maxPixels)
    throw new AppError(422, 'IMAGE_TOO_LARGE', `Image dimensions exceed the ${maxDim}px / ${maxPixels / 1e6}MP limit`);

  const sha256 = createHash('sha256').update(buf).digest('hex');
  return { mimeType, extension, width, height, sha256, storageKey: `${randomUUID()}.${extension}` };
}

/** Strip path separators / control chars from a client-supplied filename. */
export function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  const base = name.replace(/[\\/]+/g, '_').replace(/[\u0000-\u001f<>:"|?*]/g, '').trim();
  return (base || 'upload').slice(0, 200);
}
