module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: ['src/domain/**/*.ts', '!**/*.test.ts'],
  coverageThreshold: {
    // Plan target: >= 90% on the domain layer.
    'src/domain/': { statements: 90, branches: 90, functions: 90, lines: 90 },
  },
};
