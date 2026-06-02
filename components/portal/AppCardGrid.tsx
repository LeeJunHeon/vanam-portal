"use client";

import { useEffect, useState } from "react";
import { Package, Wrench, Calendar, Workflow } from "lucide-react";
import AppCard from "@/components/portal/AppCard";

const INVENTORY_BASE = "https://inventory.vanam.synology.me";
const EQUIPMENT_BASE = "https://equipment.vanam.synology.me";
const HR_BASE = "https://hr.vanam.synology.me";
const PROCESS_BASE = "https://process.vanam.synology.me";

export default function AppCardGrid() {
  const [invStat1, setInvStat1] = useState<string | undefined>(undefined);
  const [invStat2, setInvStat2] = useState<string | undefined>(undefined);
  const [eqStat1, setEqStat1] = useState<string | undefined>(undefined);
  const [eqStat2, setEqStat2] = useState<string | undefined>(undefined);
  const [invStatus, setInvStatus] = useState<"online" | "offline" | "pending">("online");
  const [eqStatus, setEqStatus]   = useState<"online" | "offline" | "pending">("online");
  const [hrStatus, setHrStatus]   = useState<"online" | "offline" | "pending">("offline");

  useEffect(() => {
    // 재고관리 요약
    fetch(`${INVENTORY_BASE}/api/portal-summary`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setInvStat1(`품목 ${d.totalItems ?? "--"}개`);
        setInvStat2(`오늘 입고 ${d.todayIn ?? 0} · 불출 ${d.todayUse ?? 0} · 출고 ${d.todayOut ?? 0}`);
      })
      .catch(() => {});

    // 장비관리 요약
    fetch(`${EQUIPMENT_BASE}/api/dashboard`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        const total = d.equipments?.length ?? "--";
        const unresolved = d.totalUnresolved ?? 0;
        setEqStat1(`장비 ${total}대`);
        setEqStat2(`미해결 수리 ${unresolved}건`);
      })
      .catch(() => {});

    // 컨테이너 상태 (nas-status) — 앱 카드 뱃지 반영
    const fetchNasStatus = () => {
      fetch("/api/nas-status")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => {
          if (!d?.containers) return;
          setInvStatus(d.containers["inventory-web-nextjs"] === "running" ? "online" : "offline");
          setEqStatus(d.containers["equipment-web-nextjs"]  === "running" ? "online" : "offline");
          setHrStatus(d.containers["hr-nextjs"] === "running" ? "online" : "offline");
        })
        .catch(() => {});
    };
    fetchNasStatus();
    const nasTimer = setInterval(fetchNasStatus, 30000);

    return () => {
      clearInterval(nasTimer);
    };
  }, []);

  const CARDS = [
    {
      icon: Package,
      iconBgColor: "#eff6ff",
      iconColor: "#3b82f6",
      title: "재고 관리",
      description: "웨이퍼·타겟·가스·소모품 입출고 및 바코드 추적",
      status: invStatus,
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
      status: eqStatus,
      href: EQUIPMENT_BASE,
      stat1: eqStat1,
      stat2: eqStat2,
    },
    {
      icon: Calendar,
      iconBgColor: "#faf5ff",
      iconColor: "#9333ea",
      title: "근태 관리",
      description: "WiFi 자동 출퇴근·휴가·근태 결재",
      status: hrStatus,
      href: HR_BASE,
    },
    {
      icon: Workflow,
      iconBgColor: "#fffbeb",
      iconColor: "#d97706",
      title: "공정 관리",
      description: "공정 레시피·런 기록·파라미터 추적",
      status: "pending" as const,
      href: PROCESS_BASE,
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
