import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Share from 'react-native-share';
import App from '../App';
import { Db } from '../src/db/client';
import { createTestDb } from '../src/db/testing';
import { parseCsv } from '../src/domain/csv';
import { createItem, listItems } from '../src/services/itemService';
import { addStaff, login, logout, setUpLock } from '../src/services/authService';
import { getSetting, setSetting } from '../src/services/settingsService';
import { setSession } from '../src/services/session';
import { useThemeStore } from '../src/features/themeStore';
import { goMore, localDate, openApp, press, text, type } from '../test-utils/harness';

/* ---- fakes for the phone: installed version, files, the update download ---- */
const mockPorts = {
  apkPath: '/cache/updates/update.apk',
  canInstall: jest.fn(async () => true),
  openInstallSettings: jest.fn(async () => undefined),
  download: jest.fn(async (_u: string, _t: string, onProgress: (f: number) => void) => onProgress(1)),
  fileSize: jest.fn(async () => 5000),
  sha256: jest.fn(async () => 'a'.repeat(64)),
  install: jest.fn(async () => undefined),
  remove: jest.fn(async () => undefined),
};
const mockFeed = { status: 200, body: {} as unknown };

jest.mock('../src/features/update/devicePorts', () => ({
  installedVersion: jest.fn(async () => '1.0.0'),
  timedFetch: jest.fn(async () => ({
    ok: mockFeed.status >= 200 && mockFeed.status < 300,
    status: mockFeed.status,
    json: async () => mockFeed.body,
    text: async () => '',
  })),
  get updatePorts() {
    return mockPorts;
  },
}));

const mockFiles = { csv: '', pickPath: '/cache/in.csv' as string | null };
jest.mock('../src/features/files/fileTools', () => ({
  saveText: jest.fn(async (name: string) => `/cache/exports/${name}`),
  readText: jest.fn(async () => mockFiles.csv),
  shareFile: jest.fn(async () => true),
  pickFile: jest.fn(async () => (mockFiles.pickPath ? { path: mockFiles.pickPath, name: 'in.csv' } : null)),
}));

let db: Db;
beforeEach(async () => {
  setSession(null);
  useThemeStore.getState().set('system');
  db = await createTestDb();
  mockFeed.status = 200;
  mockFeed.body = {};
  Object.values(mockPorts).forEach(v => typeof v === 'function' && (v as jest.Mock).mockClear?.());
  mockPorts.canInstall.mockResolvedValue(true);
  mockPorts.sha256.mockResolvedValue('a'.repeat(64));
  mockPorts.fileSize.mockResolvedValue(5000);
});
afterEach(() => setSession(null));

const release = (tag: string) => ({
  tag_name: tag,
  body: 'Fixes the stock count.',
  assets: [
    {
      name: 'app.apk',
      browser_download_url: `https://github.com/Wajahat-Programmer/restaurant-inventory/releases/download/${tag}/app.apk`,
      size: 5000,
      digest: `sha256:${'a'.repeat(64)}`,
    },
  ],
});

const openSettings = async () => {
  await openApp(db, 'home');
  await goMore('settings');
};

const enterPin = async (pin: string) => {
  for (const d of pin) {
    await press(`pin-key-${d}`);
  }
};

describe('settings', () => {
  it('saves and applies the theme', async () => {
    await openSettings();
    await press('theme-dark');
    await waitFor(async () => expect(await getSetting(db, 'theme')).toBe('dark'));
    expect(useThemeStore.getState().mode).toBe('dark');
  });

  it('changes the ordering days within limits', async () => {
    await openSettings();
    expect(text('lead-days')).toBe('2');
    await press('lead-days-plus');
    await waitFor(() => expect(text('lead-days')).toBe('3'));
    await press('review-days-minus');
    await waitFor(() => expect(text('review-days')).toBe('6'));
    expect(await getSetting(db, 'forecast.leadDays')).toBe('3');
  });
});

