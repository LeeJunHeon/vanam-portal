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
        <main className="flex-1 flex flex-col gap-4 min-w-0">
          <AppCardGrid />
          <ActivityLog />
        </main>
        <aside className="flex flex-col gap-4 lg:w-[260px] lg:flex-shrink-0">
          <ServerStatus />
          <AlertPanel />
        </aside>
      </div>
    </div>
  );
}
