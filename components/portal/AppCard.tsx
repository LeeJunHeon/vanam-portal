import { Clock, ArrowRight, type LucideIcon } from "lucide-react";

interface AppCardProps {
  icon: LucideIcon;
  iconBgColor: string;
  iconColor: string;
  title: string;
  description: string;
  href: string;
  status?: "online" | "pending";
}

export default function AppCard({
  icon: Icon,
  iconBgColor,
  iconColor,
  title,
  description,
  href,
  status = "online",
}: AppCardProps) {
  const badge =
    status === "pending"
      ? { label: "준비중", bg: "#f3f4f6", color: "#6b7280" }
      : { label: "운영중", bg: "#dcfce7", color: "#16a34a" };

  return (
    <div
      className="bg-white rounded-[12px] p-4 flex flex-col gap-3 hover:border-[#93c5fd] transition-colors"
      style={{ border: "0.5px solid #e5e7eb" }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div
          className="flex items-center justify-center rounded-lg"
          style={{
            width: "34px",
            height: "34px",
            backgroundColor: iconBgColor,
          }}
        >
          <Icon size={17} color={iconColor} strokeWidth={1.8} />
        </div>
        <span
          className="rounded-full font-semibold"
          style={{
            fontSize: "9px",
            padding: "2px 7px",
            backgroundColor: badge.bg,
            color: badge.color,
          }}
        >
          {badge.label}
        </span>
      </div>

      {/* 제목 & 설명 */}
      <div>
        <h3 className="font-bold text-gray-900 mb-1" style={{ fontSize: "13px" }}>
          {title}
        </h3>
        <p className="text-gray-400 leading-relaxed" style={{ fontSize: "11px" }}>
          {description}
        </p>
      </div>

      {/* 하단 */}
      <div className="flex items-center justify-between mt-auto pt-1">
        <div className="flex items-center gap-1 text-gray-400" style={{ fontSize: "11px" }}>
          <Clock size={10} strokeWidth={1.8} />
          <span>--</span>
        </div>
        {status === "pending" ? (
          <div style={{ width: "26px", height: "26px" }} />
        ) : (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center rounded-md text-blue-500 hover:bg-blue-50 transition-colors"
            style={{ width: "26px", height: "26px" }}
          >
            <ArrowRight size={14} strokeWidth={2} />
          </a>
        )}
      </div>
    </div>
  );
}
