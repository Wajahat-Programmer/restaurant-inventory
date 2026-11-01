import { Permission } from '../../domain/auth';
import { MANUAL } from './manual';
import { manualHtml } from './manualHtml';
import { BOTTOM_BAR, dimRects, placement, stepsFor, TOUR_STEPS } from './tour';

const everything = () => true;
const staffOnly = (p: Permission) => p === 'record';

describe('tour steps', () => {
  it('has unique ids and every step says something', () => {
    const ids = TOUR_STEPS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of TOUR_STEPS) {
      expect(s.title.length).toBeGreaterThan(2);
      expect(s.body.length).toBeGreaterThan(20);
      // Each step opens one place at most.
      expect(Number(!!s.tab) + Number(!!s.screen)).toBe(1);
    }
  });

  it('the owner sees every step, staff only the ones they can use', () => {
    expect(stepsFor(everything)).toHaveLength(TOUR_STEPS.length);
    const staff = stepsFor(staffOnly).map(s => s.id);
    expect(staff).not.toContain('backup');
    expect(staff).not.toContain('security');
    expect(staff).not.toContain('updates');
    expect(staff).toContain('help');
    expect(staff[0]).toBe('welcome');
  });

  it('starts at Home and ends on the manual', () => {
    expect(TOUR_STEPS[0].tab).toBe('Home');
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].screen).toBe('Help');
    expect(TOUR_STEPS.some(s => s.target === BOTTOM_BAR)).toBe(true);
  });
});

describe('dimRects', () => {
  const win = { w: 400, h: 800 };

  it('dims the whole screen when there is nothing to point at', () => {
    expect(dimRects(null, win)).toEqual([{ x: 0, y: 0, w: 400, h: 800 }]);
  });

  it('leaves a hole around the target, with a margin, and the four pieces tile the rest', () => {
    const target = { x: 100, y: 200, w: 200, h: 100 };
    const rects = dimRects(target, win, 6);
    const area = rects.reduce((a, r) => a + r.w * r.h, 0);
    expect(area).toBe(400 * 800 - 212 * 112);
    // No piece covers the target.
    for (const r of rects) {
      const overlapX = r.x < 300 && r.x + r.w > 100;
      const overlapY = r.y < 300 && r.y + r.h > 200;
      expect(overlapX && overlapY).toBe(false);
    }
  });

  it('never goes outside the screen when the target touches an edge', () => {
    const rects = dimRects({ x: 0, y: 740, w: 400, h: 60 }, win);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(400);
      expect(r.y + r.h).toBeLessThanOrEqual(800);
      expect(r.w).toBeGreaterThanOrEqual(0);
      expect(r.h).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('placement', () => {
  const win = { w: 400, h: 800 };
  it('centres with no target, below a high target and above a low one', () => {
    expect(placement(null, win)).toEqual({ anchor: 'center' });
    expect(placement({ x: 0, y: 100, w: 100, h: 50 }, win)).toEqual({ anchor: 'top', offset: 100 + 50 + 6 + 12 });
    expect(placement({ x: 0, y: 600, w: 100, h: 50 }, win)).toEqual({ anchor: 'bottom', offset: 800 - (600 - 6) + 12 });
  });
});

describe('the manual', () => {
  it('has unique chapters, each with a title, summary and content', () => {
    const ids = MANUAL.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MANUAL.length).toBeGreaterThanOrEqual(12);
    for (const c of MANUAL) {
      expect(c.title).toMatch(/^\d+\. /);
      expect(c.summary.length).toBeGreaterThan(10);
      expect(c.blocks.length).toBeGreaterThan(0);
      for (const b of c.blocks) {
        if (b.type === 'steps' || b.type === 'list') {
          expect(b.items.length).toBeGreaterThan(0);
          b.items.forEach(i => expect(i.trim().length).toBeGreaterThan(3));
        } else {
          expect(['p', 'h', 'tip', 'warn']).toContain(b.type);
          expect('text' in b && b.text.trim().length).toBeGreaterThan(3);
        }
      }
    }
  });

  it('covers every part of the app', () => {
    const all = JSON.stringify(MANUAL);
    for (const word of [
      'Stock count', 'Cash book', 'Dishes and recipes', 'Forecast and alerts', 'PIN lock', 'recovery passphrase',
      'Back up now', 'Restore', 'Google Drive', 'Check for updates', 'Share as PDF', 'Void purchase', 'Void sale',
    ]) {
      expect(all).toContain(word);
    }
  });

  it('numbers the chapters in order', () => {
    MANUAL.forEach((c, i) => expect(c.title.startsWith(`${i + 1}. `)).toBe(true));
  });
});

describe('manualHtml', () => {
  it('has a cover, a contents list and every chapter, and escapes text', () => {
    const html = manualHtml(
      [
        { id: 'a', title: '1. Fish & <chips>', summary: 'Sum "one"', blocks: [{ type: 'p', text: '5 < 6' }, { type: 'steps', items: ['one', 'two'] }, { type: 'warn', text: 'careful' }] },
        { id: 'b', title: '2. Two', summary: 'Sum two', blocks: [{ type: 'tip', text: 'nice' }, { type: 'h', text: 'Head' }, { type: 'list', items: ['x'] }] },
      ],
      { version: '1.2.3', date: '2026-10-25' },
    );
    expect(html).toContain('version 1.2.3');
    expect(html).toContain('href="#a"');
    expect(html).toContain('1. Fish &amp; &lt;chips&gt;');
    expect(html).toContain('5 &lt; 6');
    expect(html).not.toContain('<chips>');
    expect(html).toContain('<ol><li>one</li><li>two</li></ol>');
    expect(html).toContain('⚠ Important.');
    expect(html).toContain('<h3>Head</h3>');
  });

  it('renders the real manual with every chapter title', () => {
    const html = manualHtml(MANUAL, { version: '1.0.0', date: '2026-10-25' });
    for (const c of MANUAL) {
      expect(html).toContain(c.id);
    }
  });
});
