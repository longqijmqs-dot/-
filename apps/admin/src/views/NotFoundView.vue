<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="not-found">
    <h1>404</h1>
    <p>页面不存在</p>
    <button type="button" @click="router.push('/admin/login')">返回登录</button>
  </div>
</template>

<style scoped>
.not-found {
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
  color: var(--text-tertiary);
  margin-bottom: 16px;
}

p {
  font-size: 16px;
  color: var(--text-secondary);
  margin-bottom: 24px;
}

button {
  border: 1px solid var(--border-hover);
  background: var(--bg);
  border-radius: 8px;
  padding: 10px 20px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text);
}

button:hover {
  background: var(--bg);
}
</style>
