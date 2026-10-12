"use client";

import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

// 드래그 센서: 마우스 6px 이동, 폰은 180ms 누르고 있어야 시작(그냥 쓸면 스크롤), 키보드
// (PointerSensor 는 터치도 받아 6px 만 움직여도 드래그가 시작되므로 MouseSensor 를 쓴다)
export function useLauncherSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

export const EDIT_BORDER = "1.5px dashed #cbd5e1";
export const DROP_BORDER = "1.5px dashed #2563eb";
export const DROP_BG = "#eff6ff";
