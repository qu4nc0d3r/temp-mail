import { createApp } from 'vue';
import App from './App.vue';
import './styles/main.css';
import { isAdminPath } from './admin/gate';

if (isAdminPath(window.location.pathname)) {
  document.body.classList.add('admin');
  import('./admin/AdminApp.vue')
    .then(({ default: AdminApp }) => createApp(AdminApp).mount('#app'))
    .catch((err) => {
      console.error('Không tải được trang admin:', err);
      document.body.innerHTML = '<div style="font-family: system-ui, sans-serif; padding: 24px; color: #b42318; font-weight: 600;">Không tải được trang admin. Vui lòng thử lại sau.</div>';
    });
} else {
  createApp(App).mount('#app');
}
