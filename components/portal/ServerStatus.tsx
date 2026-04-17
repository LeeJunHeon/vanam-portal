"use client";

import { useEffect, useState } from "react";
import { HardDrive, Database, Box, Cpu } from "lucide-react";
import { type LucideIcon } from "lucide-react";

type StatusValue = "online" | "offline" | "unknown";

interface NasStatus {
  nas: StatusValue;
  db: StatusValue;
  inventory: StatusValue;
  chamber: StatusValue;
}

interface StatusItemProps {
  icon: LucideIcon;
  name: string;
  status: StatusValue;
}

function StatusItem({ icon: Icon, name, status }: StatusItemProps) {
  const badge = (() => {
    if (status === "online") {
      return { label: "온라인", bg: "#dcfce7", color: "#16a34a" };
    }
    if (status === "offline") {
      return { label: "오프라인", bg: "#fee2e2", color: "#dc2626" };
    }
    return { label: "확인중", bg: "#f3f4f6", color: "#6b7280" };
  })();

  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2.5">
        <div
          className="flex items-center justify-center rounded-md"
          style={{
            width: "28px",
            height: "28px",
            backgroundColor: "#f9fafb",
            border: "0.5px solid #e5e7eb",
          }}
        >
          <Icon size={13} color="#6b7280" strokeWidth={1.8} />
        </div>
        <span className="text-gray-700 font-medium" style={{ fontSize: "12px" }}>
          {name}
        </span>
      </div>
      <span
        className="rounded-full font-semibold"
        style={{
          fontSize: "9px",
          padding: "2px 8px",
          backgroundColor: badge.bg,
          color: badge.color,
        }}
      >
        {badge.label}
      </span>
    </div>
  );
}

const STATUS_ITEMS: { icon: LucideIcon; name: string; key: keyof NasStatus }[] = [
  { icon: HardDrive, name: "Synology NAS", key: "nas" },
  { icon: Database, name: "PostgreSQL", key: "db" },
  { icon: Box, name: "재고관리 앱", key: "inventory" },
  { icon: Cpu, name: "챔버 에이전트", key: "chamber" },
];

export default function ServerStatus() {
  const [data, setData] = useState<NasStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/nas-status")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((json) => {
        if (cancelled) return;
        setData({
          nas: (json.nas as StatusValue) ?? "unknown",
          db: (json.db as StatusValue) ?? "unknown",
          inventory: (json.inventory as StatusValue) ?? "unknown",
          chamber: (json.chamber as StatusValue) ?? "unknown",
        });
      })
      .catch(() => {
        // fetch 실패 시 "확인중"(unknown) 유지
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const getStatus = (key: keyof NasStatus): StatusValue => data?.[key] ?? "unknown";

  return (
    <div
      className="bg-white rounded-[12px] p-4"
      style={{ border: "0.5px solid #e5e7eb" }}
    >
      <p
        className="font-bold uppercase tracking-widest mb-1"
        style={{ fontSize: "11px", color: "#9ca3af", letterSpacing: "0.08em" }}
      >
        서버 상태
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-1 gap-0 lg:divide-y lg:divide-gray-50">
        {STATUS_ITEMS.map((item) => (
          <StatusItem
            key={item.name}
            icon={item.icon}
            name={item.name}
            status={getStatus(item.key)}
          />
        ))}
      </div>
    </div>
  );
}
