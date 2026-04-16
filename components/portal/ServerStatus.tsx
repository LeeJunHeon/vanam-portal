import { HardDrive, Database, Box, Cpu } from "lucide-react";
import { type LucideIcon } from "lucide-react";

interface StatusItemProps {
  icon: LucideIcon;
  name: string;
}

function StatusItem({ icon: Icon, name }: StatusItemProps) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2.5">
        <div
          className="flex items-center justify-center rounded-md"
          style={{
            width: "28px",
            height: "28px",
            backgroundColor: "#f9fafb",
            border: "0.5px solid #e5e7eb",
          }}
        >
          <Icon size={13} color="#6b7280" strokeWidth={1.8} />
        </div>
        <span className="text-gray-700 font-medium" style={{ fontSize: "12px" }}>
          {name}
        </span>
      </div>
      <span
        className="rounded-full font-semibold"
        style={{
          fontSize: "9px",
          padding: "2px 8px",
          backgroundColor: "#f3f4f6",
          color: "#6b7280",
        }}
      >
        확인중
      </span>
    </div>
  );
}

const STATUS_ITEMS: { icon: LucideIcon; name: string }[] = [
  { icon: HardDrive, name: "Synology NAS" },
  { icon: Database, name: "PostgreSQL" },
  { icon: Box, name: "재고관리 앱" },
  { icon: Cpu, name: "챔버 에이전트" },
];

export default function ServerStatus() {
  return (
    <div
      className="bg-white rounded-[12px] p-4"
      style={{ border: "0.5px solid #e5e7eb" }}
    >
      <p
        className="font-bold uppercase tracking-widest mb-1"
        style={{ fontSize: "11px", color: "#9ca3af", letterSpacing: "0.08em" }}
      >
        서버 상태
      </p>

      <div className="divide-y divide-gray-50">
        {STATUS_ITEMS.map((item) => (
          <StatusItem key={item.name} icon={item.icon} name={item.name} />
        ))}
      </div>
    </div>
  );
}
