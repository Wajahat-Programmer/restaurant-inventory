import { screen, waitFor, within } from '@testing-library/react-native';
import { generatePDF } from 'react-native-html-to-pdf';
import { Db } from '../src/db/client';
import { createTestDb } from '../src/db/testing';
import { MANUAL } from '../src/features/guide/manual';
import { TOUR_STEPS } from '../src/features/guide/tour';
import { getSetting } from '../src/services/settingsService';
import { setSession } from '../src/services/session';
import { goMore, openApp, press, text } from '../test-utils/harness';

jest.mock('../src/features/update/devicePorts', () => ({
  installedVersion: jest.fn(async () => '1.0.0'),
  timedFetch: jest.fn(async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '' })),
  updatePorts: {},
}));

let db: Db;
beforeEach(async () => {
  setSession(null);
  db = await createTestDb();
});
afterEach(() => setSession(null));

describe('the guided tour', () => {
  it('offers itself on first launch, and "Not now" hides it for good', async () => {
    await openApp(db, 'home');
    expect(await screen.findByTestId('guide-offer')).toBeTruthy();
    await press('guide-dismiss');
    await waitFor(() => expect(screen.queryByTestId('guide-offer')).toBeNull());
    expect(await getSetting(db, 'guide.seen')).toBe('1');
  });

  it('walks every step in order with Next, and finishing marks it as seen', async () => {
    await openApp(db, 'home');
    await press('guide-start');
    expect(await screen.findByTestId('tour-overlay')).toBeTruthy();
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      await waitFor(() => expect(text('tour-title')).toBe(TOUR_STEPS[i].title));
      expect(text('tour-progress')).toBe(`Step ${i + 1} of ${TOUR_STEPS.length}`);
      expect(text('tour-body')).toBe(TOUR_STEPS[i].body);
      if (i === 0) {
        expect(screen.queryByTestId('tour-back')).toBeNull();
      }
      expect(within(screen.getByTestId('tour-overlay')).getByText(i === TOUR_STEPS.length - 1 ? 'Done' : 'Next')).toBeTruthy();
      await press('tour-next');
    }
    await waitFor(() => expect(screen.queryByTestId('tour-overlay')).toBeNull());
    expect(await getSetting(db, 'guide.seen')).toBe('1');
    // Back on Home, and the offer is gone.
    expect(await screen.findByTestId('home-alerts')).toBeTruthy();
    expect(screen.queryByTestId('guide-offer')).toBeNull();
  });

  it('Back returns to the previous step', async () => {
    await openApp(db, 'home');
    await press('guide-start');
    await screen.findByTestId('tour-overlay');
    await press('tour-next');
    await press('tour-next');
    await waitFor(() => expect(text('tour-title')).toBe(TOUR_STEPS[2].title));
    await press('tour-back');
    await waitFor(() => expect(text('tour-title')).toBe(TOUR_STEPS[1].title));
  });

  it('Skip closes it at once and does not offer it again', async () => {
    await openApp(db, 'home');
    await press('guide-start');
    await screen.findByTestId('tour-overlay');
    await press('tour-skip');
    await waitFor(() => expect(screen.queryByTestId('tour-overlay')).toBeNull());
    expect(await getSetting(db, 'guide.seen')).toBe('1');
  });

  it('can be started again from Help and manual', async () => {
    await openApp(db, 'home');
    await goMore('help');
    await press('help-tour');
    expect(await screen.findByTestId('tour-overlay')).toBeTruthy();
    expect(text('tour-title')).toBe(TOUR_STEPS[0].title);
  });
});

describe('help and manual', () => {
  it('lists every chapter, and a chapter opens and closes', async () => {
    await openApp(db, 'home');
    await goMore('help');
    for (const c of MANUAL) {
      expect(await screen.findByTestId(`chapter-${c.id}`)).toBeTruthy();
    }
    expect(screen.queryByText(/Write the backup passphrase down/)).toBeNull();
    await press('chapter-toggle-backup');
    expect(await screen.findByText(/Write the backup passphrase down/)).toBeTruthy();
    await press('chapter-toggle-backup');
    await waitFor(() => expect(screen.queryByText(/Write the backup passphrase down/)).toBeNull());
  });

  it('opening one chapter closes the one before', async () => {
    await openApp(db, 'home');
    await goMore('help');
    await press('chapter-toggle-items');
    expect(await screen.findByText(/Add an item/)).toBeTruthy();
    await press('chapter-toggle-photos');
    await waitFor(() => expect(screen.queryByText(/Add an item/)).toBeNull());
  });

  it('shares the whole manual as a PDF and says so, or says what went wrong', async () => {
    await openApp(db, 'home');
    await goMore('help');
    (generatePDF as jest.Mock).mockClear();
    await press('help-pdf');
    await waitFor(() => expect(text('help-note')).toContain('PDF is ready'));
    const arg = (generatePDF as jest.Mock).mock.calls[0][0];
    expect(arg.fileName).toBe('Restaurant-Inventory-Manual');
    for (const c of MANUAL) {
      expect(arg.html).toContain(c.id);
    }
    expect(arg.html).toContain('version 1.0.0');

    (generatePDF as jest.Mock).mockRejectedValueOnce(new Error('no space left'));
    await press('help-pdf');
    expect(await screen.findByText(/no space left/)).toBeTruthy();
  });

  it('staff can open Help too', async () => {
    setSession({ id: 2, name: 'Bilal', role: 'staff' });
    await openApp(db, 'home');
    await goMore('help');
    expect(await screen.findByTestId('chapter-start')).toBeTruthy();
  });
});
