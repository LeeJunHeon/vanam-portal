"use client";

import { useEffect, useState } from "react";

interface LogItem {
  id: string;
  appName: string;
  message: string;
  occurredAt: string;
  color: string;
  href: string;
}

const EQUIPMENT_BASE = "https://equipment.vanam.synology.me";
const INVENTORY_BASE = "https://inventory.vanam.synology.me";

function timeAgo(isoStr: string): string {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export default function ActivityLog() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // 장비관리 + 재고관리 최근 이력 병렬 조회 후 병합·시간순 정렬
    Promise.allSettled([
      fetch(`${EQUIPMENT_BASE}/api/logs?limit=10`, { credentials: "include" }).then((r) => r.ok ? r.json() : []),
      fetch(`${INVENTORY_BASE}/api/portal-logs?limit=10`, { credentials: "include" }).then((r) => r.ok ? r.json() : []),
    ]).then(([eqRes, invRes]) => {
      const items: LogItem[] = [];

      // 장비관리 로그
      if (eqRes.status === "fulfilled" && Array.isArray(eqRes.value)) {
        for (const d of eqRes.value as { id: number; eventType: string; equipmentName: string; occurredAt: string }[]) {
          items.push({
            id: `eq-${d.id}`,
            appName: "장비 관리",
            message: `${d.equipmentName} · ${
              d.eventType === "repair" ? "수리 이력" :
              d.eventType === "vent" ? "Vent 완료" : "클리닝 완료"
            }`,
            occurredAt: d.occurredAt,
            color: d.eventType === "repair" ? "#ef4444" : "#22c55e",
            href: EQUIPMENT_BASE,
          });
        }
      }

      // 재고관리 로그
      if (invRes.status === "fulfilled" && Array.isArray(invRes.value)) {
        for (const d of invRes.value as { id: number; tableLabel: string; actionLabel: string; userName: string; occurredAt: string }[]) {
          items.push({
            id: `inv-${d.id}`,
            appName: "재고 관리",
            message: `${d.tableLabel} · ${d.actionLabel} (${d.userName})`,
            occurredAt: d.occurredAt,
            color: "#3b82f6",
            href: INVENTORY_BASE,
          });
        }
      }

      // 시간순 정렬 후 최근 10건
      items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
      setLogs(items.slice(0, 10));
    }).finally(() => setLoaded(true));
  }, []);

  return (
    <div className="bg-white rounded-[12px] p-4" style={{ border: "0.5px solid #e5e7eb" }}>
      <p style={{ fontSize: "11px", fontWeight: 500, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>
        활동 로그
      </p>

      {!loaded && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ height: "36px", background: "#f9fafb", borderRadius: "8px" }} />
          ))}
        </div>
      )}

      {loaded && logs.length === 0 && (
        <div style={{ textAlign: "center", padding: "24px 0" }}>
          <p style={{ fontSize: "12px", color: "#9ca3af" }}>활동 로그가 없습니다</p>
        </div>
      )}

      {loaded && logs.length > 0 && (
        <div>
          {logs.map((log, i) => (
            <a
              key={log.id}
              href={log.href}
              style={{
                display: "flex", alignItems: "flex-start", gap: "10px",
                padding: "8px 0",
                borderBottom: i < logs.length - 1 ? "0.5px solid #f9fafb" : "none",
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              <div style={{
                width: "6px", height: "6px", borderRadius: "50%",
                background: log.color, marginTop: "5px", flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: "12px", color: "#374151" }}>
                  <span style={{ color: "#9ca3af", marginRight: "4px" }}>{log.appName} ·</span>
                  {log.message}
                </span>
              </div>
              <div style={{ fontSize: "11px", color: "#9ca3af", whiteSpace: "nowrap", flexShrink: 0 }}>
                {timeAgo(log.occurredAt)}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
