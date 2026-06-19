"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Mic, Trash2, Camera, Images } from "lucide-react";
import { useSession } from "next-auth/react";
import BarcodeCameraScanner from "./BarcodeCameraScanner";

type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image_url"; image_url: { url: string } };
type ContentPart = TextPart | ImagePart;

interface ChatMessage {
  role: "user" | "assistant";
  content: string | ContentPart[];
}

// 스키마 (포털 /api/schemas 응답)
interface SchemaField { name: string; label: string; type: string; required?: boolean; auto?: boolean | string; }
interface SchemaOp {
  id: string;
  label: string;
  app?: string;            // "equipment"면 장비 프록시로 라우팅 (없으면 inventory)
  cardTitle?: string;
  cardShow?: string[];     // 카드에 보일 필드명 순서
  fields?: SchemaField[];
}
// gemma가 출력한 작업 데이터
interface OperationData {
  opId: string;
  values: Record<string, unknown>;  // 수집된 필드값들 (itemName 등 이름 포함)
}

// 화면 표시용 메시지(첨부 이미지 미리보기 포함)
interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
  imageUrl?: string;
  isError?: boolean;
  createdAt: number; // 메시지 생성 시각(epoch ms)
  proposal?: OperationData;
  proposalStatus?: "pending" | "confirmed" | "cancelled" | "submitting" | "done" | "failed";
  scanRequest?: boolean; // gemma가 <<SCAN>> 보냄 → 채팅에 카메라/갤러리 버튼 표시
  datetimeRequest?: boolean; // gemma가 <<DATETIME>> 보냄 → 채팅에 날짜·시간 선택기 표시
}

// ─────────────────────────────────────────────
// 시간/날짜 포맷터
// ─────────────────────────────────────────────
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
}
function formatDateLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return "오늘";
  }
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}
function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

// ─────────────────────────────────────────────
// Web Speech API 타입 (브라우저 전역, 표준 d.ts에는 없음)
// ─────────────────────────────────────────────
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

// ─────────────────────────────────────────────
// 이미지 리사이즈 (긴 변 1024px, JPEG q=0.8) → dataURL
// ─────────────────────────────────────────────
async function resizeImageToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  let width: number;
  let height: number;
  let drawSource: CanvasImageSource;

  if (bitmap) {
    width = bitmap.width;
    height = bitmap.height;
    drawSource = bitmap;
  } else {
    // createImageBitmap 미지원 환경(폴백)
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    width = img.naturalWidth;
    height = img.naturalHeight;
    drawSource = img;
    URL.revokeObjectURL(url);
  }

  const MAX = 1024;
  const longest = Math.max(width, height);
  const scale = longest > MAX ? MAX / longest : 1;
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(drawSource, 0, 0, targetW, targetH);
  return canvas.toDataURL("image/jpeg", 0.8);
}

// ─────────────────────────────────────────────
// 이미지 파일에서 바코드 디코드 시도 (zxing).
// 성공 → 바코드 문자열, 실패/바코드 없음 → null.
// ─────────────────────────────────────────────
async function decodeBarcodeFromFile(file: File): Promise<string | null> {
  try {
    const { BrowserMultiFormatReader } = await import("@zxing/browser");
    const reader = new BrowserMultiFormatReader();
    const url = URL.createObjectURL(file);
    try {
      const result = await reader.decodeFromImageUrl(url);
      return result?.getText()?.trim() || null;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null; // NotFoundException 등 → 바코드 없음
  }
}

// ─────────────────────────────────────────────
// 작업 데이터 마커 파싱
// <<DATA>> { "opId":"...", "필드":"값", ... } <<END>> 형태를 추출.
// 실패하면 null 반환(호출부에서 일반 텍스트로 폴백).
// ─────────────────────────────────────────────
function parseOperationData(content: string): { data: OperationData; cleanedText: string } | null {
  const match = content.match(/<<DATA>>([\s\S]*?)<<END>>/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[1].trim()) as Record<string, unknown>;
    const opId = typeof obj.opId === "string" ? obj.opId : "";
    if (!opId) return null;
    // values = opId를 제외한 나머지 전부
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k !== "opId") values[k] = v;
    }
    const cleanedText = content.replace(match[0], "").trim();
    return { data: { opId, values }, cleanedText };
  } catch {
    return null;
  }
}

