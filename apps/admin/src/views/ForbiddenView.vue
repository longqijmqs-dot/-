<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="forbidden">
    <h1>403</h1>
    <p>无权访问此页面</p>
    <p class="hint">你需要管理员权限才能查看管理后台</p>
    <button type="button" @click="router.push('/admin/login')">返回登录</button>
  </div>
</template>

<style scoped>
.forbidden {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  text-align: center;
  padding: 20px;
}

h1 {
  font-size: 64px;
  font-weight: 700;
  color: var(--ink-faint);
  margin-bottom: 16px;
}

p {
  font-size: 16px;
  color: var(--ink-soft);
  margin-bottom: 8px;
}

.hint {
  font-size: 13px;
  color: var(--ink-faint);
  margin-bottom: 24px;
}

button {
  border: 1px solid var(--line-strong);
  background: var(--surface);
  border-radius: 8px;
  padding: 10px 20px;
  cursor: pointer;
  font-size: 14px;
  color: var(--ink);
}

button:hover {
  background: var(--paper);
}
</style>
