/* eslint-env jest, es2020 */
require('@shopify/flash-list/jestSetup');

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// Paper loads icon fonts natively; render a plain element in tests.
jest.mock('@react-native-vector-icons/material-design-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const MaterialDesignIcons = ({ name }) => React.createElement(Text, null, name);
  return { __esModule: true, MaterialDesignIcons, default: MaterialDesignIcons };
});

// Native photo libraries: replaced by controllable fakes in Jest.
jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/docs',
  CachesDirectoryPath: '/cache',
  mkdir: jest.fn(async () => undefined),
  moveFile: jest.fn(async () => undefined),
  copyFile: jest.fn(async () => undefined),
  unlink: jest.fn(async () => undefined),
  exists: jest.fn(async () => false),
  readDir: jest.fn(async () => []),
  readFile: jest.fn(async () => ''),
  writeFile: jest.fn(async () => undefined),
  stat: jest.fn(async () => ({ size: 0 })),
  hash: jest.fn(async () => ''),
  downloadFile: jest.fn(() => ({ jobId: 1, promise: Promise.resolve({ statusCode: 200, bytesWritten: 0 }) })),
}));

jest.mock('@bam.tech/react-native-image-resizer', () => ({
  __esModule: true,
  default: {
    createResizedImage: jest.fn(async (_uri, w) => ({
      path: `/cache/resized-${w}`,
      uri: `file:///cache/resized-${w}`,
      size: 1,
      name: `resized-${w}`,
      width: 600,
      height: 800,
    })),
  },
}));

// Tests flip these to simulate the camera permission and a missing camera.
globalThis.__camera = { permission: true, device: { id: 'back' }, takePhoto: jest.fn(async () => ({ path: '/cache/raw.jpg' })) };

jest.mock('react-native-vision-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Camera = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ takePhoto: (...a) => globalThis.__camera.takePhoto(...a) }));
    return React.createElement(View, { testID: 'camera-preview' });
  });
  return {
    Camera,
    useCameraDevice: () => globalThis.__camera.device,
    useCameraPermission: () => ({
      hasPermission: globalThis.__camera.permission,
      requestPermission: jest.fn(async () => {
        globalThis.__camera.permission = globalThis.__camera.grantOnRequest ?? false;
        return globalThis.__camera.permission;
      }),
    }),
  };
});

// Security, sharing, files and notifications: harmless stand-ins.
jest.mock('react-native-keychain', () => {
  const store = {};
  return {
    setGenericPassword: jest.fn(async (u, p, o) => {
      store[o?.service ?? ''] = { username: u, password: p };
      return true;
    }),
    getGenericPassword: jest.fn(async o => store[o?.service ?? ''] ?? false),
    resetGenericPassword: jest.fn(async o => {
      delete store[o?.service ?? ''];
      return true;
    }),
  };
});

jest.mock('react-native-biometrics', () => ({
  __esModule: true,
  default: class {
    isSensorAvailable = jest.fn(async () => ({ available: false }));
    simplePrompt = jest.fn(async () => ({ success: false }));
  },
}));

jest.mock('react-native-zip-archive', () => ({ zip: jest.fn(async () => ''), unzip: jest.fn(async () => '') }));
jest.mock('react-native-share', () => ({ __esModule: true, default: { open: jest.fn(async () => ({})) } }));

jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(async () => {
    throw Object.assign(new Error('cancelled'), { code: 'OPERATION_CANCELED' });
  }),
  keepLocalCopy: jest.fn(),
  types: { allFiles: '*/*' },
  errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
  isErrorWithCode: e => !!e && typeof e.code === 'string',
}));

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    createChannel: jest.fn(async () => 'alerts'),
    requestPermission: jest.fn(async () => ({ authorizationStatus: 1 })),
    displayNotification: jest.fn(async () => undefined),
  },
  AndroidImportance: { DEFAULT: 3 },
  AuthorizationStatus: { AUTHORIZED: 1 },
}));

// The real database is replaced by an in-memory one in tests; this only lets the import load.
jest.mock('@op-engineering/op-sqlite', () => ({ open: jest.fn(() => { throw new Error('op-sqlite is not available in Jest'); }) }));
