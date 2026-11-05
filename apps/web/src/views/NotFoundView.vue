<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="wrap">
    <p class="code">404</p>
    <h1>这个页面不存在</h1>
    <p class="desc">链接可能已经失效，或者地址输错了。</p>
    <RouterLink class="primary" to="/chat">回到对话</RouterLink>
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
  background: var(--bg);
}

.code {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  letter-spacing: 0.3em;
  color: var(--accent);
}

h1 {
  margin: 0;
  font-size: 24px;
}

.desc {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.primary {
  margin-top: 12px;
  padding: 10px 18px;
  border-radius: 9px;
  background: var(--text);
  color: #fff;
  text-decoration: none;
  font-size: 14px;
}
</style>
