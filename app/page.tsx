import { Layers, Flame } from "lucide-react";
import TopBar from "@/components/portal/TopBar";
import FeaturedApp from "@/components/portal/FeaturedApp";
import AppCard from "@/components/portal/AppCard";
import ActivityLog from "@/components/portal/ActivityLog";
import ServerStatus from "@/components/portal/ServerStatus";
import QuickActions from "@/components/portal/QuickActions";
import AlertPanel from "@/components/portal/AlertPanel";

const INVENTORY_BASE = "https://inventory.vanam.synology.me";
const CHAMBER_BASE = "https://chamber.vanam.synology.me";      // 개발 예정
const EVAPORATOR_BASE = "https://evaporator.vanam.synology.me"; // 개발 예정

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

          {/* 섹션 1 — 주요 시스템 */}
          <section>
            <p
              className="font-bold uppercase tracking-widest mb-3"
              style={{ fontSize: "11px", color: "#9ca3af", letterSpacing: "0.08em" }}
            >
              주요 시스템
            </p>
            <FeaturedApp />
          </section>

          {/* 섹션 2 — 장비 제어 */}
          <section>
            <p
              className="font-bold uppercase tracking-widest mb-3"
              style={{ fontSize: "11px", color: "#9ca3af", letterSpacing: "0.08em" }}
            >
              장비 제어
            </p>
            <div className="grid grid-cols-2 gap-4">
              <AppCard
                icon={Layers}
                iconBgColor="#f0fdfa"
                iconColor="#0d9488"
                title="챔버 제어"
                description="CH1·CH2 공정 자동화 및 PLC 시퀀스 관리"
                href={CHAMBER_BASE}
              />
              <AppCard
                icon={Flame}
                iconBgColor="#fffbeb"
                iconColor="#d97706"
                title="증발기"
                description="DAC 제어·증착률·두께 실시간 모니터링"
                href={EVAPORATOR_BASE}
              />
            </div>
          </section>

          {/* 섹션 3 — 최근 활동 */}
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
