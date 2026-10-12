import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

// jsdom lacks these browser APIs used by Radix / Recharts.
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver ?? RO;
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as any;
}
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
(Element.prototype as any).hasPointerCapture = (Element.prototype as any).hasPointerCapture ?? (() => false);
