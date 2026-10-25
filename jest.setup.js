/* eslint-env jest */
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
