<script setup lang="ts">
import AppModal from './AppModal.vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <AppModal
    :open="props.open"
    title="Điều khoản sử dụng &amp; Miễn trừ trách nhiệm · Terms of Use &amp; Disclaimer"
    size="lg"
    @close="emit('close')"
  >
    <section class="terms">
      <h3 class="terms__title">1. Miễn trừ trách nhiệm (Disclaimer)</h3>
      <p class="terms__text">
        Dịch vụ này cung cấp địa chỉ email tạm thời miễn phí phục vụ các mục đích hợp pháp như bảo vệ quyền
        riêng tư, tránh thư rác và đăng ký tài khoản dùng một lần. Dịch vụ được cung cấp &ldquo;nguyên trạng&rdquo;
        (as-is), không bảo đảm việc nhận, gửi hoặc bảo mật thư. Địa chỉ email và thư có thể bị thu hồi, xoá hoặc
        hết hạn bất cứ lúc nào. Người dùng tự chịu trách nhiệm về cách sử dụng địa chỉ email được tạo ra; chúng
        tôi không chịu trách nhiệm cho bất kỳ thiệt hại nào phát sinh từ việc sử dụng dịch vụ.
      </p>
      <p class="terms__text">
        This service provides free temporary email addresses for lawful purposes such as protecting your privacy,
        avoiding spam and one-time sign-ups. The service is provided &ldquo;as-is&rdquo; without any guarantee of
        message delivery, security or availability. Addresses and messages may be revoked, deleted or expire at any
        time. Users are solely responsible for how they use generated addresses; we are not liable for any damage
        arising from the use of the service.
      </p>

      <h3 class="terms__title">2. Hành vi bị nghiêm cấm (Prohibited uses)</h3>
      <p class="terms__text">
        Nghiêm cấm sử dụng dịch vụ để thực hiện hoặc hỗ trợ bất kỳ hành vi bất hợp pháp nào, bao gồm nhưng
        không giới hạn: lừa đảo, lừa đảo qua mạng (phishing), chiếm đoạt tài sản, gửi thư rác hoặc thư hàng loạt,
        đăng ký tài khoản trái phép, đánh cắp hoặc thu thập trái phép thông tin cá nhân hay thông tin tài khoản
        ngân hàng, rửa tiền, buôn bán hàng hoá phạm pháp, hoặc bất kỳ hành vi nào bị nghiêm cấm theo Điều 8
        Luật An ninh mạng 2018.
      </p>
      <p class="terms__text">
        It is strictly prohibited to use the service to commit or facilitate any unlawful act, including but not
        limited to: fraud, phishing, property misappropriation, sending spam or bulk mail, unauthorized account
        registration, stealing or unlawfully collecting personal data or banking information, money laundering,
        trafficking illegal goods, or any act prohibited under Article 8 of the Law on Cybersecurity 2018.
      </p>

      <h3 class="terms__title">3. Căn cứ pháp lý (Legal basis)</h3>
      <p class="terms__text">
        Việc sử dụng dịch vụ tuân thủ pháp luật Việt Nam. Hành vi vi phạm có thể bị xử phạt hành chính hoặc
        truy cứu trách nhiệm hình sự theo: Luật An ninh mạng 2018 (Điều 8, 26, 41); Nghị định 15/2020/NĐ-CP
        (Điều 100 — xử phạt hành vi gửi thư rác, email giả mạo từ 10 đến 20 triệu đồng đối với tổ chức); Bộ luật
        Hình sự 2015 (Điều 174 — lừa đảo chiếm đoạt tài sản; Điều 288 — đưa hoặc sử dụng trái phép thông tin
        mạng; Điều 290 — sử dụng mạng máy tính, mạng viễn thông chiếm đoạt tài sản, phạt tù đến 20 năm;
        Điều 291 — thu thập, trao đổi trái phép thông tin tài khoản ngân hàng). Theo Điều 26 Luật An ninh mạng,
        chúng tôi sẽ phối hợp cung cấp thông tin người dùng cho cơ quan chức năng khi có yêu cầu bằng văn bản
        để phục vụ điều tra, xử lý vi phạm.
      </p>
      <p class="terms__text">
        Use of the service is subject to Vietnamese law. Violations may result in administrative sanctions or
        criminal prosecution under: Law on Cybersecurity 2018 (Arts. 8, 26, 41); Decree 15/2020/NĐ-CP (Art. 100 —
        fines of VND 10–20 million for organizations sending spam or forged emails); Penal Code 2015 (Art. 174 —
        fraud; Art. 288 — unlawful use of network information; Art. 290 — using computers, telecommunications
        networks or electronic devices to misappropriate property, punishable by up to 20 years' imprisonment;
        Art. 291 — unlawful collection or exchange of banking information). Under Art. 26 of the Cybersecurity Law,
        we will cooperate with competent authorities by providing user information upon written request for
        investigation and enforcement.
      </p>
    </section>
  </AppModal>
</template>

<style scoped>
.terms__title {
  margin: 0 0 8px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
}
.terms__title:not(:first-child) { margin-top: 20px; }
.terms__text {
  margin: 0 0 10px;
  font-size: 0.85rem;
  line-height: 1.65;
  color: var(--text-muted);
}
.terms__text:last-child { margin-bottom: 0; }
</style>
