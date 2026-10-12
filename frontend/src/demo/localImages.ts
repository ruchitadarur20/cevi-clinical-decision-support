import { isDemo } from '@/lib/demoConfig';

/**
 * Sync lookup for image sources in demo mode. Seeded images are static files under /demo/images; images the
 * visitor selected live only in this browser (object URL for the session, small thumbnail after a reload).
 */
const objectUrls = new Map<string, string>();
const thumbs = new Map<string, string>();

export const registerLocalImage = (id: string, objectUrl: string | null, thumb: string | null) => {
  if (objectUrl) objectUrls.set(id, objectUrl);
  if (thumb) thumbs.set(id, thumb);
};
export const clearLocalImages = () => {
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls.clear();
  thumbs.clear();
};

export function imageSrc(id: string): string {
  if (!isDemo) return `/api/images/${id}/file`;
  return objectUrls.get(id) ?? thumbs.get(id) ?? `${import.meta.env.BASE_URL}demo/images/${id}.png`;
}
