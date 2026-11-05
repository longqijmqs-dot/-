<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { adminApi } from '../api/admin';
import { useAuthStore } from '../stores/auth';
import type { AdminUser, AdminRole, AdminStats } from '@app/contract';

const router = useRouter();
const auth = useAuthStore();

const stats = ref<AdminStats | null>(null);
const statsLoading = ref(false);

const users = ref<AdminUser[]>([]);
const usersLoading = ref(false);
const userTotal = ref(0);
const userPage = ref(1);
const userPageSize = ref(10);
const keyword = ref('');

const roles = ref<AdminRole[]>([]);

const error = ref<string | null>(null);

const totalPages = computed(() => Math.max(1, Math.ceil(userTotal.value / userPageSize.value)));

async function loadStats(): Promise<void> {
  statsLoading.value = true;
  try {
    stats.value = await adminApi.getStats();
  } catch (e) {
    error.value = `加载统计失败：${(e as Error).message}`;
  } finally {
    statsLoading.value = false;
  }
}

async function loadUsers(): Promise<void> {
  usersLoading.value = true;
  try {
    const result = await adminApi.listUsers({
      page: userPage.value,
      pageSize: userPageSize.value,
      keyword: keyword.value || undefined,
    });
    users.value = result.items;
    userTotal.value = result.total;
  } catch (e) {
    error.value = `加载用户列表失败：${(e as Error).message}`;
  } finally {
    usersLoading.value = false;
  }
}

async function loadRoles(): Promise<void> {
  try {
    const result = await adminApi.listRoles();
    roles.value = result.items;
  } catch (e) {
    error.value = `加载角色列表失败：${(e as Error).message}`;
  }
}

async function toggleUserStatus(user: AdminUser): Promise<void> {
  const newStatus = user.status === 1 ? 0 : 1;
  const action = newStatus === 0 ? '禁用' : '启用';
  if (!confirm(`确定要${action}用户 ${user.email} 吗？`)) return;

  try {
    await adminApi.updateUserStatus(user.id, newStatus);
    error.value = null;
    await loadUsers();
    await loadStats();
  } catch (e) {
    error.value = `${action}失败：${(e as Error).message}`;
  }
}

function search(): void {
  userPage.value = 1;
  loadUsers();
}

function goPage(page: number): void {
  if (page < 1 || page > totalPages.value) return;
  userPage.value = page;
  loadUsers();
}

