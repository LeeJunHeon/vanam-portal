"use client";

import { useEffect, useState } from "react";
import type { NasStatus } from "@/components/portal/home/useNasStatus";

// 기준 시각 표시: 컨테이너·브라우저 TZ 와 상관없이 KST "HH:mm:ss"
const KST_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function MetricBar({ label, value, max, unit, color, extra }: {
  label: string; value: number | null; max: number; unit: string; color: string; extra?: string;
}) {
  const ok = value !== null && max > 0;
  const pct = ok ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  const display = ok ? `${value} / ${max} ${unit}` : "--";
  return (
    <div style={{ marginBottom: "10px" }}>
      {/* 좁은 패널에서 줄바꿈돼도 막대와 겹치지 않도록 글자 줄과 막대를 분리 */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        flexWrap: "wrap", columnGap: "6px", fontSize: "11px", lineHeight: 1.4, marginBottom: "3px",
      }}>
        <span style={{ color: "#9ca3af" }}>{label}</span>
        <span style={{ color: "#374151", fontWeight: 500, marginLeft: "auto", textAlign: "right" }}>
          {display}
          {extra && <span style={{ fontSize: "10px", color: "#9ca3af", fontWeight: 400 }}> {extra}</span>}
        </span>
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

function certLine(cert: CertData): string {
  if (cert.status === "unknown" || !cert.expiresAtKst || cert.daysLeft === null) return "HTTPS 인증서 · 확인 실패";
  const date = cert.expiresAtKst.slice(0, 10);
  if (cert.daysLeft < 0) return `HTTPS 인증서 · 만료됨 (${date})`;
  return `HTTPS 인증서 · ${date}까지 (${cert.daysLeft}일)`;
}

// 서버 상태 카드. 데이터 갱신은 useNasStatus(PortalHome) 한 곳에서만 하고 여기선 그리기만 한다.
export default function ServerStatus({ data, stale }: { data: NasStatus | null; stale: boolean }) {
  const [cert, setCert] = useState<CertData | null>(null);

  // 인증서 상태는 마운트 때 한 번만 (서버가 6시간 캐시)
  useEffect(() => {
    fetch("/api/cert-status")
      .then((r) => r.ok ? r.json() : null)
      .then(setCert)
      .catch(() => {});
  }, []);

  const sampledTime = data?.sampledAt ? KST_TIME.format(new Date(data.sampledAt)) : null;
  const hasUptime = data?.uptimeDays !== undefined && data.uptimeDays >= 0;
  const ioWait = data?.ioWait ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {/* NAS 리소스 */}
      <div className="bg-white rounded-[12px] p-4" style={{ border: "0.5px solid #e5e7eb" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", columnGap: "8px", marginBottom: "12px" }}>
          <p style={{ fontSize: "11px", fontWeight: 500, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            서버 상태
          </p>
          {(hasUptime || sampledTime) && (
            <span style={{ fontSize: "10px", color: "#9ca3af", marginLeft: "auto" }}>
              {hasUptime && `업타임 ${data!.uptimeDays}일`}
              {hasUptime && sampledTime && " · "}
              {sampledTime && (
                <span style={stale ? { color: "#ea580c" } : undefined}>
                  {sampledTime} 기준{stale && " (갱신 지연)"}
                </span>
              )}
            </span>
          )}
        </div>
        <MetricBar
          label="CPU"
          value={data?.cpu ?? null}
          max={100}
          unit="%"
          color="#3b82f6"
          extra={ioWait !== null && ioWait >= 5 ? `· I/O 대기 ${ioWait}%` : undefined}
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
            {certLine(cert)}
          </div>
        )}
      </div>
    </div>
  );
}
