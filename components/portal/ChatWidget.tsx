"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Mic, Camera } from "lucide-react";

type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image_url"; image_url: { url: string } };
type ContentPart = TextPart | ImagePart;

interface ChatMessage {
  role: "user" | "assistant";
  content: string | ContentPart[];
}

// 입고 제안(챗봇 응답 마커에서 파싱)
interface InventoryProposal {
  action: string;
  itemId: number;
  itemName: string;
  qty: number;
  locationId: number;
  locationName: string;
  memo?: string;
}

// 화면 표시용 메시지(첨부 이미지 미리보기 포함)
interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
  imageUrl?: string;
  isError?: boolean;
  createdAt: number; // 메시지 생성 시각(epoch ms)
  proposal?: InventoryProposal;
  proposalStatus?: "pending" | "confirmed" | "cancelled" | "submitting" | "done" | "failed";
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
// 입고 제안 마커 파싱
// <<INVENTORY_PROPOSAL>> { ...json... } <<END>> 형태를 추출.
// 실패하면 null 반환(호출부에서 일반 텍스트로 폴백).
// ─────────────────────────────────────────────
function parseInventoryProposal(
  content: string
): { data: InventoryProposal; cleanedText: string } | null {
  const match = content.match(/<<INVENTORY_PROPOSAL>>([\s\S]*?)<<END>>/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim()) as Partial<InventoryProposal>;
    if (
      parsed.action === "inventory_inbound" &&
      typeof parsed.itemId === "number" &&
      typeof parsed.qty === "number" &&
      typeof parsed.locationId === "number"
    ) {
      const cleanedText = content.replace(match[0], "").trim();
      return { data: parsed as InventoryProposal, cleanedText };
    }
  } catch {
    /* 파싱 실패 → 폴백 */
  }
  return null;
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseInputRef = useRef<string>(""); // 인식 시작 시점의 입력값

  // 음성 인식 지원 여부 체크
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    setSpeechSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

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

  function appendDisplay(msg: DisplayMessage) {
    setDisplayMessages((prev) => [...prev, msg]);
  }

  const handleConfirmProposal = async (index: number, proposal: InventoryProposal) => {
    // 해당 메시지 상태를 submitting으로
    setDisplayMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, proposalStatus: "submitting" } : m))
    );
    try {
      const res = await fetch("/api/inventory-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txType: "입고",
          itemId: proposal.itemId,
          qty: proposal.qty,
          locationId: proposal.locationId,
          memo: proposal.memo ?? "",
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        setDisplayMessages((prev) =>
          prev.map((m, i) => (i === index ? { ...m, proposalStatus: "failed" } : m))
        );
        appendDisplay({
          role: "assistant",
          text: `입고 실패: ${detail}`,
          isError: true,
          createdAt: Date.now(),
        });
        return;
      }
      const data = await res.json();
      setDisplayMessages((prev) =>
        prev.map((m, i) => (i === index ? { ...m, proposalStatus: "done" } : m))
      );
      appendDisplay({
        role: "assistant",
        text: `입고 완료되었습니다. (전표번호: ${data.txNo ?? "?"})`,
        createdAt: Date.now(),
      });
    } catch {
      setDisplayMessages((prev) =>
        prev.map((m, i) => (i === index ? { ...m, proposalStatus: "failed" } : m))
      );
      appendDisplay({
        role: "assistant",
        text: "입고 처리 중 오류가 발생했습니다.",
        isError: true,
        createdAt: Date.now(),
      });
    }
  };

  const handleCancelProposal = (index: number) => {
    setDisplayMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, proposalStatus: "cancelled" } : m))
    );
  };

  async function send() {
    const text = input.trim();
    if ((!text && !pendingImage) || isSending) return;

    // user 메시지 구성: 이미지 있으면 content는 배열, 없으면 문자열
    let userMessage: ChatMessage;
    if (pendingImage) {
      userMessage = {
        role: "user",
        content: [
          { type: "text", text },
          { type: "image_url", image_url: { url: pendingImage } },
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
      imageUrl: pendingImage ?? undefined,
      createdAt: Date.now(),
    });

    const sentImage = pendingImage;
    setInput("");
    setPendingImage(null);
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

      // 화면 표시용: 입고 제안 마커 감지 → 카드로 표시, 실패 시 일반 텍스트 폴백
      const proposal = parseInventoryProposal(content);
      if (proposal) {
        appendDisplay({
          role: "assistant",
          text: proposal.cleanedText,
          proposal: proposal.data,
          proposalStatus: "pending",
          createdAt: Date.now(),
        });
      } else {
        appendDisplay({ role: "assistant", text: content || "(빈 응답)", createdAt: Date.now() });
      }
    } catch {
      appendDisplay({
        role: "assistant",
        text: "응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.",
        isError: true,
        createdAt: Date.now(),
      });
    } finally {
      // sentImage는 user 메시지에만 들어가고, 이후 턴엔 영향 없음
      void sentImage;
      setIsSending(false);
    }
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

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 가능
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setPendingImage(dataUrl);
    } catch {
      appendDisplay({
        role: "assistant",
        text: "사진을 처리하지 못했습니다.",
        isError: true,
        createdAt: Date.now(),
      });
    }
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
            <button
              onClick={() => setOpen(false)}
              aria-label="닫기"
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
            >
              <X size={18} />
            </button>
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

                      {/* 입고 요청 확인 카드 */}
                      {m.proposal && (
                        <div className="mt-1 w-full rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-2.5">
                          <p className="text-[12px] font-bold text-blue-900 mb-1.5">입고 요청 확인</p>
                          <dl className="space-y-0.5 text-[12px] text-gray-700">
                            <div className="flex gap-2">
                              <dt className="text-gray-400 shrink-0 w-10">품목</dt>
                              <dd className="font-medium text-gray-900 break-words">{m.proposal.itemName}</dd>
                            </div>
                            <div className="flex gap-2">
                              <dt className="text-gray-400 shrink-0 w-10">수량</dt>
                              <dd className="font-medium text-gray-900">{m.proposal.qty}</dd>
                            </div>
                            <div className="flex gap-2">
                              <dt className="text-gray-400 shrink-0 w-10">위치</dt>
                              <dd className="font-medium text-gray-900 break-words">{m.proposal.locationName}</dd>
                            </div>
                          </dl>

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
                            <p className="mt-2.5 text-[12px] text-green-600 font-bold">✓ 입고 완료</p>
                          )}
                          {m.proposalStatus === "cancelled" && (
                            <p className="mt-2.5 text-[12px] text-gray-400 font-medium">취소됨</p>
                          )}
                          {m.proposalStatus === "failed" && (
                            <p className="mt-2.5 text-[12px] text-red-500 font-bold">실패</p>
                          )}
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

          {/* 입력 영역 */}
          <div className="border-t border-gray-100 bg-white p-2 flex items-end gap-1.5">
            {/* 사진 첨부 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              capture="environment"
              onChange={onFilePicked}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              aria-label="사진 첨부"
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors shrink-0"
            >
              <Camera size={18} />
            </button>

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
