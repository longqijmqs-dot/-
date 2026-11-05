<script setup lang="ts">
defineProps<{
  title: string;
  subtitle: string;
}>();
</script>

<template>
  <div class="shell">
    <aside class="brand">
      <div class="grid" aria-hidden="true"></div>
      <div class="brand-top">
        <span class="mark">AI</span>
        <span class="name">对话平台</span>
      </div>

      <div class="brand-copy">
        <h1>把对话留下来。</h1>
        <p>会话、消息、文件与权限，都由一套自建后端承担。</p>
      </div>

      <ul class="facts">
        <li><span>01</span>JWT 双令牌，刷新静默完成</li>
        <li><span>02</span>回复逐字流式抵达</li>
        <li><span>03</span>角色守卫隔离后台</li>
      </ul>

      <footer class="brand-foot">v0.1 · 自建后端练习项目</footer>
    </aside>

    <main class="panel">
      <div class="panel-inner">
        <header class="head">
          <p class="eyebrow">ACCOUNT</p>
          <h2>{{ title }}</h2>
          <p class="sub">{{ subtitle }}</p>
        </header>
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100%;
  display: grid;
  grid-template-columns: minmax(380px, 1.05fr) minmax(420px, 1fr);
}

.brand {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 48px 56px;
  background: #0d1014;
  color: #e8e2d6;
  overflow: hidden;
}

.grid {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(232, 226, 214, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(232, 226, 214, 0.06) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(ellipse at 30% 20%, #000 30%, transparent 78%);
  pointer-events: none;
}

.brand-top {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
}

.mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(232, 226, 214, 0.45);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.name {
  font-size: 14px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(232, 226, 214, 0.75);
}

.brand-copy {
  position: relative;
  max-width: 26ch;
}

.brand-copy h1 {
  margin: 0 0 14px;
  font-size: clamp(34px, 3.4vw, 46px);
  line-height: 1.12;
  letter-spacing: -0.02em;
  font-weight: 650;
}

.brand-copy p {
  margin: 0;
  font-size: 15px;
  line-height: 1.65;
  color: rgba(232, 226, 214, 0.66);
}

.facts {
  position: relative;
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
  font-size: 13px;
  color: rgba(232, 226, 214, 0.6);
}

.facts li {
  display: flex;
  gap: 12px;
  align-items: baseline;
}

.facts span {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
}

.brand-foot {
  position: relative;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(232, 226, 214, 0.35);
}

.panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 40px;
  background: var(--bg);
}

.panel-inner {
  width: 100%;
  max-width: 380px;
}

.eyebrow {
  margin: 0 0 14px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.22em;
  color: var(--accent);
}

.head h2 {
  margin: 0 0 8px;
  font-size: 26px;
  letter-spacing: -0.01em;
  font-weight: 650;
}

.head .sub {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
}

@media (max-width: 900px) {
  .shell {
    grid-template-columns: 1fr;
  }

  .brand {
    display: none;
  }

  .panel {
    min-height: 100vh;
    align-items: flex-start;
    padding-top: 72px;
  }
}
</style>
