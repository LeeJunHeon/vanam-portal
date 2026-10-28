import TopBar from "@/components/portal/TopBar";
import PortalHome from "@/components/portal/home/PortalHome";
import TodayProvider from "@/components/portal/today/TodayProvider";

export default function Home() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f0f2f5" }}>
      {/* 업무 관리 '오늘'은 상단바 버튼과 첫 화면 패널이 같이 쓴다 */}
      <TodayProvider>
        <TopBar />
        <PortalHome />
      </TodayProvider>
    </div>
  );
}
