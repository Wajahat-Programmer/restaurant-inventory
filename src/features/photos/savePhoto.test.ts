import { createTestDb } from '../../db/testing';
import { createItem } from '../../services/itemService';
import { listPhotos } from '../../services/photoService';
import { PhotoPorts } from './photoPipeline';
import { retryCutout, savePhoto } from './savePhoto';

function device() {
  const files = new Set<string>(['/cache/raw.jpg']);
  const ports: PhotoPorts = {
    photosDir: '/docs/photos',
    now: () => 5,
    mkdir: async () => undefined,
    remove: async p => {
      files.delete(p);
    },
    move: async (from, to) => {
      files.delete(from);
      files.add(to);
    },
    resize: async (_s, edge) => {
      const p = `/cache/t${edge}`;
      files.add(p);
      return { path: p, width: 600, height: 800 };
    },
    segment: async (_i, o) => {
      files.add(o);
    },
  };
  return { ports, files };
}

describe('savePhoto', () => {
  it('stores the files and records them; the first photo is primary', async () => {
    const db = await createTestDb();
    const id = await createItem(db, { name: 'Rice', baseUnit: 'g' });
    const { ports, files } = device();
    await savePhoto(db, ports, id, '/cache/raw.jpg');
    const [p] = await listPhotos(db, id);
    expect(p).toMatchObject({ itemId: id, isPrimary: true, width: 600, height: 800 });
    expect(files.has(p.originalPath) && files.has(p.thumbPath) && files.has(p.cutoutPath!)).toBe(true);
  });

  it('deletes the stored files if the database write fails', async () => {
    const db = await createTestDb();
    const { ports, files } = device();
    await expect(savePhoto(db, ports, 999, '/cache/raw.jpg')).rejects.toThrow('Item not found');
    expect([...files].filter(f => f.startsWith('/docs/photos'))).toEqual([]);
  });
});

describe('retryCutout', () => {
  async function saved(segmentOk: boolean) {
    const db = await createTestDb();
    const id = await createItem(db, { name: 'Rice', baseUnit: 'g' });
    const d = device();
    let ok = segmentOk;
    d.ports.segment = async (_i, o) => {
      if (!ok) {
        throw new Error('Waiting for the subject segmentation optional module to be downloaded.');
      }
      d.files.add(o);
    };
    await savePhoto(db, d.ports, id, '/cache/raw.jpg');
    return { db, id, d, ready: () => { ok = true; } };
  }

  it('adds the cutout and swaps the thumbnail once the model is ready', async () => {
    const { db, id, d, ready } = await saved(false);
    const [before] = await listPhotos(db, id);
    expect(before.cutoutPath).toBeNull();
    ready();
    await retryCutout(db, d.ports, before);
    const [after] = await listPhotos(db, id);
    expect(after.cutoutPath).toMatch(/-cutout\.png$/);
    expect(after.thumbPath).not.toBe(before.thumbPath);
    expect(d.files.has(after.cutoutPath!)).toBe(true);
    expect(d.files.has(after.thumbPath)).toBe(true);
    expect(d.files.has(before.thumbPath)).toBe(false); // old thumbnail removed
    await expect(retryCutout(db, d.ports, after)).rejects.toThrow('already has a cutout');
  });

  it('reports the reason and leaves everything as it was while the model is not ready', async () => {
    const { db, id, d } = await saved(false);
    const [before] = await listPhotos(db, id);
    const filesBefore = [...d.files].sort();
    await expect(retryCutout(db, d.ports, before)).rejects.toThrow('optional module');
    expect([...d.files].sort()).toEqual(filesBefore);
    expect((await listPhotos(db, id))[0]).toEqual(before);
  });
});
