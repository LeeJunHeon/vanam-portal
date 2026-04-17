import TopBar from "@/components/portal/TopBar";
import AppCardGrid from "@/components/portal/AppCardGrid";
import ActivityLog from "@/components/portal/ActivityLog";
import ServerStatus from "@/components/portal/ServerStatus";
import AlertPanel from "@/components/portal/AlertPanel";

export default function Home() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f0f2f5" }}>
      <TopBar />

      {/* 탑바 높이만큼 padding-top */}
      <div
        className="flex flex-col lg:flex-row gap-4 mx-auto pt-14 lg:pt-16 pb-6 px-4"
        style={{ maxWidth: "1200px" }}
      >
        {/* 좌측 메인 */}
        <main className="flex-1 flex flex-col gap-5 min-w-0">
          <section>
            <AppCardGrid />
          </section>
          <section>
            <ActivityLog />
          </section>
        </main>

        {/* 우측 사이드바 */}
        <aside className="flex flex-col gap-4 lg:w-[260px] lg:flex-shrink-0">
          <ServerStatus />
          <AlertPanel />
        </aside>
      </div>
    </div>
  );
}
