"use client";

import { useEffect, useState } from "react";
import { Package, Clock, ExternalLink } from "lucide-react";

const INVENTORY_URL = "https://inventory.vanam.synology.me";

interface PortalSummary {
  totalItems: number;
  todayIn: number;
  shortageCount: number;
}

export default function FeaturedApp() {
  const [data, setData] = useState<PortalSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portal-summary")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((json) => {
        if (cancelled) return;
        setData({
          totalItems: Number(json.totalItems ?? 0),
          todayIn: Number(json.todayIn ?? 0),
          shortageCount: Number(json.shortageCount ?? 0),
        });
      })
      .catch(() => {
        // fetch 실패 시 "--" 유지
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const display = (v: number | undefined) => (v === undefined ? "--" : v);

  return (
    <div
      className="bg-white rounded-[14px] p-5 transition-colors"
      style={{ border: "0.5px solid #e5e7eb" }}
      onMouseEnter={undefined}
    >
      {/* 카드 헤더 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-xl"
            style={{
              width: "40px",
              height: "40px",
              backgroundColor: "#eff6ff",
            }}
          >
            <Package size={20} color="#3b82f6" strokeWidth={1.8} />
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="rounded-full font-semibold"
              style={{
                fontSize: "9px",
                padding: "2px 7px",
                backgroundColor: "#dcfce7",
                color: "#16a34a",
              }}
            >
              운영중
            </span>
            <span
              className="rounded-full font-semibold"
              style={{
                fontSize: "9px",
                padding: "2px 7px",
                backgroundColor: "#eff6ff",
                color: "#3b82f6",
              }}
            >
              주요
            </span>
          </div>
        </div>
      </div>

      {/* 제목 & 설명 */}
      <h2 className="font-bold text-gray-900 mb-1" style={{ fontSize: "15px" }}>
        재고관리 시스템
      </h2>
      <p className="text-gray-500 leading-relaxed mb-4" style={{ fontSize: "12px" }}>
        웨이퍼·타겟·가스·소모품의 입출고, 바코드 기반 추적, 타겟 lifecycle을 통합 관리합니다
      </p>

      {/* 통계 3칸 */}
      <div
        className="grid grid-cols-3 rounded-xl overflow-hidden mb-4"
        style={{ border: "0.5px solid #e5e7eb" }}
      >
        <div className="px-4 py-3 text-center">
          <div className="font-bold text-gray-900 mb-0.5" style={{ fontSize: "18px" }}>
            {display(data?.totalItems)}
          </div>
          <div className="text-gray-400 font-medium" style={{ fontSize: "11px" }}>
            총 품목
          </div>
        </div>
        <div
          className="px-4 py-3 text-center"
          style={{ borderLeft: "0.5px solid #e5e7eb", borderRight: "0.5px solid #e5e7eb" }}
        >
          <div className="font-bold text-gray-900 mb-0.5" style={{ fontSize: "18px" }}>
            {display(data?.todayIn)}
          </div>
          <div className="text-gray-400 font-medium" style={{ fontSize: "11px" }}>
            오늘 거래
          </div>
        </div>
        <div className="px-4 py-3 text-center">
          <div className="font-bold text-gray-900 mb-0.5" style={{ fontSize: "18px" }}>
            {display(data?.shortageCount)}
          </div>
          <div className="text-gray-400 font-medium" style={{ fontSize: "11px" }}>
            재고 부족
          </div>
        </div>
      </div>

      {/* 하단 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-gray-400" style={{ fontSize: "11px" }}>
          <Clock size={11} strokeWidth={1.8} />
          <span>최근 접속 · --</span>
        </div>
        <a
          href={INVENTORY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-lg font-semibold transition-colors hover:bg-blue-600"
          style={{
            fontSize: "12px",
            padding: "6px 14px",
            backgroundColor: "#3b82f6",
            color: "#ffffff",
          }}
        >
          <span>열기</span>
          <ExternalLink size={11} strokeWidth={2} />
        </a>
      </div>
    </div>
  );
}
