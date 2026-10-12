import TopBar from "@/components/portal/TopBar";
import PortalHome from "@/components/portal/home/PortalHome";

export default function Home() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f0f2f5" }}>
      <TopBar />
      <PortalHome />
    </div>
  );
}