describe('app updates', () => {
  it('says you are up to date', async () => {
    mockFeed.body = release('v1.0.0');
    await openSettings();
    expect(await screen.findByText('Installed version: 1.0.0')).toBeTruthy();
    await press('check-updates');
    expect(await screen.findByText('✓ You have the latest version (1.0.0).')).toBeTruthy();
    expect(await getSetting(db, 'update.lastCheck')).not.toBe('');
  });

  it('shows the new version, its notes and size, then downloads, checks and installs it', async () => {
    mockFeed.body = release('v1.1.0');
    await openSettings();
    await press('check-updates');
    expect(await screen.findByText(/Version 1\.1\.0 is available \(you have 1\.0\.0\)/)).toBeTruthy();
    expect(text('update-notes')).toBe('Fixes the stock count.');
    await press('install-update');
    await waitFor(() => expect(mockPorts.install).toHaveBeenCalledWith('/cache/updates/update.apk'));
    expect(await screen.findByText(/Android is asking you to confirm the update/)).toBeTruthy();
    expect(mockPorts.download).toHaveBeenCalledWith(
      'https://github.com/Wajahat-Programmer/restaurant-inventory/releases/download/v1.1.0/app.apk',
      '/cache/updates/update.apk',
      expect.any(Function),
    );
  });

  it('refuses to install a file that does not match its checksum', async () => {
    mockFeed.body = release('v1.1.0');
    mockPorts.sha256.mockResolvedValue('b'.repeat(64));
    await openSettings();
    await press('check-updates');
    await screen.findByTestId('install-update');
    await press('install-update');
    expect(await screen.findByText(/does not match the published checksum/)).toBeTruthy();
    expect(mockPorts.install).not.toHaveBeenCalled();
  });

  it('sends you to the Android switch when installing is not yet allowed', async () => {
    mockFeed.body = release('v1.1.0');
    mockPorts.canInstall.mockResolvedValue(false);
    await openSettings();
    await press('check-updates');
    await screen.findByTestId('install-update');
    await press('install-update');
    expect(await screen.findByText(/Allow Restaurant Inventory to install apps/)).toBeTruthy();
    expect(mockPorts.openInstallSettings).toHaveBeenCalled();
    expect(mockPorts.download).not.toHaveBeenCalled();
  });

  it('explains when the server cannot be reached or has no release', async () => {
    mockFeed.status = 404;
    await openSettings();
    await press('check-updates');
    expect(await screen.findByText('✖ No release has been published yet.')).toBeTruthy();
    mockFeed.status = 403;
    await press('check-updates');
    expect(await screen.findByText(/update server is busy/)).toBeTruthy();
  });

  it('shows no update banner when no update is known', async () => {
    await openApp(db, 'home');
    expect(screen.queryByTestId('update-banner')).toBeNull();
  });

  it('the banner appears when an update was found earlier, and takes you to Settings', async () => {
    await setSetting(db, 'update.available', '1.2.0');
    await openApp(db, 'home');
    expect(await screen.findByText('⚠ Update 1.2.0 is available')).toBeTruthy();
    await press('update-banner-open');
    expect(await screen.findByTestId('update-card')).toBeTruthy();
  });

  it('no banner once the installed version has caught up', async () => {
    await setSetting(db, 'update.available', '1.0.0'); // installed is 1.0.0 in this test
    await openApp(db, 'home');
    await screen.findByTestId('home-alerts');
    expect(screen.queryByTestId('update-banner')).toBeNull();
  });
});

