"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AppKey, type Catalog, type MenuItem,
  addPin, flattenCatalog, groupAllMenus, moveItem, normalizeAppOrder, removePin, reorderPinned,
  selectPinned, toggleHidden, EMPTY_PREFS, FREQUENT_MAX,
} from "@/lib/launcher";
import { PORTAL_APPS } from "@/lib/portal-apps";
import ActivityLog from "@/components/portal/ActivityLog";
import ServerStatus from "@/components/portal/ServerStatus";
import AlertPanel from "@/components/portal/AlertPanel";
import { useToday } from "@/components/portal/today/TodayProvider";
import { TodayMobileCard, TodayPanel } from "@/components/portal/today/TodayHome";
import AppColumn from "./AppColumn";
import FavoritesSection from "./FavoritesSection";
import FrequentSection from "./FrequentSection";
import AllMenusSection from "./AllMenusSection";
import EditBanner from "./EditBanner";
import ConfirmModal from "./ConfirmModal";
import Toast from "./Toast";
import { useAppSummaries } from "./useAppSummaries";
import { useLauncher } from "./useLauncher";
import { useNasStatus } from "./useNasStatus";

const TOAST_MS = 2500;

// 포털 첫 화면: 왼쪽 앱 열 · 가운데 런처(즐겨찾기·자주 쓰는 메뉴·전체 메뉴)와 활동 로그 · 오른쪽 서버 상태·알림
// 1600px 이상은 가운데와 서버 상태 사이에 업무 비서 '오늘' 패널(4단), 768px 미만은 맨 위에 '오늘' 카드
export default function PortalHome() {
  // 서버 상태는 여기서 한 번만 불러 서버 상태 카드와 앱 카드 뱃지가 같이 쓴다
  const nas = useNasStatus();
  const summaries = useAppSummaries(nas.data?.containers ?? null);
  // 업무 비서 타일 요약은 '오늘' 응답을 다시 쓴다(못 받으면 설명 문구 그대로)
  const today = useToday()?.data;
  const appSummaries = today
    ? {
        ...summaries.apps,
        assistant: {
          ...summaries.apps.assistant,
          stat1: `신규 ${today.counts.new} · 오늘 마감 ${today.counts.today} · 진행 ${today.counts.active}`,
        },
      }
    : summaries.apps;
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const onSaveError = useCallback(() => showToast("저장하지 못했습니다. 잠시 후 다시 시도해 주세요."), [showToast]);
  const launcher = useLauncher(onSaveError);
  const { prefs, updatePrefs } = launcher;

  const [editing, setEditing] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [clearTarget, setClearTarget] = useState<MenuItem | null>(null);

  // 경영지원 등 관리자 전용 앱은 admin·CEO 만
  const isVisible = (app: AppKey) => !PORTAL_APPS[app].adminOnly || summaries.isAdmin;
  const fullOrder = normalizeAppOrder(prefs.appOrder);
  const order = fullOrder.filter(isVisible);
  const visibleCatalog: Catalog = {};
  for (const app of order) if (launcher.catalog[app]) visibleCatalog[app] = launcher.catalog[app];
  const flat = flattenCatalog(visibleCatalog, order);
  const byKey = new Map(flat.map((m) => [m.key, m]));

  const pinnedSet = new Set(prefs.pinned);
  const hiddenSet = new Set(prefs.hidden);
  const clearedSet = new Set(launcher.cleared);
  const pinnedItems = selectPinned(prefs.pinned, flat);
  // 순서는 데이터를 받을 때 정해 두고, 보는 동안엔 즐겨찾기·숨김·기록 지우기로 빠지는 것만 반영
  const frequentItems = launcher.frequent
    .map((k) => byKey.get(k))
    .filter((m): m is MenuItem => m !== undefined)
    .slice(0, FREQUENT_MAX)
    .filter((m) => !pinnedSet.has(m.key) && !hiddenSet.has(m.key) && !clearedSet.has(m.key));
  const groups = groupAllMenus(visibleCatalog, order);

  const handleAddPin = (key: string) => {
    let full = false;
    updatePrefs((p) => {
      const r = addPin(p, key);
      if (r.error === "limit") full = true;
      return r.prefs;
    });
    if (full) showToast("즐겨찾기는 30개까지 넣을 수 있습니다.");
  };
  const handleTogglePin = (key: string) => {
    if (pinnedSet.has(key)) updatePrefs((p) => removePin(p, key));
    else handleAddPin(key);
  };
  const handleMovePin = (from: string, to: string) => {
    const visibleOrder = moveItem(pinnedItems.map((m) => m.key), from, to);
    updatePrefs((p) => ({ ...p, pinned: reorderPinned(p.pinned, visibleOrder) }));
  };
  const handleMoveApp = (from: AppKey, to: AppKey) => {
    updatePrefs((p) => ({ ...p, appOrder: moveItem(normalizeAppOrder(p.appOrder), from, to) }));
  };
  const startEdit = () => {
    setEditing(true);
    setAllOpen(true);
  };
  const finishEdit = () => {
    launcher.flush();
    setEditing(false);
  };
  const doClearUsage = async () => {
    const target = clearTarget;
    setClearTarget(null);
    if (!target) return;
    const ok = await launcher.clearUsage(target.key);
    showToast(ok ? "사용 기록을 지웠습니다." : "지우지 못했습니다. 잠시 후 다시 시도해 주세요.");
  };
  const doReset = () => {
    setConfirmReset(false);
    updatePrefs(() => ({ ...EMPTY_PREFS }), { rerank: true, immediate: true });
  };

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-4 mx-auto pt-[72px] pb-8 px-4 sm:px-5 max-w-[1360px] min-[1600px]:max-w-[1880px]">
        <TodayMobileCard />

        <aside className="lg:w-[220px] lg:flex-shrink-0 min-w-0" aria-label="앱">
          <AppColumn order={order} summaries={appSummaries} editing={editing} onMove={handleMoveApp} />
        </aside>

        <main className="flex-1 min-w-0 flex flex-col gap-4">
          {editing && <EditBanner onReset={() => setConfirmReset(true)} onDone={finishEdit} />}

          <div className="bg-white rounded-[12px] p-4 flex flex-col gap-6" style={{ border: "0.5px solid #e5e7eb" }}>
            <FavoritesSection
              items={pinnedItems}
              ready={launcher.ready}
              editing={editing}
              canEdit={launcher.synced}
              onEdit={startEdit}
              onRemove={(key) => updatePrefs((p) => removePin(p, key))}
              onMove={handleMovePin}
            />
            <FrequentSection
              items={frequentItems}
              ready={launcher.ready}
              editing={editing}
              onAdd={handleAddPin}
              onClear={setClearTarget}
            />
          </div>

          <AllMenusSection
            groups={groups}
            ready={launcher.ready}
            open={allOpen}
            editing={editing}
            pinned={pinnedSet}
            hidden={hiddenSet}
            onToggleOpen={() => setAllOpen((v) => !v)}
            onTogglePin={handleTogglePin}
            onToggleHidden={(key) => updatePrefs((p) => toggleHidden(p, key))}
          />

          <ActivityLog />
        </main>

        <TodayPanel />

        <aside className="flex flex-col gap-4 lg:w-[260px] lg:flex-shrink-0">
          <ServerStatus data={nas.data} stale={nas.stale} />
          <AlertPanel data={nas.data} stale={nas.stale} />
        </aside>
      </div>

      {confirmReset && (
        <ConfirmModal
          title="초기화"
          message="즐겨찾기·숨김·앱 순서를 처음 상태로 되돌립니다. 사용 기록은 지우지 않습니다."
          confirmLabel="초기화"
          onCancel={() => setConfirmReset(false)}
          onConfirm={doReset}
        />
      )}
      {clearTarget && (
        <ConfirmModal
          title="사용 기록 지우기"
          message={`'${clearTarget.label}' 사용 기록을 지웁니다. 자주 쓰는 메뉴에서 빠지고, 다시 사용하면 새로 쌓입니다.`}
          confirmLabel="지우기"
          onCancel={() => setClearTarget(null)}
          onConfirm={() => void doClearUsage()}
        />
      )}
      <Toast message={toast} />
    </>
  );
}
