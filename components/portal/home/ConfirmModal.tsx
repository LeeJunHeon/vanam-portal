"use client";

// 확인 모달 (TopBar 로그아웃 확인 모달과 같은 모양)
export default function ConfirmModal({
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
  aboveSheet = false,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  aboveSheet?: boolean; // 시트(z-[65]) 위에 띄울 때
}) {
  return (
    <div
      className={`fixed inset-0 ${aboveSheet ? "z-[70]" : "z-[60]"} flex items-center justify-center p-4`}
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-bold text-white bg-rose-500 rounded-xl hover:bg-rose-600 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
