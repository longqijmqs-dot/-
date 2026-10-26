import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { setUnauthorizedHandler } from './api/token';
import { router } from './router';
import { useAuthStore } from './stores/auth';
import './styles/global.css';
import './styles/auth-form.css';

const app = createApp(App);
app.use(createPinia());

/**
 * 拦截器里刷新失败时会回调这里：清空登录态 + 跳登录页。
 * 注册放在 main.ts 而不是 store 里，是为了避免
 * store → http → router → store 的循环依赖。
 */
const auth = useAuthStore();
setUnauthorizedHandler(() => {
  auth.clear();
  const current = router.currentRoute.value;
  if (current.name !== 'login') {
    void router.push({ name: 'login', query: { redirect: current.fullPath } });
  }
});

app.use(router);
app.mount('#app');
