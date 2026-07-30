"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import ChatWidget from "./ChatWidget";

// 플로팅 챗봇 게이트:
// 1) 포털이 iframe(임베드) 안에서 열린 경우 렌더하지 않음
//    → /widget 임베드 인스턴스와 중복 실행(localStorage 이중 기록) 방지
// 2) /widget 경로에서도 렌더하지 않음 (임베드 페이지 위 플로팅 버튼 중복 방지)
export default function ChatWidgetGate() {
  const pathname = usePathname();
  const [topLevel, setTopLevel] = useState(false);

  useEffect(() => {
    try {
      setTopLevel(window.self === window.top);
    } catch {
      setTopLevel(false); // window.top 접근 불가 = iframe 안
    }
  }, []);

  if (!topLevel) return null;
  if (pathname === "/widget") return null;
  return <ChatWidget />;
}
