import { PackagePlus, Barcode, BarChart2, ScrollText } from "lucide-react";
import { type LucideIcon } from "lucide-react";

const INVENTORY_BASE = "https://inventory.vanam.synology.me";

interface QuickActionButtonProps {
  icon: LucideIcon;
  label: string;
  href: string;
}

function QuickActionButton({ icon: Icon, label, href }: QuickActionButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col items-center justify-center gap-1.5 rounded-xl py-3 transition-colors hover:bg-blue-50 hover:border-[#93c5fd]"
      style={{
        border: "0.5px solid #e5e7eb",
        backgroundColor: "#fafafa",
      }}
    >
      <Icon size={16} color="#3b82f6" strokeWidth={1.8} />
      <span className="text-gray-700 font-semibold text-center" style={{ fontSize: "11px" }}>
        {label}
      </span>
    </a>
  );
}

const ACTIONS: QuickActionButtonProps[] = [
  { icon: PackagePlus, label: "새 입고", href: `${INVENTORY_BASE}/inbound/new` },
  { icon: Barcode, label: "바코드", href: `${INVENTORY_BASE}/barcode` },
  { icon: BarChart2, label: "현황", href: `${INVENTORY_BASE}/dashboard` },
  { icon: ScrollText, label: "전체 로그", href: `${INVENTORY_BASE}/logs` },
];

export default function QuickActions() {
  return (
    <div
      className="bg-white rounded-[12px] p-4"
      style={{ border: "0.5px solid #e5e7eb" }}
    >
      <p
        className="font-bold uppercase tracking-widest mb-3"
        style={{ fontSize: "11px", color: "#9ca3af", letterSpacing: "0.08em" }}
      >
        빠른 실행
      </p>

      <div className="grid grid-cols-4 lg:grid-cols-2 gap-2">
        {ACTIONS.map((action) => (
          <QuickActionButton
            key={action.label}
            icon={action.icon}
            label={action.label}
            href={action.href}
          />
        ))}
      </div>
    </div>
  );
}