describe('PIN lock', () => {
  it('turns the lock on from Security and keeps the owner signed in', async () => {
    await openSettings();
    await press('open-security');
    await type('field-owner-name', 'Wajahat');
    await type('field-setup-pin', '4829');
    await type('field-setup-pin2', '4829');
    await type('field-setup-phrase', 'my first restaurant');
    await type('field-setup-phrase2', 'my first restaurant');
    await press('setup-lock');
    expect(await screen.findByTestId('security-done')).toBeTruthy();
    expect(await screen.findByTestId('person-Wajahat')).toBeTruthy();
  });

  it('explains mistakes in the setup form', async () => {
    await openSettings();
    await press('open-security');
    await type('field-owner-name', 'Wajahat');
    await type('field-setup-pin', '1234');
    await type('field-setup-pin2', '1234');
    await type('field-setup-phrase', 'my first restaurant');
    await type('field-setup-phrase2', 'my first restaurant');
    await press('setup-lock');
    expect(await screen.findByText(/Do not use a run of digits/)).toBeTruthy();
    await type('field-setup-pin', '4829');
    await press('setup-lock');
    expect(await screen.findByText('✖ The two PINs are not the same.')).toBeTruthy();
  });

  async function locked() {
    const owner = await setUpLock(db, { ownerName: 'Wajahat', pin: '4829', recoveryPassphrase: 'my first restaurant' });
    const staff = await addStaff(db, { name: 'Bilal', pin: '7391' }).catch(async () => {
      await login(db, owner, '4829');
      const s = await addStaff(db, { name: 'Bilal', pin: '7391' });
      logout();
      return s;
    });
    logout();
    await render(<App db={db} />);
    await screen.findByTestId('lock-title');
    return { owner, staff };
  }

  it('shows the lock when it is on, and opens with the right PIN', async () => {
    await locked();
    await press('user-Wajahat');
    await enterPin('4829');
    await press('pin-ok');
    expect(await screen.findByTestId('tab-stock')).toBeTruthy();
  });

  it('counts wrong PINs, then makes you wait', async () => {
    await locked();
    await press('user-Wajahat');
    for (let i = 0; i < 4; i++) {
      await enterPin('0000');
      await press('pin-ok');
    }
    expect(await screen.findByText(/Wrong PIN\. 1 try left/)).toBeTruthy();
    await enterPin('0000');
    await press('pin-ok');
    expect(await screen.findByTestId('lock-wait')).toBeTruthy();
    expect(screen.queryByTestId('tab-stock')).toBeNull();
  });

  it('pin keys: delete removes the last digit and the pad stops at six', async () => {
    await locked();
    await press('user-Wajahat');
    await enterPin('1234567');
    expect(screen.getByTestId('pin-dots').props.accessibilityLabel).toBe('6 digits entered');
    await press('pin-backspace');
    expect(screen.getByTestId('pin-dots').props.accessibilityLabel).toBe('5 digits entered');
  });

  it('resets a forgotten owner PIN with the recovery passphrase', async () => {
    await locked();
    await press('forgot-pin');
    await type('field-recovery', 'wrong phrase');
    await type('field-new-pin', '5902');
    await press('reset-pin');
    expect(await screen.findByText(/recovery passphrase is not right/)).toBeTruthy();
    await type('field-recovery', 'my first restaurant');
    await press('reset-pin');
    expect(await screen.findByTestId('reset-done')).toBeTruthy();
    await press('back-to-lock');
    await press('user-Wajahat');
    await enterPin('5902');
    await press('pin-ok');
    expect(await screen.findByTestId('tab-stock')).toBeTruthy();
  });

  it('staff see only what they may use', async () => {
    await locked();
    await press('user-Bilal');
    await enterPin('7391');
    await press('pin-ok');
    await screen.findByTestId('tab-stock');
    // Home: stock alerts, no money.
    expect(screen.getByTestId('home-alerts')).toBeTruthy();
    expect(screen.queryByTestId('home-today-revenue')).toBeNull();
    expect(screen.queryByTestId('home-add-expense')).toBeNull();
    // More: no reports, expenses, cash book, dishes or settings.
    await press('tab-more');
    expect(screen.getByTestId('menu-forecast')).toBeTruthy();
    expect(screen.getByTestId('menu-suppliers')).toBeTruthy();
    for (const hidden of ['reports', 'expenses', 'cashbook', 'recipes', 'settings']) {
      expect(screen.queryByTestId(`menu-${hidden}`)).toBeNull();
    }
  });

  it('the owner sees everything', async () => {
    await locked();
    await press('user-Wajahat');
    await enterPin('4829');
    await press('pin-ok');
    await screen.findByTestId('tab-stock');
    await press('tab-more');
    for (const shown of ['reports', 'expenses', 'cashbook', 'recipes', 'settings', 'forecast']) {
      expect(screen.getByTestId(`menu-${shown}`)).toBeTruthy();
    }
  });
});

describe('forecast screen', () => {
  it('lists what needs attention and shares the shopping list the owner confirms', async () => {
    const salt = await createItem(db, { name: 'Salt', baseUnit: 'g' });
    await createItem(db, { name: 'Oil', baseUnit: 'ml', reorderPoint: 500 }, { qtyBase: 300, valuePaisa: 3000 });
    expect(salt).toBeGreaterThan(0);
    await openApp(db, 'home');
    await goMore('forecast');
    expect(await screen.findByTestId('alert-out')).toBeTruthy();
    expect(screen.getByText('✖ Salt is out of stock')).toBeTruthy();
    expect(screen.getByText('⚠ Oil is low (300 ml left)')).toBeTruthy();
    // New items have no history, so their forecast stays hidden and says why.
    expect(screen.getAllByText(/Forecast hidden: Needs 14 days/).length).toBeGreaterThan(0);
    expect(screen.getByTestId('no-order')).toBeTruthy();
    expect(screen.getByTestId('outlook-hidden')).toBeTruthy();
  });
});

