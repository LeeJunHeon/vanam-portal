// 포털 앱 정보 — 앱 열(왼쪽 카드)과 런처가 같이 쓴다
import {
  type LucideIcon,
  Award, BarChart3, Briefcase, Building2, Calendar, CalendarCheck, CalendarDays, CheckSquare,
  ClipboardList, Clock, Cpu, Droplet, FileText, Gauge, History, Home, IdCard, Layers,
  LayoutDashboard, LayoutGrid, ListChecks, Package, Plane, QrCode, Search, Settings, Smartphone,
  Sparkles, Target, Users, Wind, Workflow, Wrench,
} from "lucide-react";
import { APP_KEYS, type AppKey } from "@/lib/launcher";

export interface PortalApp {
  key: AppKey;
  name: string;        // 앱 이름 (카드 제목)
  short: string;       // 약칭 (런처 타일 아래)
  base: string;        // 같은 origin 앱 경로
  description: string;
  icon: LucideIcon;
  iconBgColor: string; // 앱 카드·전체 메뉴 행 아이콘 박스
  iconColor: string;   // 앱 카드 아이콘
  tileBg: string;      // 런처 타일 배경
  tileFg: string;      // 런처 아이콘색
  adminOnly: boolean;  // admin·CEO 만 보임
  container: string;   // /api/nas-status 컨테이너 이름
}

export const PORTAL_APPS: Record<AppKey, PortalApp> = {
  inventory: {
    key: "inventory",
    name: "재고 관리",
    short: "재고",
    base: "/inventory",
    description: "웨이퍼·타겟·가스·소모품 입출고 및 바코드 추적",
    icon: Package,
    iconBgColor: "#eff6ff",
    iconColor: "#3b82f6",
    tileBg: "#dbeafe",
    tileFg: "#2563eb",
    adminOnly: false,
    container: "inventory-web-nextjs",
  },
  equipment: {
    key: "equipment",
    name: "장비 관리",
    short: "장비",
    base: "/equipment",
    description: "수리·클리닝·Vent 이력 통합 관리",
    icon: Wrench,
    iconBgColor: "#f0fdf4",
    iconColor: "#16a34a",
    tileBg: "#dcfce7",
    tileFg: "#15803d",
    adminOnly: false,
    container: "equipment-web-nextjs",
  },
  hr: {
    key: "hr",
    name: "인사 관리",
    short: "근태",
    base: "/hr",
    description: "WiFi 자동 출퇴근·휴가·결재·실적 관리",
    icon: Calendar,
    iconBgColor: "#faf5ff",
    iconColor: "#9333ea",
    tileBg: "#f3e8ff",
    tileFg: "#7e22ce",
    adminOnly: false,
    container: "hr-nextjs",
  },
  office: {
    key: "office",
    name: "경영 지원",
    short: "경영지원",
    base: "/office",
    description: "지식재산권·장비관리대장·인사정보카드 통합 관리",
    icon: Briefcase,
    iconBgColor: "#eef2ff",
    iconColor: "#6366f1",
    tileBg: "#e0e7ff",
    tileFg: "#4f46e5",
    adminOnly: true,
    container: "office-web-nextjs",
  },
  process: {
    key: "process",
    name: "공정 관리",
    short: "공정",
    base: "/process",
    description: "증착 요청 기판 사진 기록",
    icon: Workflow,
    iconBgColor: "#fffbeb",
    iconColor: "#d97706",
    tileBg: "#fef3c7",
    tileFg: "#b45309",
    adminOnly: false,
    container: "process-web-nextjs",
  },
};

export const DEFAULT_APP_ORDER: readonly AppKey[] = APP_KEYS;

// 앱 portal-menus 의 아이콘 이름 → lucide 컴포넌트 (모르는 이름은 LayoutGrid)
const MENU_ICONS: Record<string, LucideIcon> = {
  Home, Package, BarChart3, Clock, QrCode, Search, Layers, Target, Droplet, Building2, Users,
  FileText, Wrench, Wind, Sparkles, Settings, Cpu, Calendar, Plane, CheckSquare, CalendarDays,
  CalendarCheck, Smartphone, Award, IdCard, LayoutDashboard, ListChecks, ClipboardList, History,
  Gauge,
};

export function menuIcon(name: string): LucideIcon {
  return Object.prototype.hasOwnProperty.call(MENU_ICONS, name) ? MENU_ICONS[name] : LayoutGrid;
}
