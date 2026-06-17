// Pure-logic tests only (no React Native / Expo native imports), so we use a
// minimal babel-jest transform via the project's babel.config.js instead of the
// full jest-expo preset, which pulls in expo-modules-core / native setup.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
};