onMounted(async () => {
  await Promise.all([loadStats(), loadUsers(), loadRoles()]);
});
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="left">
        <span class="logo">🛡</span>
        <span class="wordmark">管理后台</span>
      </div>
      <div class="right">
        <span class="user">{{ auth.user?.nickname || auth.user?.email }}</span>
        <button type="button" class="logout" @click="auth.logout(); router.push('/admin/login')">
          退出
        </button>
      </div>
    </header>

    <main class="main">
      <div v-if="error" class="error" role="alert">
        <span>{{ error }}</span>
        <button type="button" @click="error = null">✕</button>
      </div>

      <section class="stats">
        <div class="stat-card">
          <span class="stat-label">用户数</span>
          <span class="stat-value">{{ statsLoading ? '…' : (stats?.userCount ?? 0) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">会话数</span>
          <span class="stat-value">{{ statsLoading ? '…' : (stats?.conversationCount ?? 0) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">消息数</span>
          <span class="stat-value">{{ statsLoading ? '…' : (stats?.messageCount ?? 0) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">AI 调用</span>
          <span class="stat-value">{{ statsLoading ? '…' : (stats?.aiCallCount ?? 0) }}</span>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>用户管理</h2>
          <div class="search-box">
            <input
              v-model="keyword"
              type="text"
              placeholder="搜索邮箱或昵称…"
              @keydown.enter="search"
            />
            <button type="button" @click="search">搜索</button>
          </div>
        </div>

        <table class="user-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>邮箱</th>
              <th>昵称</th>
              <th>角色</th>
              <th>状态</th>
              <th>最后登录</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="usersLoading">
              <td colspan="7" class="empty">加载中…</td>
            </tr>
            <tr v-else-if="users.length === 0">
              <td colspan="7" class="empty">暂无用户</td>
            </tr>
            <tr v-for="user in users" :key="user.id">
              <td class="mono">{{ user.id }}</td>
              <td>{{ user.email }}</td>
              <td>{{ user.nickname || '—' }}</td>
              <td><span class="role badge">{{ user.roleCode }}</span></td>
              <td>
                <span class="status" :class="user.status === 1 ? 'active' : 'disabled'">
                  {{ user.status === 1 ? '启用' : '禁用' }}
                </span>
              </td>
              <td class="mono">{{ user.lastLoginAt ? user.lastLoginAt.slice(0, 16).replace('T', ' ') : '—' }}</td>
              <td>
                <button
                  type="button"
                  class="action"
                  :class="user.status === 1 ? 'danger' : ''"
                  @click="toggleUserStatus(user)"
                >
                  {{ user.status === 1 ? '禁用' : '启用' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="pagination">
          <button type="button" :disabled="userPage <= 1" @click="goPage(userPage - 1)">上一页</button>
          <span>第 {{ userPage }} / {{ totalPages }} 页（共 {{ userTotal }} 人）</span>
          <button type="button" :disabled="userPage >= totalPages" @click="goPage(userPage + 1)">下一页</button>
        </div>
      </section>

      <section class="panel">
        <h2>角色列表</h2>
        <table class="role-table">
          <thead>
            <tr>
              <th>代码</th>
              <th>名称</th>
              <th>权限配置</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="role in roles" :key="role.id">
              <td><span class="role badge">{{ role.code }}</span></td>
              <td>{{ role.name }}</td>
              <td class="mono">{{ JSON.stringify(role.permissions) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--bg);
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}

.left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo {
  font-size: 24px;
}

.wordmark {
  font-weight: 600;
  font-size: 16px;
}

.right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user {
  font-size: 13px;
  color: var(--text-secondary);
}

.logout {
  border: 1px solid var(--border-hover);
  background: transparent;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
}

.logout:hover {
  background: var(--bg);
}

.main {
  flex: 1;
  padding: 32px 24px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  margin-bottom: 20px;
  border: 1px solid rgba(179, 38, 30, 0.3);
  border-left: 3px solid var(--danger);
  border-radius: 8px;
  background: var(--danger-bg);
  color: var(--danger);
  font-size: 13px;
}

.error button {
  border: none;
  background: none;
  color: var(--danger);
  cursor: pointer;
  font-size: 14px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
}

.stat-label {
  font-size: 13px;
  color: var(--text-tertiary);
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--text);
}

.panel {
  margin-bottom: 32px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  padding: 24px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

h2 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.search-box {
  display: flex;
  gap: 8px;
}

.search-box input {
  border: 1px solid var(--border-hover);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  width: 240px;
  background: var(--bg);
}

.search-box input:focus {
  outline: none;
  border-color: var(--accent);
}

.search-box button {
  border: none;
  background: var(--text);
  color: #fff;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
}

.user-table,
.role-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.user-table th,
.role-table th {
  text-align: left;
  padding: 12px;
  border-bottom: 1px solid var(--border);
  color: var(--text-tertiary);
  font-weight: 500;
  font-size: 12px;
}

.user-table td,
.role-table td {
  padding: 12px;
  border-bottom: 1px solid var(--border);
}

.empty {
  text-align: center;
  color: var(--text-tertiary);
  padding: 32px !important;
}

.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

.status {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
}

.status.active {
  background: rgba(34, 139, 34, 0.1);
  color: #228b22;
}

.status.disabled {
  background: rgba(179, 38, 30, 0.1);
  color: var(--danger);
}

.badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-sidebar);
  color: var(--text-secondary);
}

.action {
  border: 1px solid var(--border-hover);
  background: transparent;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
}

.action:hover {
  background: var(--bg);
}

.action.danger {
  border-color: rgba(179, 38, 30, 0.3);
  color: var(--danger);
}

.action.danger:hover {
  background: rgba(179, 38, 30, 0.06);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 20px;
  font-size: 13px;
  color: var(--text-secondary);
}

.pagination button {
  border: 1px solid var(--border-hover);
  background: transparent;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
}

.pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
