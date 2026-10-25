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
  mkdir: jest.fn(async () => undefined),
  moveFile: jest.fn(async () => undefined),
  unlink: jest.fn(async () => undefined),
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
