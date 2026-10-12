import { createElement } from "react";
import { menuIcon } from "@/lib/portal-apps";

// 앱이 보내는 아이콘 이름으로 lucide 아이콘 그리기 (모르는 이름은 LayoutGrid)
export default function MenuIcon({ name, size, color }: { name: string; size: number; color: string }) {
  return createElement(menuIcon(name), { size, color, strokeWidth: 1.8, "aria-hidden": true });
}
