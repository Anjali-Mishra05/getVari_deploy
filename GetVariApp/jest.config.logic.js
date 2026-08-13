/**
 * Config for the pure-logic test suites (hydration parsing, idempotent
 * logging, notification prompt state).
 *
 * The default `jest.config.js` boots the React Native preset for component
 * tests; these suites mock every native module they touch, so they run in a
 * plain node environment and stay fast.
 *
 *   npm run test:hydration
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/__tests__/hydrationLogging.test.ts',
    '<rootDir>/__tests__/authSession.test.ts',
    '<rootDir>/__tests__/notificationHistory.test.ts',
  ],
};
