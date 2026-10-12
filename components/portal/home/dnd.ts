"use client";

import { KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

// 드래그 센서: 마우스 6px 이동, 폰은 180ms 누르고 있어야 시작(스크롤과 구분), 키보드
export function useLauncherSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

export const EDIT_BORDER = "1.5px dashed #cbd5e1";
export const DROP_BORDER = "1.5px dashed #2563eb";
export const DROP_BG = "#eff6ff";
