import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Db } from '../src/db/client';
import { createTestDb } from '../src/db/testing';
import { createItem, findItemByBarcode, getItem } from '../src/services/itemService';
import { setSession } from '../src/services/session';
import { openApp, press, text, type } from '../test-utils/harness';

jest.mock('../src/features/update/devicePorts', () => ({
  installedVersion: jest.fn(async () => '1.0.0'),
  timedFetch: jest.fn(async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '' })),
  updatePorts: {},
}));

const camera = () => (globalThis as unknown as { __camera: { permission: boolean; device: unknown; grantOnRequest?: boolean; scanner: { onCodeScanned: (c: { type: string; value: string }[]) => void } | null } }).__camera;
const read = async (value: string) => act(async () => camera().scanner!.onCodeScanned([{ type: 'ean-13', value }]));

const openScan = async () => fireEvent.press(screen.getByLabelText('Scan a barcode'));

let db: Db;
beforeEach(async () => {
  setSession(null);
  db = await createTestDb();
  camera().permission = true;
  camera().device = { id: 'back' };
});

describe('finding items by barcode', () => {
  it('matches either spelling of a UPC or EAN, ignores spaces and dashes, and knows nothing else', async () => {
    const id = await createItem(db, { name: 'Ketchup', baseUnit: 'g', barcode: '036000-291452' });
    expect((await getItem(db, id)).barcode).toBe('036000291452'); // stored tidy
    expect(await findItemByBarcode(db, '0036000291452')).toMatchObject({ id, name: 'Ketchup' });
    expect(await findItemByBarcode(db, ' 036000291452 ')).toMatchObject({ id });
    expect(await findItemByBarcode(db, '036000291453')).toBeNull();
    expect(await findItemByBarcode(db, 'ab')).toBeNull();
  });
});

describe('the scan screen', () => {
  it('opens the item whose barcode is read', async () => {
    await createItem(db, { name: 'Ketchup', baseUnit: 'g', barcode: '8964000123456' });
    await openApp(db, 'stock');
    await press('tab-stock');
    await openScan();
    expect(await screen.findByTestId('scan-guide')).toBeTruthy();
    await read('8964000123456');
    expect(await screen.findByTestId('detail-name')).toBeTruthy();
    expect(text('detail-name')).toBe('Ketchup');
  });

  it('reads a code only once even though the camera reports it many times', async () => {
    await createItem(db, { name: 'Ketchup', baseUnit: 'g', barcode: '8964000123456' });
    await openApp(db, 'stock');
    await openScan();
    await screen.findByTestId('scan-guide');
    await read('8964000123456');
    await read('8964000123456');
    await read('8964000123456');
    expect(await screen.findByTestId('detail-name')).toBeTruthy();
  });

  it('offers a new item with the barcode filled in when nothing matches', async () => {
    await openApp(db, 'stock');
    await openScan();
    await screen.findByTestId('scan-guide');
    await read('4006381333931');
    expect(await screen.findByTestId('scan-unknown')).toBeTruthy();
    expect(screen.getByText('No item has barcode 4006381333931')).toBeTruthy();
    await press('scan-add-new');
    await screen.findByTestId('field-name');
    expect(screen.getByTestId('field-barcode').props.value).toBe('4006381333931');
  });

  it('"Scan again" goes back to looking', async () => {
    await openApp(db, 'stock');
    await openScan();
    await screen.findByTestId('scan-guide');
    await read('4006381333931');
    await screen.findByTestId('scan-unknown');
    await press('scan-again');
    await waitFor(() => expect(screen.queryByTestId('scan-unknown')).toBeNull());
    await createItem(db, { name: 'Late arrival', baseUnit: 'g', barcode: '4006381333931' });
    await read('4006381333931');
    expect(await screen.findByTestId('detail-name')).toBeTruthy();
  });

  it('lets you type the number when the barcode is damaged', async () => {
    await createItem(db, { name: 'Ketchup', baseUnit: 'g', barcode: '8964000123456' });
    await openApp(db, 'stock');
    await openScan();
    await screen.findByTestId('scan-guide');
    expect(screen.getByTestId('scan-go').props.accessibilityState?.disabled).toBe(true);
    await type('scan-typed', '8964 0001 23456');
    await press('scan-go');
    expect(await screen.findByTestId('detail-name')).toBeTruthy();
  });

  it('says so when what was read is not a barcode', async () => {
    await openApp(db, 'stock');
    await openScan();
    await screen.findByTestId('scan-guide');
    await read('!!');
    expect(await screen.findByText(/does not look like a barcode/)).toBeTruthy();
  });

  it('asks for the camera first, and still lets you type if it is refused', async () => {
    camera().permission = false;
    camera().grantOnRequest = false;
    await openApp(db, 'stock');
    await openScan();
    expect(await screen.findByTestId('allow-camera')).toBeTruthy();
    await press('allow-camera');
    expect(await screen.findByTestId('open-settings')).toBeTruthy();
    expect(screen.getByTestId('scan-typed')).toBeTruthy();
  });
});

describe('scanning into the item form', () => {
  it('puts the scanned number in the Barcode field and saves it', async () => {
    await openApp(db, 'stock');
    await press('fab-add-item');
    await type('field-name', 'Chilli sauce');
    await press('scan-barcode');
    await screen.findByTestId('scan-guide');
    await read('8901234567890');
    await waitFor(() => expect(screen.getByTestId('field-barcode').props.value).toBe('8901234567890'));
    expect(screen.getByTestId('field-name').props.value).toBe('Chilli sauce'); // what was typed is kept
    await press('save-item');
    await waitFor(async () => expect(await findItemByBarcode(db, '8901234567890')).toMatchObject({ name: 'Chilli sauce' }));
  });
});
