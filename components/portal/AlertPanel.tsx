"use client";

import { useEffect, useState } from "react";

interface AlertItem {
  id: string;
  type: "warn" | "info" | "error";
  text: string;
  sub: string;
}

const EQUIPMENT_BASE = "https://equipment.vanam.synology.me";

const CERT_EXPIRY = new Date("2026-06-29");

export default function AlertPanel() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  useEffect(() => {
    const items: AlertItem[] = [];

    // HTTPS 인증서 만료 알림
    const daysLeft = Math.floor((CERT_EXPIRY.getTime() - Date.now()) / 86400000);
    if (daysLeft <= 90) {
      items.push({
        id: "cert",
        type: daysLeft <= 14 ? "error" : "warn",
        text: `HTTPS 인증서 만료 ${daysLeft}일 전`,
        sub: `인프라 · 갱신 필요`,
      });
    }

    // 장비관리 PM 이슈 조회
    fetch(`${EQUIPMENT_BASE}/api/dashboard`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
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
        setAlerts([...items]);
      })
      .catch(() => setAlerts(items));
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
