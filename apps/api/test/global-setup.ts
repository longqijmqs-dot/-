/**
 * 测试环境准备：创建独立测试数据库 + 跑迁移
 *
 * 为什么用独立数据库？
 *   - 测试不能污染开发数据库
 *   - 测试可以随意删表重建，不影响开发环境
 *
 * 为什么用 WSL 的 mysql CLI 而不是 Prisma？
 *   - CREATE DATABASE / DROP DATABASE 不支持 prepared statement
 *   - Prisma 的查询引擎强制用 prepared statement，会报错
 *   - 用 WSL 的 mysql CLI 直接执行 SQL 更简单可靠
 */
import { execSync } from 'node:child_process';

export default async function globalSetup() {
  const TEST_DATABASE = 'ai_chat_test';

  // 1. 创建测试数据库（通过 WSL 的 mysql CLI）
  //    注意：CREATE DATABASE 不支持 prepared statement，必须用 mysql CLI
  const dbName = TEST_DATABASE;
  execSync(
    'wsl -u root -e mysql -e "CREATE DATABASE IF NOT EXISTS `' + dbName + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"',
    { stdio: 'inherit' },
  );
  console.log(`✔ 测试数据库 ${TEST_DATABASE} 已就绪`);

  // 2. 跑迁移（用 Prisma CLI，指向测试数据库）
  const testDbUrl = `mysql://aichat:jWoTeWGx5I8B2HzCA9nsS5U5@localhost:3306/${TEST_DATABASE}`;
  process.env.DATABASE_URL = testDbUrl;

  execSync(
    'npx prisma migrate deploy --schema prisma/schema.prisma',
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testDbUrl },
      stdio: 'inherit',
    },
  );

  console.log('✔ 迁移已应用到测试数据库');

  // 3. 跑种子数据（创建 admin 用户和角色）
  //    测试需要 admin 账号来登录和验证管理接口
  //    tsconfig.json 已设 module: CommonJS，不需要 -O 参数
  execSync(
    'npx ts-node prisma/seed.ts',
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testDbUrl },
      stdio: 'inherit',
    },
  );

  console.log('✔ 种子数据已写入测试数据库');
}
