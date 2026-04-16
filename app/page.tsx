import { Package, Layers, Flame } from "lucide-react";
import TopBar from "@/components/portal/TopBar";
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

          {/* 앱 카드 통합 그리드 */}
          <section>
            <div className="grid grid-cols-2 gap-4">
              <AppCard
                icon={Package}
                iconBgColor="#eff6ff"
                iconColor="#3b82f6"
                title="재고관리"
                description="웨이퍼·타겟·가스·소모품 입출고 및 바코드 추적"
                status="online"
                href={INVENTORY_BASE}
              />
              <AppCard
                icon={Layers}
                iconBgColor="#f0fdfa"
                iconColor="#0d9488"
                title="CH1 & CH2"
                description="스퍼터링 공정 런 기록·레시피 관리·타겟 추적"
                status="pending"
                href={CHAMBER_BASE}
              />
              <AppCard
                icon={Flame}
                iconBgColor="#fffbeb"
                iconColor="#d97706"
                title="Evaporator"
                description="DAC 제어·증착률·두께 실시간 모니터링"
                status="pending"
                href={EVAPORATOR_BASE}
              />
            </div>
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
