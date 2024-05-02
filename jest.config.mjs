export default {
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest',
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@aptre/protobuf-es-lite$': '<rootDir>/src/index.ts',
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  roots: ["<rootDir>/example/", "<rootDir>/src/"]
};
