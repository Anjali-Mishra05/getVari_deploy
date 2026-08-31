/**
 * Config for the pure-logic test suites (hydration parsing, idempotent
 * logging, notification prompt state, the sleep window, profile edits).
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
    '<rootDir>/__tests__/sleepWindow.test.ts',
    '<rootDir>/__tests__/profileEditing.test.ts',
    '<rootDir>/__tests__/algoCompliance.test.ts',
    '<rootDir>/__tests__/pbwrAlgorithm.test.ts',
    '<rootDir>/__tests__/pbwrMock.test.ts',
    '<rootDir>/__tests__/edgeCases.test.ts',
  ],
};
