<script setup lang="ts">
import { ref } from 'vue';
import TermsModal from './TermsModal.vue';

const termsOpen = ref(false);
</script>

<template>
  <footer class="footer-note">
    <p class="footer-note__text">
      Dịch vụ này chỉ phục vụ các mục đích hợp pháp như bảo vệ quyền riêng tư, tránh thư rác và đăng ký
      tài khoản dùng một lần. Địa chỉ email tạm thời có thể bị xoá bất cứ lúc nào — không dùng để nhận thư
      quan trọng. <strong>Nghiêm cấm sử dụng dịch vụ cho bất kỳ hoạt động bất hợp pháp nào.</strong>
    </p>
    <p class="footer-note__text">
      This service is intended solely for lawful purposes such as protecting your privacy, avoiding spam and
      one-time sign-ups. Temporary addresses may expire at any time and are not for receiving important mail.
      <strong>Any illegal or criminal use is strictly prohibited.</strong>
    </p>
    <button class="footer-note__terms" type="button" @click="termsOpen = true">
      Điều khoản sử dụng &amp; Miễn trừ trách nhiệm · Terms of Use &amp; Disclaimer
    </button>
    <TermsModal :open="termsOpen" @close="termsOpen = false" />
  </footer>
</template>

<style scoped>
.footer-note {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  text-align: center;
}
.footer-note__text {
  margin: 0 0 6px;
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.6;
}
.footer-note__text:last-of-type { margin-bottom: 12px; }
.footer-note__terms {
  min-height: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--accent);
  padding: 4px;
}
.footer-note__terms:hover { text-decoration: underline; }
</style>
