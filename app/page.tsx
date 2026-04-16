import TopBar from "@/components/portal/TopBar";
import AppCardGrid from "@/components/portal/AppCardGrid";
import ActivityLog from "@/components/portal/ActivityLog";
import ServerStatus from "@/components/portal/ServerStatus";
import QuickActions from "@/components/portal/QuickActions";
import AlertPanel from "@/components/portal/AlertPanel";

export default function Home() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f0f2f5" }}>
      <TopBar />

      {/* 탑바 높이만큼 padding-top */}
      <div
        className="flex gap-4 mx-auto"
        style={{
          paddingTop: "64px",
          paddingBottom: "24px",
          paddingLeft: "16px",
          paddingRight: "16px",
          maxWidth: "1200px",
        }}
      >
        {/* 좌측 메인 */}
        <main className="flex-1 flex flex-col gap-5 min-w-0">

          {/* 앱 카드 통합 그리드 (드래그 앤 드롭 순서 변경) */}
          <section>
            <AppCardGrid />
          </section>

          {/* 최근 활동 */}
          <section>
            <ActivityLog />
          </section>
        </main>

        {/* 우측 사이드바 */}
        <aside className="flex flex-col gap-4" style={{ width: "260px", flexShrink: 0 }}>
          <ServerStatus />
          <QuickActions />
          <AlertPanel />
        </aside>
      </div>
    </div>
  );
}
