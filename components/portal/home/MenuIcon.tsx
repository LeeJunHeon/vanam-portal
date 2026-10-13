import { createElement } from "react";
import { menuIcon } from "@/lib/portal-apps";

// 앱이 보내는 아이콘 이름으로 lucide 아이콘 그리기 (모르는 이름은 LayoutGrid)
// className 으로 화면 폭별 크기를 덮어쓸 수 있다(CSS 가 width/height 속성보다 우선)
export default function MenuIcon({
  name,
  size,
  color,
  className,
}: {
  name: string;
  size: number;
  color: string;
  className?: string;
}) {
  return createElement(menuIcon(name), { size, color, className, strokeWidth: 1.8, "aria-hidden": true });
}
