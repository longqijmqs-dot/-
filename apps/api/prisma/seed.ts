import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/bcrypt';

/**
 * 种子数据。
 *
 * 幂等设计：用 upsert 而不是 create，重复执行不会报错，
 * 也不会覆盖已经改过的角色权限。
 */
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const roles = [
    { code: 'admin', name: '管理员', permissions: { scopes: ['*'] } },
    { code: 'user', name: '普通用户', permissions: { scopes: ['chat'] } },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      // 已存在时只更新名称，权限矩阵由人维护，不被种子覆盖
      update: { name: role.name },
      create: role,
    });
  }
  console.log(`✔ 角色就绪：${roles.map((r) => r.code).join(', ')}`);

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin@123456';
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'admin' } });

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log(`✔ 管理员已存在，跳过：${adminEmail}`);
  } else {
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await hash(adminPassword, rounds),
        nickname: '管理员',
        roleId: adminRole.id,
      },
    });
    console.log(`✔ 管理员已创建：${adminEmail}`);
    console.log('  ⚠️ 密码来自 .env 的 ADMIN_PASSWORD，请勿在生产环境使用默认值');
  }
}

main()
  .catch((error: unknown) => {
    console.error('✘ 种子数据失败', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
