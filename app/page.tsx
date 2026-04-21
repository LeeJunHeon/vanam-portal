import TopBar from "@/components/portal/TopBar";
import AppCardGrid from "@/components/portal/AppCardGrid";
import ActivityLog from "@/components/portal/ActivityLog";
import ServerStatus from "@/components/portal/ServerStatus";
import AlertPanel from "@/components/portal/AlertPanel";

export default function Home() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f0f2f5" }}>
      <TopBar />

      <div className="flex flex-col lg:flex-row gap-4 mx-auto pt-[72px] pb-8 px-4" style={{ maxWidth: "1200px" }}>
        <main className="flex-1 flex flex-col gap-6 min-w-0">
          <section>
            <p style={{ fontSize: "11px", fontWeight: 500, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>앱</p>
            <AppCardGrid />
          </section>
          <section>
            <p style={{ fontSize: "11px", fontWeight: 500, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>활동 로그</p>
            <ActivityLog />
          </section>
        </main>
        <aside className="flex flex-col gap-4 lg:w-[260px] lg:flex-shrink-0">
          <ServerStatus />
          <AlertPanel />
        </aside>
      </div>
    </div>
  );
}
