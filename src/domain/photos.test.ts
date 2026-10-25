import { fitLongEdge, photoPaths, uprightSize } from './photos';

describe('photos', () => {
  it('fits the long edge without distorting or upscaling', () => {
    expect(fitLongEdge({ width: 4000, height: 3000 }, 1024)).toEqual({ width: 1024, height: 768 });
    expect(fitLongEdge({ width: 3000, height: 4000 }, 1024)).toEqual({ width: 768, height: 1024 });
    expect(fitLongEdge({ width: 800, height: 600 }, 1024)).toEqual({ width: 800, height: 600 });
    expect(fitLongEdge({ width: 5000, height: 1 }, 1024)).toEqual({ width: 1024, height: 1 });
  });

  it('rejects a photo with no size', () => {
    expect(() => fitLongEdge({ width: 0, height: 10 }, 1024)).toThrow('no size');
  });

  it('swaps dimensions for sideways EXIF orientations', () => {
    const s = { width: 4000, height: 3000 };
    expect(uprightSize(s, 1)).toEqual(s);
    expect(uprightSize(s, 6)).toEqual({ width: 3000, height: 4000 });
    expect(uprightSize(s, 8)).toEqual({ width: 3000, height: 4000 });
    expect(uprightSize(s, 3)).toEqual(s);
  });

  it('builds predictable file names', () => {
    expect(photoPaths('/docs/photos', 7, 123)).toEqual({
      original: '/docs/photos/item-7-123.jpg',
      cutout: '/docs/photos/item-7-123-cutout.png',
      thumb: '/docs/photos/item-7-123-thumb.webp',
    });
  });
});
