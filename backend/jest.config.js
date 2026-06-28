/**
 * Jest config for the ESM NestJS backend.
 *
 * The backend (and @magpie/shared) are pure ESM, so Jest runs with
 * `--experimental-vm-modules` (see the test script) and ts-jest in ESM mode.
 * `.js` import specifiers are rewritten to their `.ts` source so TS files
 * resolve under NodeNext-style imports.
 */
export default {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          // Decorator metadata is needed for any Nest provider under test.
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          // Relax flags that fight transient test code.
          verbatimModuleSyntax: false,
          noUnusedLocals: false,
          noUnusedParameters: false,
        },
      },
    ],
  },
};
