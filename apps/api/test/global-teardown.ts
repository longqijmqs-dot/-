/**
 * 测试环境清理：删除测试数据库
 *
 * 用 WSL 的 mysql CLI 而不是 Prisma：
 *   - DROP DATABASE 不支持 prepared statement
 *   - Prisma 的查询引擎强制用 prepared statement，会报错
 */
import { execSync } from 'node:child_process';

export default async function globalTeardown() {
  const TEST_DATABASE = 'ai_chat_test';

  const dbName = TEST_DATABASE;
  execSync(
    'wsl -u root -e mysql -e "DROP DATABASE IF EXISTS `' + dbName + '`"',
    { stdio: 'inherit' },
  );

  console.log('✔ 测试数据库已清理');
}