// <<SCAN>> 마커 감지: gemma가 바코드 스캔 버튼을 요청. 마커는 텍스트에서 제거.
function parseScanRequest(content: string): { isScan: boolean; cleanedText: string } {
  if (!content.includes("<<SCAN>>")) return { isScan: false, cleanedText: content };
  const cleanedText = content.replace(/<<SCAN>>/g, "").trim();
  return { isScan: true, cleanedText };
}

// <<DATETIME>> 마커 감지: gemma가 날짜·시간 선택기를 요청. 마커는 텍스트에서 제거.
function parseDatetimeRequest(content: string): { isDatetime: boolean; cleanedText: string } {
  if (!content.includes("<<DATETIME>>")) return { isDatetime: false, cleanedText: content };
  const cleanedText = content.replace(/<<DATETIME>>/g, "").trim();
  return { isDatetime: true, cleanedText };
}

// <<QUERY>> { "queryId":"...", "params":{...} } <<END>> 형태를 추출. (읽기 조회 요청)
function parseQueryRequest(content: string): { queryId: string; params: Record<string, unknown>; cleanedText: string } | null {
  const match = content.match(/<<QUERY>>([\s\S]*?)<<END>>/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[1].trim()) as Record<string, unknown>;
    const queryId = typeof obj.queryId === "string" ? obj.queryId : "";
    if (!queryId) return null;
    const params =
      obj.params && typeof obj.params === "object" && !Array.isArray(obj.params)
        ? (obj.params as Record<string, unknown>)
        : {};
    const cleanedText = content.replace(match[0], "").trim();
    return { queryId, params, cleanedText };
  } catch {
    return null;
  }
}

// 조회 결과(데이터) → 사람이 읽을 텍스트. queryId별 표시. 모르면 폴백.
function formatQueryResult(queryId: string, data: unknown): string {
  const d = (data ?? {}) as Record<string, unknown>;
  if (queryId === "my_annual_leave") {
    if (d.mapped === false) {
      return "연차 정보가 등록되어 있지 않습니다. 관리자에게 직원 등록을 요청하세요.";
    }
    return `${d.year}년 잔여 연차: ${d.remaining}일 (부여 ${d.granted} / 사용 ${d.used})`;
  }
  if (queryId === "my_attendance") {
    if (d.mapped === false) return "근태 정보가 등록되어 있지 않습니다.";
    const recs = (Array.isArray(d.records) ? d.records : []) as Array<Record<string, unknown>>;
    if (recs.length === 0) return `${d.month} 근태 기록이 없습니다.`;
    const hm = (iso: unknown) => {
      if (!iso) return "-";
      const t = new Date(String(iso)).getTime() + 9 * 60 * 60 * 1000;
      return new Date(t).toISOString().slice(11, 16);
    };
    return `${d.month} 근태 기록:\n` + recs.map((r) => {
      if (r.categoryName) return `· ${r.workDate} ${r.categoryName}`;
      const wm = typeof r.workMinutes === "number" ? r.workMinutes : 0;
      return `· ${r.workDate} 출근 ${hm(r.checkIn)} 퇴근 ${hm(r.checkOut)} (${Math.floor(wm / 60)}h${wm % 60}m)`;
    }).join("\n");
  }
  if (queryId === "my_requests") {
    if (d.mapped === false) return "근태 정보가 등록되어 있지 않습니다.";
    const reqs = (Array.isArray(d.requests) ? d.requests : []) as Array<Record<string, unknown>>;
    if (reqs.length === 0) return "신청 내역이 없습니다.";
    return "내 신청 내역:\n" + reqs.map((r) =>
      `· ${r.categoryName ?? "?"} ${r.startDate}~${r.endDate} [${r.status}]`
    ).join("\n");
  }
  if (queryId === "my_stats") {
    if (d.mapped === false) return "근태 정보가 등록되어 있지 않습니다.";
    return `${d.month} 내 근태 통계:\n· 출근 ${d.attended}일\n· 휴가 ${d.leaveDays}일\n· 신청 대기 ${d.pending}건\n· 승인됨 ${d.completed}건`;
  }
  if (queryId === "external_work") {
    const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return "외근 신청 내역이 없습니다.";
    return "외근 현황:\n" + rows.slice(0, 30).map((r) =>
      `· ${r.employeeName ?? "?"}(${r.departmentName ?? "-"}) ${r.startDate}~${r.endDate} [${r.status}]`
    ).join("\n");
  }
  if (queryId === "employee_list") {
    const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return "직원이 없습니다.";
    return "직원 목록:\n" + rows.slice(0, 50).map((r) =>
      `· ${r.name ?? "?"} (${r.employeeNo ?? "-"}) ${r.departmentName ?? ""} ${r.positionName ?? ""}`.trim()
    ).join("\n");
  }
  if (queryId === "attendance_categories") {
    const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return "근태 항목이 없습니다.";
    return "근태 항목:\n" + rows.map((r) =>
      `· ${r.name ?? "?"} (${r.code ?? "-"})`
    ).join("\n");
  }
  return "조회 결과를 표시할 수 없습니다.";
}

