import ChatWidget from "@/components/portal/ChatWidget";

// 임베드 전용 페이지 — 재고/장비/근태 앱의 iframe에서 로드된다.
// 인증은 proxy.ts(전 페이지 세션 필수)가 담당하고, SessionProvider는 루트 레이아웃이 제공한다.
export default function WidgetPage() {
  return <ChatWidget embed />;
}
