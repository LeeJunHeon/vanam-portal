"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function saveSubscription(sub: PushSubscription): Promise<void> {
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
}

async function subscribeAndSave(reg: ServiceWorkerRegistration): Promise<void> {
  const res = await fetch("/api/push/vapid-public-key");
  if (!res.ok) throw new Error("vapid key fetch 실패");
  const { key } = (await res.json()) as { key: string };
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
  });
  await saveSubscription(sub);
}

export default function PushManager() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    // 임베드 iframe 안에서는 실행하지 않음 (앱 화면 위에서 알림 권한 팝업이 뜨는 것 방지)
    try { if (window.self !== window.top) return; } catch { return; }
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        if (cancelled) return;

        if (Notification.permission === "granted") {
          // 이미 허용됨 → 조용히 구독 동기화(멱등)
          const existing = await reg.pushManager.getSubscription();
          if (existing) await saveSubscription(existing);
          else await subscribeAndSave(reg);
        } else if (Notification.permission === "default") {
          // 첫 실행: 모든 기기에서 한 번만 팝업으로 물어봄
          const perm = await Notification.requestPermission();
          if (perm === "granted" && !cancelled) await subscribeAndSave(reg);
        }
        // denied: 다시 묻지 않음(브라우저가 차단 상태 기억)
      } catch (e) {
        console.error("[push] init 실패", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  return null;
}