// 확인 카드 내용 생성: 스키마 cardShow 기반. op 없거나 cardShow 없으면 values 나열(폴백).
// id_ref 필드는 이름값(...Name)을 우선 표시. 값 없는 필드는 건너뜀.
function buildCard(
  op: SchemaOp | undefined,
  data: OperationData
): { title: string; rows: { label: string; value: string }[] } {
  const title = op?.cardTitle ?? op?.label ?? "확인";
  const rows: { label: string; value: string }[] = [];
  const toText = (v: unknown): string =>
    v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);

  if (op?.cardShow && op.cardShow.length > 0) {
    for (const f of op.cardShow) {
      const nameKey = f.replace(/Id$/, "Name");
      const value = toText(data.values[nameKey] ?? data.values[f]);
      if (value === "") continue; // 값 없으면 줄 건너뜀
      const field = op.fields?.find((x) => x.name === f);
      rows.push({ label: field?.label ?? f, value });
    }
  } else {
    // 폴백: op 없음/ cardShow 없음 → values를 키-값으로 나열
    for (const [k, v] of Object.entries(data.values)) {
      const value = toText(v);
      if (value === "") continue;
      rows.push({ label: k, value });
    }
  }
  return { title, rows };
}

// ─────────────────────────────────────────────
// 대화 기록 로컬 저장 (사용자별 / 오늘 KST 날짜만)
// ─────────────────────────────────────────────
const CHAT_STORAGE_KEY = "vanam_chat_history";

interface StoredChat {
  email: string;
  date: string; // YYYY-MM-DD (KST)
  messages: ChatMessage[];
  displayMessages: DisplayMessage[];
}

