<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="wrap">
    <p class="code">403</p>
    <h1>当前角色无权访问</h1>
    <p class="desc">这个区域只对管理员开放。如果你认为这是误判，请退出后换用管理员账号登录。</p>
    <div class="links">
      <RouterLink class="primary" to="/chat">回到对话</RouterLink>
      <RouterLink class="ghost" to="/login">切换账号</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  min-height: 100vh;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
  background: var(--paper);
}

.code {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  letter-spacing: 0.3em;
  color: var(--amber-deep);
}

h1 {
  margin: 0;
  font-size: 24px;
}

.desc {
  margin: 0;
  max-width: 42ch;
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink-soft);
}

.links {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.primary {
  padding: 10px 18px;
  border-radius: 9px;
  background: var(--ink);
  color: #fff;
  text-decoration: none;
  font-size: 14px;
}

.ghost {
  padding: 10px 18px;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  color: var(--ink);
  text-decoration: none;
  font-size: 14px;
}
</style>
