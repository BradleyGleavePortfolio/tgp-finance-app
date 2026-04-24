module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.(spec|test)\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  // expo-server-sdk ships ESM-only source that Jest's CJS transform can't
  // parse. Swap in our stub for every test; the push-sender spec provides
  // its own inline override when it needs to assert on calls.
  moduleNameMapper: {
    '^expo-server-sdk$': '<rootDir>/test/__mocks__/expo-server-sdk.ts',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: 'coverage',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
