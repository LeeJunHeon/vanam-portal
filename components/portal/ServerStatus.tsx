"use client";

import { useEffect, useState } from "react";

interface NasData {
  cpu: number;
  ram: { used: number; total: number };
  disk: { used: number; total: number };
  uptimeDays: number;
}

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

interface CertData {
  status: "ok" | "warn" | "error" | "unknown";
  expiresAtKst: string | null;
  daysLeft: number | null;
}

export default function ServerStatus() {
  const [data, setData] = useState<NasData | null>(null);
  const [cert, setCert] = useState<CertData | null>(null);

  // 인증서 상태는 마운트 때 한 번만 (서버가 6시간 캐시)
  useEffect(() => {
    fetch("/api/cert-status")
      .then((r) => r.ok ? r.json() : null)
      .then(setCert)
      .catch(() => {});
  }, []);

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
        {cert && (
          <div style={{
            borderTop: "0.5px solid #f3f4f6", paddingTop: "8px", marginTop: "2px",
            fontSize: "11px",
            color: cert.status === "error" ? "#dc2626" : cert.status === "warn" ? "#ea580c" : "#9ca3af",
          }}>
            {cert.status === "unknown" || !cert.expiresAtKst
              ? "HTTPS 인증서 · 확인 실패"
              : `HTTPS 인증서 · ${cert.expiresAtKst.slice(0, 10)}까지 (${cert.daysLeft}일)`}
          </div>
        )}
      </div>
    </div>
  );
}
