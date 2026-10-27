<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { adminApi } from '../api/admin';
import { useAuthStore } from '../stores/auth';
import type { AdminUser, AdminRole, AdminStats } from '@app/contract';

const router = useRouter();
const auth = useAuthStore();

// 统计
const stats = ref<AdminStats | null>(null);
const statsLoading = ref(false);

// 用户列表
const users = ref<AdminUser[]>([]);
const usersLoading = ref(false);
const userTotal = ref(0);
const userPage = ref(1);
const userPageSize = ref(10);
const keyword = ref('');

// 角色列表
const roles = ref<AdminRole[]>([]);

// 错误提示
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
        <button class="back" type="button" @click="router.push('/chat')">← 对话</button>
        <span class="wordmark">后台管理</span>
      </div>
      <div class="right">
        <span class="user">{{ auth.user?.nickname || auth.user?.email }}</span>
        <span class="role badge">admin</span>
      </div>
    </header>

    <main class="main">
      <!-- 错误提示 -->
      <div v-if="error" class="error" role="alert">
        <span>{{ error }}</span>
        <button type="button" @click="error = null">关闭</button>
      </div>

      <!-- 统计卡片 -->
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

      <!-- 用户列表 -->
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

        <!-- 分页 -->
        <div class="pagination">
          <button type="button" :disabled="userPage <= 1" @click="goPage(userPage - 1)">上一页</button>
          <span>第 {{ userPage }} / {{ totalPages }} 页（共 {{ userTotal }} 人）</span>
          <button type="button" :disabled="userPage >= totalPages" @click="goPage(userPage + 1)">下一页</button>
        </div>
      </section>

      <!-- 角色列表 -->
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
  height: 100%;
  background: var(--paper);
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--line);
  background: rgba(246, 243, 238, 0.92);
  backdrop-filter: blur(6px);
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.wordmark {
  font-weight: 600;
  font-size: 15px;
}

.back {
  border: 1px solid var(--line-strong);
  background: transparent;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--ink-soft);
}

.back:hover {
  background: rgba(0, 0, 0, 0.04);
}

.user {
  font-size: 13px;
  color: var(--ink-soft);
}

.badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--paper-2);
  color: var(--ink-soft);
}

.main {
  flex: 1;
  overflow-y: auto;
  padding: 24px 40px;
  max-width: 1000px;
  margin: 0 auto;
  width: 100%;
}

.error {
  margin-bottom: 16px;
  padding: 10px 14px;
  border: 1px solid rgba(179, 38, 30, 0.3);
  border-left: 3px solid var(--danger);
  border-radius: 8px;
  background: var(--danger-bg);
  color: var(--danger);
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.error button {
  border: none;
  background: none;
  color: var(--danger);
  cursor: pointer;
  font-size: 12px;
}

/* 统计卡片 */
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
}

.stat-label {
  font-size: 12px;
  color: var(--ink-faint);
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--ink);
}

/* 面板 */
.panel {
  margin-bottom: 24px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  padding: 20px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

h2 {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 16px 0;
}

.panel-header h2 {
  margin: 0;
}

.search-box {
  display: flex;
  gap: 8px;
}

.search-box input {
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  width: 200px;
  background: var(--paper);
}

.search-box input:focus {
  outline: none;
  border-color: var(--amber);
}

.search-box button {
  border: none;
  background: var(--ink);
  color: #fff;
  border-radius: 8px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 13px;
}

/* 表格 */
.user-table,
.role-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.user-table th,
.role-table th {
  text-align: left;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
  color: var(--ink-faint);
  font-weight: 500;
  font-size: 12px;
}

.user-table td,
.role-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
}

.empty {
  text-align: center;
  color: var(--ink-faint);
  padding: 30px !important;
}

.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

.status {
  font-size: 12px;
  padding: 2px 8px;
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

.action {
  border: 1px solid var(--line-strong);
  background: transparent;
  border-radius: 6px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 12px;
  color: var(--ink-soft);
}

.action:hover {
  background: rgba(0, 0, 0, 0.04);
}

.action.danger {
  border-color: rgba(179, 38, 30, 0.3);
  color: var(--danger);
}

.action.danger:hover {
  background: rgba(179, 38, 30, 0.06);
}

/* 分页 */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
  font-size: 13px;
  color: var(--ink-soft);
}

.pagination button {
  border: 1px solid var(--line-strong);
  background: transparent;
  border-radius: 6px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 12px;
  color: var(--ink-soft);
}

.pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
