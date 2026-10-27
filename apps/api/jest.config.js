/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  // 集成测试用真实数据库，串行执行避免并发冲突
  maxWorkers: 1,
  // 给数据库连接和启动多留点时间
  testTimeout: 30_000,
  // 测试环境变量
  globalSetup: '<rootDir>/test/global-setup.ts',
  globalTeardown: '<rootDir>/test/global-teardown.ts',
};
