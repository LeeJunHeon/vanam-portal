"use client";

import { useEffect, useState, type DragEvent } from "react";
import { Package, Layers, Flame, type LucideIcon } from "lucide-react";
import AppCard from "@/components/portal/AppCard";

const INVENTORY_BASE = "https://inventory.vanam.synology.me";
const CHAMBER_BASE = "https://chamber.vanam.synology.me";      // 개발 예정
const EVAPORATOR_BASE = "https://evaporator.vanam.synology.me"; // 개발 예정

const STORAGE_KEY = "vanam-portal-card-order";

type CardId = "inventory" | "chamber" | "evaporator";
type CardStatus = "online" | "pending";

interface CardDef {
  id: CardId;
  icon: LucideIcon;
  iconBgColor: string;
  iconColor: string;
  title: string;
  description: string;
  status: CardStatus;
  href: string;
}

const CARDS: Record<CardId, CardDef> = {
  inventory: {
    id: "inventory",
    icon: Package,
    iconBgColor: "#eff6ff",
    iconColor: "#3b82f6",
    title: "재고관리",
    description: "웨이퍼·타겟·가스·소모품 입출고 및 바코드 추적",
    status: "online",
    href: INVENTORY_BASE,
  },
  chamber: {
    id: "chamber",
    icon: Layers,
    iconBgColor: "#f0fdfa",
    iconColor: "#0d9488",
    title: "CH1 & CH2",
    description: "스퍼터링 공정 런 기록·레시피 관리·타겟 추적",
    status: "pending",
    href: CHAMBER_BASE,
  },
  evaporator: {
    id: "evaporator",
    icon: Flame,
    iconBgColor: "#fffbeb",
    iconColor: "#d97706",
    title: "Evaporator",
    description: "DAC 제어·증착률·두께 실시간 모니터링",
    status: "pending",
    href: EVAPORATOR_BASE,
  },
};

const DEFAULT_ORDER: CardId[] = ["inventory", "chamber", "evaporator"];

function isCardId(v: unknown): v is CardId {
  return v === "inventory" || v === "chamber" || v === "evaporator";
}

function loadOrder(): CardId[] {
  if (typeof window === "undefined") return DEFAULT_ORDER;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ORDER;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_ORDER;
    const filtered = parsed.filter(isCardId) as CardId[];
    // 저장된 순서에 누락된 카드가 있으면 뒤에 덧붙임 (새 카드 추가 대응)
    const missing = DEFAULT_ORDER.filter((id) => !filtered.includes(id));
    return [...filtered, ...missing];
  } catch {
    return DEFAULT_ORDER;
  }
}

export default function AppCardGrid() {
  const [order, setOrder] = useState<CardId[]>(DEFAULT_ORDER);
  const [draggingId, setDraggingId] = useState<CardId | null>(null);
  const [dragOverId, setDragOverId] = useState<CardId | null>(null);

  // 클라이언트 마운트 후 저장된 순서 불러오기 (하이드레이션 미스매치 방지)
  useEffect(() => {
    setOrder(loadOrder());
  }, []);

  const saveOrder = (next: CardId[]) => {
    setOrder(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage 실패는 무시 (사파리 프라이빗 모드 등)
    }
  };

  const handleDragStart = (id: CardId) => (e: DragEvent<HTMLDivElement>) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
  };

  const handleDragOver = (id: CardId) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggingId && draggingId !== id && dragOverId !== id) {
      setDragOverId(id);
    }
  };

  const handleDragLeave = (id: CardId) => () => {
    if (dragOverId === id) setDragOverId(null);
  };

  const handleDrop = (targetId: CardId) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!draggingId || draggingId === targetId) {
      handleDragEnd();
      return;
    }
    const next = [...order];
    const fromIdx = next.indexOf(draggingId);
    const toIdx = next.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) {
      handleDragEnd();
      return;
    }
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, draggingId);
    saveOrder(next);
    handleDragEnd();
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {order.map((id) => {
        const card = CARDS[id];
        const isDragging = draggingId === id;
        const isOver = dragOverId === id && draggingId !== id;
        return (
          <div
            key={id}
            draggable
            onDragStart={handleDragStart(id)}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver(id)}
            onDragLeave={handleDragLeave(id)}
            onDrop={handleDrop(id)}
            className={[
              "rounded-[12px] transition-opacity",
              isDragging ? "opacity-50" : "",
              isOver ? "ring-2 ring-blue-400" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ cursor: "grab" }}
          >
            <AppCard
              icon={card.icon}
              iconBgColor={card.iconBgColor}
              iconColor={card.iconColor}
              title={card.title}
              description={card.description}
              status={card.status}
              href={card.href}
            />
          </div>
        );
      })}
    </div>
  );
}
