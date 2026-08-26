import { createApp } from 'vue';
import App from './App.vue';
import './styles/main.css';
import { isAdminPath } from './admin/gate';

if (isAdminPath(window.location.pathname)) {
  document.body.classList.add('admin');
  import('./admin/AdminApp.vue').then(({ default: AdminApp }) => createApp(AdminApp).mount('#app'));
} else {
  createApp(App).mount('#app');
}
