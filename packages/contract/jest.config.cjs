/**
 * Jest 配置（CommonJS）。
 * --runInBand 由 package.json 的 test 脚本传入：本机沙箱不允许派生子进程，
 * 因此测试必须在主进程内串行执行（对单包单测没有性能影响）。
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  maxWorkers: 1,
};
