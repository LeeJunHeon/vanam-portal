"use client";

import { useState } from "react";
import { LayoutGrid, LogOut } from "lucide-react";
import { useSession, signOut } from "next-auth/react";

export default function TopBar() {
  const { data: session, status } = useSession();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const userName = session?.user?.name ?? "사용자";
  const isLoading = status === "loading";

  // 성의 첫 글자 (재고관리와 동일한 로직)
  const initial = (() => {
    if (!userName || userName === "사용자") return "?";
    const parts = userName.trim().split(" ");
    return parts[0].charAt(0).toUpperCase();
  })();

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-5 bg-white border-b border-gray-100"
        style={{ height: "56px" }}
      >
        {/* 좌측: 로고 */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <LayoutGrid size={16} color="white" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">VanaM</h1>
            <p className="text-[10px] text-gray-400 hidden sm:block">Platform</p>
          </div>
        </div>

        {/* 우측: 사용자 정보 + 로그아웃 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
              {isLoading ? "?" : initial}
            </div>
            <div className="flex-col hidden sm:flex">
              <p className="text-sm font-semibold text-gray-900">
                {isLoading ? "..." : userName}
              </p>
              <p className="text-[10px] text-gray-400">관리자</p>
            </div>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
              title="로그아웃"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* 로그아웃 확인 모달 */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">로그아웃</h3>
            <p className="text-sm text-gray-500">로그아웃 하시겠습니까?</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200"
              >
                취소
              </button>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="px-4 py-2 text-sm font-bold text-white bg-rose-500 rounded-xl hover:bg-rose-600 transition-colors"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
