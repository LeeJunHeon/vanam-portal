"use client";

import { useEffect, useState } from "react";
import { Package, Wrench, Layers, Flame } from "lucide-react";
import AppCard from "@/components/portal/AppCard";

const INVENTORY_BASE = "https://inventory.vanam.synology.me";
const EQUIPMENT_BASE = "https://equipment.vanam.synology.me";
const CHAMBER_BASE = "https://chamber.vanam.synology.me";
const EVAPORATOR_BASE = "https://evaporator.vanam.synology.me";

export default function AppCardGrid() {
  const [invStat1, setInvStat1] = useState<string | undefined>(undefined);
  const [invStat2, setInvStat2] = useState<string | undefined>(undefined);
  const [eqStat1, setEqStat1] = useState<string | undefined>(undefined);
  const [eqStat2, setEqStat2] = useState<string | undefined>(undefined);

  useEffect(() => {
    // 재고관리 요약 (portal-summary API 추가 전까지 graceful 처리)
    fetch(`${INVENTORY_BASE}/api/portal-summary`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setInvStat1(`품목 ${d.totalItems ?? "--"}개`);
        setInvStat2(`오늘 거래 ${d.todayTxCount ?? "--"}건`);
      })
      .catch(() => {});

    // 장비관리 요약
    fetch(`${EQUIPMENT_BASE}/api/dashboard`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        const total = d.equipments?.length ?? "--";
        const unresolved = d.totalUnresolved ?? 0;
        setEqStat1(`장비 ${total}대`);
        setEqStat2(`미해결 수리 ${unresolved}건`);
      })
      .catch(() => {});
  }, []);

  const CARDS = [
    {
      icon: Package,
      iconBgColor: "#eff6ff",
      iconColor: "#3b82f6",
      title: "재고 관리",
      description: "웨이퍼·타겟·가스·소모품 입출고 및 바코드 추적",
      status: "online" as const,
      href: INVENTORY_BASE,
      stat1: invStat1,
      stat2: invStat2,
    },
    {
      icon: Wrench,
      iconBgColor: "#f0fdf4",
      iconColor: "#16a34a",
      title: "장비 관리",
      description: "수리·클리닝·Vent 이력 통합 관리",
      status: "online" as const,
      href: EQUIPMENT_BASE,
      stat1: eqStat1,
      stat2: eqStat2,
    },
    {
      icon: Layers,
      iconBgColor: "#f0fdfa",
      iconColor: "#0d9488",
      title: "CH1 & CH2",
      description: "스퍼터링 공정 런 기록·레시피 관리·타겟 추적",
      status: "pending" as const,
      href: CHAMBER_BASE,
    },
    {
      icon: Flame,
      iconBgColor: "#fffbeb",
      iconColor: "#d97706",
      title: "Evaporator",
      description: "DAC 제어·증착률·두께 실시간 모니터링",
      status: "pending" as const,
      href: EVAPORATOR_BASE,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {CARDS.map((card) => (
        <AppCard
          key={card.title}
          icon={card.icon}
          iconBgColor={card.iconBgColor}
          iconColor={card.iconColor}
          title={card.title}
          description={card.description}
          status={card.status}
          href={card.href}
          stat1={card.stat1}
          stat2={card.stat2}
        />
      ))}
    </div>
  );
}
