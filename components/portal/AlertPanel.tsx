"use client";

import { useEffect, useState } from "react";

interface AlertItem {
  id: string;
  type: "warn" | "info" | "error";
  text: string;
  sub: string;
}

const EQUIPMENT_BASE = "/equipment";

function getJson(url: string, init?: RequestInit) {
  return fetch(url, init).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  });
}

export default function AlertPanel() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    // 인증서 상태와 장비 대시보드를 함께 조회 — 하나가 실패해도 나머지 알림은 표시
    Promise.allSettled([
      getJson("/api/cert-status"),
      getJson(`${EQUIPMENT_BASE}/api/dashboard`, { credentials: "include" }),
    ]).then(([certRes, equipRes]) => {
      if (cancelled) return;
      const items: AlertItem[] = [];

      // HTTPS 인증서 알림 (서버가 실제 인증서를 읽어 판정, ok 면 알림 없음)
      if (certRes.status === "fulfilled") {
        const c = certRes.value;
        if (c?.status === "warn" || c?.status === "error" || c?.status === "unknown") {
          items.push({
            id: "cert",
            type: c.status === "error" ? "error" : "warn",
            text: c.title,
            sub: c.detail,
          });
        }
      }

      // 장비관리 PM 이슈
      const d = equipRes.status === "fulfilled" ? equipRes.value : null;
      if (d) {
        if (d.pmIssueCount > 0) {
          items.push({
            id: "pm",
            type: "warn",
            text: `정기 점검 필요 장비 ${d.pmIssueCount}대`,
            sub: `장비 관리 · 방금`,
          });
        }
        if (d.totalUnresolved > 0) {
          items.push({
            id: "repair",
            type: "error",
            text: `미해결 수리 ${d.totalUnresolved}건`,
            sub: `장비 관리 · 처리 필요`,
          });
        }
      }

      setAlerts(items);
    });

    return () => { cancelled = true; };
  }, []);

  const iconBg: Record<string, string> = { warn: "#fef9c3", error: "#fee2e2", info: "#e0f2fe" };
  const iconText: Record<string, string> = { warn: "#854d0e", error: "#991b1b", info: "#0c4a6e" };
  const iconChar: Record<string, string> = { warn: "!", error: "!", info: "i" };

  return (
    <div className="bg-white rounded-[12px] p-4" style={{ border: "0.5px solid #e5e7eb" }}>
      <p style={{ fontSize: "11px", fontWeight: 500, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>
        알림
      </p>

      {alerts.length === 0 && (
        <p style={{ fontSize: "12px", color: "#9ca3af", textAlign: "center", padding: "16px 0" }}>새로운 알림이 없습니다</p>
      )}

      {alerts.map((alert, i) => (
        <div key={alert.id} style={{
          display: "flex", gap: "8px", alignItems: "flex-start",
          padding: "7px 0",
          borderBottom: i < alerts.length - 1 ? "0.5px solid #f9fafb" : "none",
        }}>
          <div style={{
            width: "18px", height: "18px", borderRadius: "5px", flexShrink: 0,
            background: iconBg[alert.type], color: iconText[alert.type],
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "10px", fontWeight: 700,
          }}>
            {iconChar[alert.type]}
          </div>
          <div>
            <div style={{ fontSize: "11px", color: "#374151", lineHeight: 1.4 }}>{alert.text}</div>
            <div style={{ fontSize: "10px", color: "#9ca3af" }}>{alert.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
