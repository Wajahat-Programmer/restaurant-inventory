/* eslint-env jest */
const { configure } = require('@testing-library/react-native');

// A busy machine (many test files in parallel) must not make waits time out.
configure({ asyncUtilTimeout: 5000 });