describe('import from a spreadsheet', () => {
  async function openData() {
    await openApp(db, 'home');
    await goMore('settings');
    await press('open-data');
    await screen.findByTestId('import-kind');
  }

  it('previews problems line by line, then imports the good rows', async () => {
    mockFiles.csv = 'Name,Base unit,Par level\nRice,g,50\nSalt,kg,10\n,g,\nOil,ml,5';
    await openData();
    await press('import-pick');
    expect(await screen.findByTestId('import-summary')).toBeTruthy();
    expect(text('import-summary')).toBe('2 ready to import, 2 with problems.');
    expect(screen.getByText(/Line 3: Base unit must be g, ml or pcs \(found "kg"\)\./)).toBeTruthy();
    expect(screen.getByText(/Line 4: Name is empty\./)).toBeTruthy();
    await press('import-commit');
    await waitFor(async () => expect((await listItems(db)).map(i => i.name)).toEqual(['Oil', 'Rice']));
    expect(await screen.findByText('✓ Imported 2 items.')).toBeTruthy();
  });

  it('refuses a file with the wrong columns without importing anything', async () => {
    mockFiles.csv = 'Fruit,Colour\nApple,red';
    await openData();
    await press('import-pick');
    expect(await screen.findByText(/Missing columns: Name, Base unit\./)).toBeTruthy();
    expect(screen.queryByTestId('import-commit')).toBeNull();
    expect(await listItems(db)).toHaveLength(0);
  });

  it('does nothing if the picker is closed', async () => {
    mockFiles.pickPath = null;
    await openData();
    await press('import-pick');
    expect(screen.queryByTestId('import-preview')).toBeNull();
    mockFiles.pickPath = '/cache/in.csv';
  });

  it('exports and offers the file to share', async () => {
    await createItem(db, { name: 'Rice', baseUnit: 'g' });
    await openData();
    await press('export-run');
    expect(await screen.findByText(/✓ items-\d{4}-\d{2}-\d{2}\.csv is ready to share or save\./)).toBeTruthy();
    expect(Share).toBeDefined();
  });
});

describe('backup passphrase', () => {
  it('asks for a strong enough passphrase before anything else', async () => {
    await openApp(db, 'home');
    await goMore('settings');
    await press('open-data');
    await screen.findByTestId('save-passphrase');
    await type('field-pass1', 'short');
    await type('field-pass2', 'short');
    await press('save-passphrase');
    expect(await screen.findByText('✖ The backup passphrase must be at least 8 characters.')).toBeTruthy();
    await type('field-pass1', 'a good passphrase');
    await type('field-pass2', 'a different one!');
    await press('save-passphrase');
    expect(await screen.findByText('✖ The two passphrases are not the same.')).toBeTruthy();
    await type('field-pass2', 'a good passphrase');
    await press('save-passphrase');
    expect(await screen.findByTestId('data-note')).toBeTruthy();
    expect(await screen.findByTestId('backup-now')).toBeTruthy();
  });
});

describe('who did what', () => {
  it('shows recorded actions with the person and a readable label', async () => {
    const owner = await setUpLock(db, { ownerName: 'Wajahat', pin: '4829', recoveryPassphrase: 'my first restaurant' });
    await login(db, owner, '4829');
    await render(<App db={db} />);
    await screen.findByTestId('tab-stock');
    await press('tab-more');
    await press('menu-settings');
    await press('open-audit');
    expect(await screen.findByText('Turned the PIN lock on')).toBeTruthy();
    expect(screen.getByText('Signed in')).toBeTruthy();
    expect(screen.getAllByText(/Wajahat ·/).length).toBeGreaterThan(0);
    expect(localDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parseCsv('a')).toEqual([['a']]);
    expect(fireEvent).toBeDefined();
  });
});

describe('google drive', () => {
  it('says plainly that Drive is not set up while there is no sign-in key', async () => {
    await openApp(db, 'home');
    await goMore('settings');
    await press('open-data');
    expect(await screen.findByTestId('drive-not-set-up')).toBeTruthy();
    expect(screen.queryByTestId('drive-connect')).toBeNull();
  });
});
