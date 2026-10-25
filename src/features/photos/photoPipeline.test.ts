import { PhotoPorts, processPhoto } from './photoPipeline';

/** In-memory device: a set of files plus a call log. */
function fakeDevice(over: Partial<PhotoPorts> = {}) {
  const files = new Set<string>(['/cache/raw.jpg']);
  const calls: string[] = [];
  const ports: PhotoPorts = {
    photosDir: '/docs/photos',
    now: () => 111,
    mkdir: async dir => {
      calls.push(`mkdir ${dir}`);
    },
    remove: async p => {
      files.delete(p);
      calls.push(`remove ${p}`);
    },
    move: async (from, to) => {
      if (!files.has(from)) {
        throw new Error(`missing ${from}`);
      }
      files.delete(from);
      files.add(to);
      calls.push(`move ${to}`);
    },
    resize: async (src, edge, format) => {
      calls.push(`resize ${src} ${edge} ${format}`);
      const out = `/cache/tmp-${edge}.${format.toLowerCase()}`;
      files.add(out);
      return { path: out, width: edge === 1024 ? 768 : 192, height: edge === 1024 ? 1024 : 256 };
    },
    segment: async (_in, out) => {
      calls.push('segment');
      files.add(out);
    },
    ...over,
  };
  return { ports, files, calls };
}

describe('processPhoto', () => {
  it('makes original, cutout and a thumbnail of the cutout, then removes the raw file', async () => {
    const { ports, files } = fakeDevice();
    const r = await processPhoto(ports, 7, '/cache/raw.jpg');
    expect(r).toEqual({
      originalPath: '/docs/photos/item-7-111.jpg',
      cutoutPath: '/docs/photos/item-7-111-cutout.png',
      thumbPath: '/docs/photos/item-7-111-thumb.webp',
      width: 768,
      height: 1024,
      usedFallback: false,
    });
    // Only the three stored files remain: the raw camera file and the
    // resizer's temp files are gone.
    expect([...files].sort()).toEqual(
      [r.originalPath, r.cutoutPath, r.thumbPath].sort(),
    );
  });

  it('resizes the original at 1024 and makes the thumbnail from the cutout at 256', async () => {
    const { ports, calls } = fakeDevice();
    await processPhoto(ports, 7, '/cache/raw.jpg');
    expect(calls).toContain('resize /cache/raw.jpg 1024 JPEG');
    expect(calls).toContain('resize /docs/photos/item-7-111-cutout.png 256 WEBP');
  });

  it('falls back to the plain photo when segmentation fails, leaving no cutout file', async () => {
    const { ports, files } = fakeDevice({
      segment: async () => {
        throw new Error('model unavailable');
      },
    });
    const r = await processPhoto(ports, 7, '/cache/raw.jpg');
    expect(r.cutoutPath).toBeNull();
    expect(r.usedFallback).toBe(true);
    expect(files.has('/docs/photos/item-7-111-cutout.png')).toBe(false);
    expect(files.has(r.thumbPath)).toBe(true);
  });

  it('falls back when the module is not on this build', async () => {
    const { ports, calls } = fakeDevice({ segment: null });
    const r = await processPhoto(ports, 7, '/cache/raw.jpg');
    expect(r.cutoutPath).toBeNull();
    expect(calls).toContain('resize /docs/photos/item-7-111.jpg 256 WEBP');
  });

  it('cleans up everything it made when a required step fails', async () => {
    let n = 0;
    const { ports, files } = fakeDevice();
    const base = ports.resize;
    ports.resize = async (...a) => {
      if (++n === 2) {
        throw new Error('thumbnail failed');
      }
      return base(...a);
    };
    await expect(processPhoto(ports, 7, '/cache/raw.jpg')).rejects.toThrow('thumbnail failed');
    expect([...files].filter(f => f.startsWith('/docs/photos'))).toEqual([]);
  });

  it('a failure before anything is stored leaves no stored files', async () => {
    const { ports, files } = fakeDevice({
      resize: async () => {
        throw new Error('corrupt image');
      },
    });
    await expect(processPhoto(ports, 7, '/cache/raw.jpg')).rejects.toThrow('corrupt image');
    expect([...files].filter(f => f.startsWith('/docs/photos'))).toEqual([]);
  });
});
