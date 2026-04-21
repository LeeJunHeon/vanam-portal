"use client";

import { useEffect, useState } from "react";

interface NasData {
  cpu: number;
  ram: { used: number; total: number };
  disk: { used: number; total: number };
  uptimeDays: number;
  containers: Record<string, string>;
}

const CONTAINER_LABELS: Record<string, { label: string; port: string }> = {
  portal: { label: "portal", port: ":3999" },
  "inventory-web-nextjs": { label: "inventory-web", port: ":3000" },
  "equipment-web-nextjs": { label: "equipment-web", port: ":3003" },
  postgres: { label: "postgres", port: ":5432" },
};

function MetricBar({ label, value, max, unit, color }: {
  label: string; value: number; max: number; unit: string; color: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const display = max > 0 ? `${value} / ${max} ${unit}` : "--";
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "3px" }}>
        <span style={{ color: "#9ca3af" }}>{label}</span>
        <span style={{ color: "#374151", fontWeight: 500 }}>{display}</span>
      </div>
      <div style={{ background: "#f3f4f6", borderRadius: "3px", height: "4px" }}>
        <div style={{ width: `${pct}%`, height: "4px", borderRadius: "3px", background: color, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

export default function ServerStatus() {
  const [data, setData] = useState<NasData | null>(null);

  useEffect(() => {
    fetch("/api/nas-status")
      .then((r) => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => {});

    const timer = setInterval(() => {
      fetch("/api/nas-status")
        .then((r) => r.ok ? r.json() : null)
        .then(setData)
        .catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {/* NAS 리소스 */}
      <div className="bg-white rounded-[12px] p-4" style={{ border: "0.5px solid #e5e7eb" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <p style={{ fontSize: "11px", fontWeight: 500, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            서버 상태
          </p>
          {data?.uptimeDays !== undefined && data.uptimeDays >= 0 && (
            <span style={{ fontSize: "10px", color: "#9ca3af" }}>업타임 {data.uptimeDays}일</span>
          )}
        </div>
        <MetricBar
          label="CPU"
          value={data?.cpu ?? 0}
          max={100}
          unit="%"
          color="#3b82f6"
        />
        <MetricBar
          label="RAM"
          value={data?.ram.used ?? 0}
          max={data?.ram.total ?? 0}
          unit="GB"
          color="#8b5cf6"
        />
        <MetricBar
          label="디스크"
          value={data?.disk.used ?? 0}
          max={data?.disk.total ?? 0}
          unit="GB"
          color="#22c55e"
        />
      </div>

      {/* 컨테이너 */}
      <div className="bg-white rounded-[12px] p-4" style={{ border: "0.5px solid #e5e7eb" }}>
        <p style={{ fontSize: "11px", fontWeight: 500, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
          컨테이너
        </p>
        {Object.entries(CONTAINER_LABELS).map(([key, { label, port }]) => {
          const status = data?.containers[key] ?? "unknown";
          const isRunning = status === "running";
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "0.5px solid #f9fafb" }}>
              <div>
                <div style={{ fontSize: "12px", color: "#374151", fontWeight: 500 }}>{label}</div>
                <div style={{ fontSize: "10px", color: "#9ca3af" }}>{port}</div>
              </div>
              <span style={{
                fontSize: "9px", fontWeight: 600, padding: "2px 8px", borderRadius: "9999px",
                background: isRunning ? "#dcfce7" : status === "unknown" ? "#f3f4f6" : "#fee2e2",
                color: isRunning ? "#16a34a" : status === "unknown" ? "#6b7280" : "#dc2626",
              }}>
                {isRunning ? "실행중" : status === "unknown" ? "확인중" : "중지"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
