import { useState } from "react";
import { Shield, Building2, Wifi } from "lucide-react";
import { CameraView } from "./components/CameraView";
import { AdminLoginModal } from "./components/AdminLoginModal";
import { AdminDashboard } from "./components/AdminDashboard";

const mono = { fontFamily: "'JetBrains Mono', monospace" };

export default function App() {
  /* MARKER-MAKE-KIT-INVOKED */
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminUser, setAdminUser] = useState<string | null>(() => localStorage.getItem("adminSession"));

  const handleLogout = () => {
    setAdminUser(null);
    localStorage.removeItem("adminSession");
  };

  const handleLogin = (user: string) => {
    setAdminUser(user);
    localStorage.setItem("adminSession", user);
    setShowAdminModal(false);
  };

  if (adminUser) {
    return <AdminDashboard adminName={adminUser} onLogout={handleLogout} />;
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(160deg,#0a0e1a 0%,#0d1520 60%,#0a0f1e 100%)", fontFamily: "'Inter',sans-serif" }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid rgba(59,130,246,0.12)", background: "rgba(17,24,39,0.8)", backdropFilter: "blur(12px)" }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", boxShadow: "0 0 16px rgba(59,130,246,0.4)" }}>
            <Building2 size={18} color="#fff" />
          </div>
          <div>
            <p style={{ color: "#e8ecf4", fontWeight: 700, lineHeight: 1.1, fontSize: "0.95rem" }}>AbsenFace</p>
            <p style={{ ...mono, color: "#64748b", fontSize: "0.65rem", letterSpacing: "0.06em" }}>SISTEM ABSENSI WAJAH</p>
          </div>
        </div>

        {/* Center */}
        <div className="hidden md:flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Wifi size={13} style={{ color: "#22c55e" }} />
            <span style={{ ...mono, fontSize: "0.65rem", color: "#22c55e", letterSpacing: "0.08em" }}>ONLINE</span>
          </div>
          <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.08)" }} />
          <span style={{ ...mono, fontSize: "0.65rem", color: "#64748b" }}>
            {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
          </span>
        </div>

        {/* Right buttons */}
        <div className="flex items-center gap-2">
          {/* Login Admin */}
          <button
            onClick={() => setShowAdminModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all"
            style={{ background: "rgba(29,78,216,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#3b82f6", fontSize: "0.82rem", fontWeight: 500 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(29,78,216,0.3)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(29,78,216,0.15)"; }}
          >
            <Shield size={15} /> Login Admin
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="text-center mb-8">
          <h1 style={{ color: "#e8ecf4", fontWeight: 700, fontSize: "1.6rem", letterSpacing: "-0.01em", marginBottom: "0.4rem" }}>
            Absensi Wajah
          </h1>
          <p style={{ ...mono, color: "#64748b", fontSize: "0.82rem", letterSpacing: "0.06em" }}>
            POSISIKAN WAJAH DI DEPAN KAMERA UNTUK ABSEN
          </p>
        </div>
        <CameraView />
      </main>

      {/* Footer */}
      <footer className="py-3 text-center" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <span style={{ ...mono, fontSize: "0.65rem", color: "#1e293b", letterSpacing: "0.08em" }}>
          © 2026 PT. MAJU BERSAMA · SISTEM ABSENSI DIGITAL
        </span>
      </footer>

      {showAdminModal && (
        <AdminLoginModal
          onClose={() => setShowAdminModal(false)}
          onLogin={handleLogin}
        />
      )}
    </div>
  );
}