function todayKst(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

export default function ChatWidget() {
  const { data: session } = useSession();
  const userEmail = session?.user?.email ?? null;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [datetimeValue, setDatetimeValue] = useState("");
  const [schemas, setSchemas] = useState<SchemaOp[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [cardPhotos, setCardPhotos] = useState<Record<number, string[]>>({});
  const photoCardIndexRef = useRef<number>(-1);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseInputRef = useRef<string>(""); // 인식 시작 시점의 입력값
  const restoredRef = useRef(false); // 대화 복원 1회 실행 플래그

  // 음성 인식 지원 여부 체크
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    setSpeechSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  // 작업 스키마 로드 (로그인 후 1회). 실패하면 빈 배열 유지(카드 폴백 동작).
  useEffect(() => {
    if (!userEmail) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/schemas", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setSchemas(data);
      } catch {
        /* 무시 → 빈 배열 유지 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userEmail]);

  // 메시지 추가 시 하단 스크롤
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [displayMessages, isSending, open]);

  // 패널 닫힐 때 음성 인식 정리
  useEffect(() => {
    if (!open && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setListening(false);
    }
  }, [open]);

  // 대화 복원: userEmail 확정 후 1회만. 같은 사용자 + 오늘 날짜일 때만 복원.
  useEffect(() => {
    if (restoredRef.current) return;
    if (typeof window === "undefined") return;
    if (!userEmail) return; // 세션 로딩 중이거나 비로그인 → 확정될 때까지 대기
    restoredRef.current = true;
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as Partial<StoredChat>;
      if (
        stored.email === userEmail &&
        stored.date === todayKst() &&
        Array.isArray(stored.messages) &&
        Array.isArray(stored.displayMessages)
      ) {
        setMessages(stored.messages);
        setDisplayMessages(stored.displayMessages);
      }
      // 조건 불일치(다른 사용자/지난 날짜)는 조용히 무시 — 다음 저장 때 갱신됨
    } catch {
      /* 파싱/접근 실패 → 무시 */
    }
  }, [userEmail]);

  // 대화 저장: messages/displayMessages 변경 시. 로그인 상태에서만.
  useEffect(() => {
    if (!restoredRef.current) return; // 복원 전 빈 상태로 덮어쓰지 않도록
    if (typeof window === "undefined") return;
    if (!userEmail) return;
    if (displayMessages.length === 0) return; // 빈 대화는 저장하지 않음(복원 직후 덮어쓰기 방지)
    try {
      const payload: StoredChat = {
        email: userEmail,
        date: todayKst(),
        messages,
        displayMessages,
      };
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* 용량 초과 등 → 무시 */
    }
  }, [messages, displayMessages, userEmail]);

  function handleClearChat() {
    setMessages([]);
    setDisplayMessages([]);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(CHAT_STORAGE_KEY);
      } catch {
        /* 무시 */
      }
    }
  }

  function appendDisplay(msg: DisplayMessage) {
    setDisplayMessages((prev) => [...prev, msg]);
  }

  // gemma에 보내는 대화 맥락(messages)만 초기화한다. displayMessages(화면 기록)는 유지.
  // 작업이 성공이든 실패든, 끝난 뒤 다음 작업이 깨끗한 맥락에서 시작하도록 호출한다.
  // (실패 맥락이 남으면 gemma가 다음 시도에서 같은 실수를 반복하므로 실패 시에도 호출한다.)
  const resetConversationContext = () => {
    setMessages([]);
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
        if (raw) {
          const stored = JSON.parse(raw) as { messages?: unknown; displayMessages?: unknown };
          stored.messages = [];
          window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(stored));
        }
      } catch {
        /* 무시 */
      }
    }
  };

  const handleConfirmProposal = async (index: number, data: OperationData) => {
    // submitting 표시
    setDisplayMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, proposalStatus: "submitting" } : m))
    );
    const op = schemas.find((s) => s.id === data.opId);
    const opLabel = op?.label ?? "작업";
    const writeEndpoint = op?.app === "equipment" ? "/api/equipment-write" : "/api/inventory-write";
    try {
      const res = await fetch(writeEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opId: data.opId, values: data.values, photos: cardPhotos[index] ?? [] }),
      });
      if (!res.ok) {
        const detail = await res.text();
        setDisplayMessages((prev) =>
          prev.map((m, i) => (i === index ? { ...m, proposalStatus: "failed" } : m))
        );
        appendDisplay({
          role: "assistant",
          text: `${opLabel} 실패: ${detail}`,
          isError: true,
          createdAt: Date.now(),
        });
        // 실패해도 맥락 초기화 → 다음 시도에서 gemma가 같은 실수를 반복하지 않도록.
        resetConversationContext();
        return;
      }
      await res.json().catch(() => ({}));
      setDisplayMessages((prev) =>
        prev.map((m, i) => (i === index ? { ...m, proposalStatus: "done" } : m))
      );
      appendDisplay({
        role: "assistant",
        text: `${opLabel} 완료되었습니다.`,
        createdAt: Date.now(),
      });
      // 작업 완료 → 다음 작업이 깨끗한 맥락에서 시작하도록 초기화.
      resetConversationContext();
    } catch {
      setDisplayMessages((prev) =>
        prev.map((m, i) => (i === index ? { ...m, proposalStatus: "failed" } : m))
      );
      appendDisplay({
        role: "assistant",
        text: `${opLabel} 처리 중 오류가 발생했습니다.`,
        isError: true,
        createdAt: Date.now(),
      });
      // 실패해도 맥락 초기화 → 다음 시도에서 gemma가 같은 실수를 반복하지 않도록.
      resetConversationContext();
    }
  };

  const handleCancelProposal = (index: number) => {
    setDisplayMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, proposalStatus: "cancelled" } : m))
    );
  };

  // 실제 전송 로직: 주어진 text와 image(dataURL)로 /api/chat에 보낸다.
  // send()(입력창)와 자동 전송(바코드 스캔 등) 양쪽에서 호출한다.
  async function sendMessage(rawText: string, image: string | null) {
    const text = rawText.trim();
    if ((!text && !image) || isSending) return;

    // user 메시지 구성: 이미지 있으면 content는 배열, 없으면 문자열
    let userMessage: ChatMessage;
    if (image) {
      userMessage = {
        role: "user",
        content: [
          { type: "text", text },
          { type: "image_url", image_url: { url: image } },
        ],
      };
    } else {
      userMessage = { role: "user", content: text };
    }

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    appendDisplay({
      role: "user",
      text,
      imageUrl: image ?? undefined,
      createdAt: Date.now(),
    });

    setIsSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!res.ok) {
        const errMsg =
          res.status === 401
            ? "세션이 만료되었습니다. 새로고침 후 다시 로그인해 주세요."
            : "응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.";
        appendDisplay({ role: "assistant", text: errMsg, isError: true, createdAt: Date.now() });
        return;
      }

      const data: { content?: string } = await res.json();
      const content = data.content ?? "";
      const assistantMsg: ChatMessage = { role: "assistant", content };
      // 전송용 히스토리에는 항상 원본 content를 그대로 저장 (마커 포함)
      setMessages((prev) => [...prev, assistantMsg]);

      // 화면 표시용: 작업 데이터(DATA) → 카드 / 스캔요청(SCAN) → 카메라·갤러리 버튼 / 그 외 → 텍스트
      const query = parseQueryRequest(content);
      if (query) {
        if (query.cleanedText) {
          appendDisplay({ role: "assistant", text: query.cleanedText, createdAt: Date.now() });
        }
        try {
          const qres = await fetch("/api/hr-read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ queryId: query.queryId, params: query.params }),
          });
          const qjson = await qres.json().catch(() => ({}));
          const text =
            qres.ok && qjson?.ok
              ? formatQueryResult(query.queryId, qjson.data)
              : "조회에 실패했습니다. 잠시 후 다시 시도해 주세요.";
          appendDisplay({ role: "assistant", text, createdAt: Date.now() });
        } catch {
          appendDisplay({ role: "assistant", text: "조회 중 오류가 발생했습니다.", isError: true, createdAt: Date.now() });
        }
        return;
      }

      const proposal = parseOperationData(content);
      if (proposal) {
        appendDisplay({
          role: "assistant",
          text: proposal.cleanedText,
          proposal: proposal.data,
          proposalStatus: "pending",
          createdAt: Date.now(),
        });
      } else {
        const scan = parseScanRequest(content);
        const datetime = parseDatetimeRequest(content);
        if (scan.isScan) {
          appendDisplay({
            role: "assistant",
            text: scan.cleanedText || "바코드를 스캔하거나, 바코드 번호 또는 품목명을 입력해 주세요.",
            scanRequest: true,
            createdAt: Date.now(),
          });
        } else if (datetime.isDatetime) {
          appendDisplay({
            role: "assistant",
            text: datetime.cleanedText || "발생 일시를 선택해 주세요.",
            datetimeRequest: true,
            createdAt: Date.now(),
          });
        } else {
          appendDisplay({ role: "assistant", text: content || "(빈 응답)", createdAt: Date.now() });
        }
      }
    } catch {
      appendDisplay({
        role: "assistant",
        text: "응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.",
        isError: true,
        createdAt: Date.now(),
      });
    } finally {
      setIsSending(false);
    }
  }

  // 입력창 전송: 현재 input/pendingImage를 읽어 비운 뒤 sendMessage 호출.
  function send() {
    const text = input.trim();
    if ((!text && !pendingImage) || isSending) return;
    const img = pendingImage;
    setInput("");
    setPendingImage(null);
    sendMessage(text, img);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function toggleListening() {
    if (!speechSupported) return;
    if (listening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "ko-KR";
    rec.continuous = true;
    rec.interimResults = true;
    baseInputRef.current = input;

    rec.onresult = (e: SpeechRecognitionEventLike) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      const base = baseInputRef.current;
      const combined = (base ? base + " " : "") + finalText + interimText;
      setInput(combined);
      if (finalText) {
        // 확정분은 baseInput에 누적
        baseInputRef.current = (base ? base + " " : "") + finalText;
      }
    };
    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    rec.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      recognitionRef.current = null;
    }
  }

  // 갤러리에서 사진 선택: 바코드가 있으면 디코드해서 코드 자동전송, 없으면 이미지로 전송(vision).
  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 가능
    if (!file) return;
    try {
      const code = await decodeBarcodeFromFile(file);
      if (code) {
        sendMessage(code.toUpperCase(), null);
        return;
      }
      // 바코드 없음 → 이미지로 전송 (gemma vision)
      const dataUrl = await resizeImageToDataUrl(file);
      sendMessage("", dataUrl);
    } catch {
      appendDisplay({
        role: "assistant",
        text: "사진을 처리하지 못했습니다.",
        isError: true,
        createdAt: Date.now(),
      });
    }
  }

  // 카드 사진 첨부: 촬영/갤러리에서 고른 이미지를 해당 카드(index)에 누적 (바코드 디코드 안 함, 순수 사진)
  async function onCardPhotosPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const idx = photoCardIndexRef.current;
    if (idx < 0 || files.length === 0) return;
    const urls: string[] = [];
    for (const f of files) {
      try {
        urls.push(await resizeImageToDataUrl(f));
      } catch {
        /* 개별 실패 스킵 */
      }
    }
    if (urls.length === 0) return;
    setCardPhotos((prev) => ({ ...prev, [idx]: [...(prev[idx] ?? []), ...urls] }));
  }

  function removeCardPhoto(cardIdx: number, photoIdx: number) {
    setCardPhotos((prev) => ({
      ...prev,
      [cardIdx]: (prev[cardIdx] ?? []).filter((_, i) => i !== photoIdx),
    }));
  }

  return (
    <>
      {/* 플로팅 버튼 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="챗봇 열기"
          className="fixed right-4 bottom-4 z-[60] w-14 h-14 rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg flex items-center justify-center transition-colors"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* 패널 */}
      {open && (
        <div
          className="fixed z-[60] bg-white border border-gray-200 rounded-2xl shadow-xl flex flex-col overflow-hidden right-4 left-4 sm:left-auto sm:right-4 sm:w-full sm:max-w-sm"
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            height: "min(70vh, 600px)",
            maxHeight: "calc(100vh - 80px)",
          }}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center">
                <MessageCircle size={15} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">사내 AI 챗봇</p>
                <p className="text-[10px] text-gray-400">OpenClaw</p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {displayMessages.length > 0 && (
                <button
                  onClick={handleClearChat}
                  aria-label="대화 지우기"
                  title="대화 지우기"
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="닫기"
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* 메시지 영역 */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-gray-50">
            {displayMessages.length === 0 && (
              <div className="text-center text-[12px] text-gray-400 mt-6">
                무엇이든 물어보세요.
              </div>
            )}

            {displayMessages.map((m, i) => {
              const isUser = m.role === "user";
              const prev = i > 0 ? displayMessages[i - 1] : null;
              const showDateDivider = !prev || !isSameDay(prev.createdAt, m.createdAt);
              return (
                <div key={i}>
                  {showDateDivider && (
                    <div className="flex items-center gap-2 my-2">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-[10px] text-gray-400 px-2 py-0.5 rounded-full bg-white border border-gray-100">
                        {formatDateLabel(m.createdAt)}
                      </span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                  )}
                  <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div className={`flex flex-col max-w-[80%] ${isUser ? "items-end" : "items-start"}`}>
                      {(m.text || m.imageUrl) && (
                        <div
                          className={`rounded-2xl px-3 py-2 text-[13px] whitespace-pre-wrap break-words ${
                            isUser
                              ? "bg-blue-500 text-white"
                              : m.isError
                              ? "bg-red-50 text-red-700 border border-red-100"
                              : "bg-white text-gray-800 border border-gray-100"
                          }`}
                        >
                          {m.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.imageUrl}
                              alt="첨부 이미지"
                              className="rounded-lg mb-1 max-w-full"
                            />
                          )}
                          {m.text}
                        </div>
                      )}

                      {/* 작업 확인 카드 (스키마 cardShow 기반 자동 생성) */}
                      {m.proposal &&
                        (() => {
                          const op = schemas.find((s) => s.id === m.proposal!.opId);
                          const card = buildCard(op, m.proposal!);
                          return (
                            <div className="mt-1 w-full rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-2.5">
                              <p className="text-[12px] font-bold text-blue-900 mb-1.5">{card.title}</p>
                              <dl className="space-y-0.5 text-[12px] text-gray-700">
                                {card.rows.map((r, ri) => (
                                  <div key={ri} className="flex gap-2">
                                    <dt className="text-gray-400 shrink-0 min-w-[3rem]">{r.label}</dt>
                                    <dd className="font-medium text-gray-900 break-words">{r.value}</dd>
                                  </div>
                                ))}
                              </dl>

                              {m.proposalStatus === "pending" && op?.app === "equipment" && (
                                <div className="mt-2">
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => { photoCardIndexRef.current = i; cameraInputRef.current?.click(); }}
                                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-gray-100 text-gray-700 text-[11px] font-semibold border border-gray-200 transition-colors"
                                    >
                                      <Camera size={13} /> 사진 촬영
                                    </button>
                                    <button
                                      onClick={() => { photoCardIndexRef.current = i; galleryPhotoInputRef.current?.click(); }}
                                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-gray-100 text-gray-700 text-[11px] font-semibold border border-gray-200 transition-colors"
                                    >
                                      <Images size={13} /> 갤러리
                                    </button>
                                  </div>
                                  {(cardPhotos[i]?.length ?? 0) > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                      {cardPhotos[i].map((url, pi) => (
                                        <div key={pi} className="relative">
                                          <img src={url} alt="" className="w-12 h-12 object-cover rounded-lg border border-gray-200" />
                                          <button
                                            onClick={() => removeCardPhoto(i, pi)}
                                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gray-700 text-white text-[10px] leading-none flex items-center justify-center"
                                          >
                                            ×
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              {m.proposalStatus === "pending" && (
                                <div className="flex gap-2 mt-2.5">
                                  <button
                                    onClick={() => handleConfirmProposal(i, m.proposal!)}
                                    className="flex-1 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-[12px] font-bold transition-colors"
                                  >
                                    확인
                                  </button>
                                  <button
                                    onClick={() => handleCancelProposal(i)}
                                    className="flex-1 py-1.5 rounded-lg bg-white hover:bg-gray-100 text-gray-600 text-[12px] font-medium border border-gray-200 transition-colors"
                                  >
                                    취소
                                  </button>
                                </div>
                              )}
                              {m.proposalStatus === "submitting" && (
                                <p className="mt-2.5 text-[12px] text-gray-500 font-medium">처리 중...</p>
                              )}
                              {m.proposalStatus === "done" && (
                                <p className="mt-2.5 text-[12px] text-green-600 font-bold">✓ 완료</p>
                              )}
                              {m.proposalStatus === "cancelled" && (
                                <p className="mt-2.5 text-[12px] text-gray-400 font-medium">취소됨</p>
                              )}
                              {m.proposalStatus === "failed" && (
                                <p className="mt-2.5 text-[12px] text-red-500 font-bold">실패</p>
                              )}
                            </div>
                          );
                        })()}

                      {/* 바코드 스캔 요청: 카메라 / 갤러리 버튼 (문자 입력도 항상 가능) */}
                      {m.scanRequest && (
                        <div className="mt-1.5 flex gap-2">
                          <button
                            onClick={() => setShowScanner(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-[12px] font-semibold transition-colors"
                          >
                            <Camera size={14} /> 카메라
                          </button>
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-gray-100 text-gray-700 text-[12px] font-semibold border border-gray-200 transition-colors"
                          >
                            <Images size={14} /> 갤러리
                          </button>
                        </div>
                      )}

                      {/* 발생 일시 선택기: 날짜·시간 입력 (datetime-local) */}
                      {m.datetimeRequest && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <input
                            type="datetime-local"
                            value={datetimeValue}
                            onChange={(e) => setDatetimeValue(e.target.value)}
                            className="px-2 py-1.5 rounded-lg border border-gray-200 text-[12px] text-gray-700"
                          />
                          <button
                            onClick={() => {
                              if (!datetimeValue) return;
                              const v = datetimeValue.replace("T", " ");
                              sendMessage(`발생 일시: ${v}`, null);
                              setDatetimeValue("");
                            }}
                            className="px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-[12px] font-semibold transition-colors"
                          >
                            확인
                          </button>
                        </div>
                      )}

                      <span className="text-[10px] text-gray-400 mt-0.5 px-1">
                        {formatTime(m.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 rounded-2xl px-3 py-2 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-pulse" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-pulse" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-pulse" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>

          {/* 첨부 미리보기 */}
          {pendingImage && (
            <div className="px-3 pt-2 bg-white border-t border-gray-100">
              <div className="inline-flex items-start gap-2 relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pendingImage}
                  alt="첨부 미리보기"
                  className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                />
                <button
                  onClick={() => setPendingImage(null)}
                  aria-label="첨부 제거"
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gray-700 text-white flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          )}

          {/* 바코드 카메라 스캐너 (채팅 내 '카메라' 버튼으로 열림) */}
          {showScanner && (
            <BarcodeCameraScanner
              onDetected={(code) => {
                setShowScanner(false);
                const cleaned = code.trim().toUpperCase();
                if (cleaned) sendMessage(cleaned, null);
              }}
              onClose={() => setShowScanner(false)}
            />
          )}

          {/* 갤러리 선택용 숨김 input (채팅 내 '갤러리' 버튼으로 열림) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            onChange={onFilePicked}
            className="hidden"
          />

          {/* 카드 사진: 촬영(카메라)·갤러리(다중) 숨김 input */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onCardPhotosPicked}
            className="hidden"
          />
          <input
            ref={galleryPhotoInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onCardPhotosPicked}
            className="hidden"
          />

          {/* 입력 영역 */}
          <div className="border-t border-gray-100 bg-white p-2 flex items-end gap-1.5">

            {/* 마이크 */}
            {speechSupported ? (
              <button
                onClick={toggleListening}
                aria-label={listening ? "음성 입력 중지" : "음성 입력 시작"}
                className={`p-2 rounded-lg transition-colors shrink-0 ${
                  listening
                    ? "bg-red-500 text-white animate-pulse"
                    : "hover:bg-gray-100 text-gray-500"
                }`}
              >
                <Mic size={18} />
              </button>
            ) : (
              <button
                disabled
                title="이 브라우저는 음성 입력을 지원하지 않습니다"
                className="p-2 rounded-lg text-gray-300 cursor-not-allowed shrink-0"
              >
                <Mic size={18} />
              </button>
            )}

            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                baseInputRef.current = e.target.value;
              }}
              onKeyDown={onKeyDown}
              placeholder="메시지를 입력하세요 (Shift+Enter 줄바꿈)"
              rows={1}
              className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-[13px] focus:outline-none focus:border-blue-400 max-h-32"
            />

            <button
              onClick={send}
              disabled={isSending || (!input.trim() && !pendingImage)}
              aria-label="전송"
              className="p-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors shrink-0"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
