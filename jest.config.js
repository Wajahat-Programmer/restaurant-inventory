module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-paper|react-native-vector-icons|@react-native-vector-icons|@shopify/flash-list|react-native-screens|react-native-safe-area-context)/)',
  ],
  setupFiles: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: ['src/domain/**/*.ts', '!**/*.test.ts'],
  coverageThreshold: {
    // Plan target: >= 90% on the domain layer.
    'src/domain/': { statements: 90, branches: 90, functions: 90, lines: 90 },
  },
};
