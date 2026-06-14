import { useState } from "react";
import { X, Lock, User, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";

// Helper to check if Supabase is configured
const hasSupabase = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

interface AdminLoginModalProps {
  onClose: () => void;
  onLogin: (username: string) => void;
}

export function AdminLoginModal({ onClose, onLogin }: AdminLoginModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Username dan password wajib diisi.");
      return;
    }

    setLoading(true);
    
    try {
      if (hasSupabase()) {
        const { data, error: dbError } = await supabase
          .from('accounts')
          .select('username, role, status')
          .eq('username', username)
          .eq('password', password) // In production, use hashing!
          .single();

        if (dbError || !data) {
          setError("Username atau password salah.");
        } else if (data.status !== "Aktif") {
          setError("Akun Anda sedang dinonaktifkan.");
        } else {
          // Update last login
          await supabase.from('accounts').update({ last_login: new Date().toISOString() }).eq('username', username);
          onLogin(data.username);
        }
      } else {
        // Fallback for demo mode
        setTimeout(() => {
          if (username === "admin" && password === "admin123") {
            onLogin(username);
          } else {
            setError("Username atau password salah (Mode Demo).");
          }
          setLoading(false);
        }, 800);
        return; // Skip final setLoading
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Terjadi kesalahan sistem.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-sm mx-4 rounded-xl overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #111827, #0f172a)",
          border: "1px solid rgba(59,130,246,0.3)",
          boxShadow: "0 0 40px rgba(59,130,246,0.15)",
        }}
      >
        {/* Header stripe */}
        <div
          className="h-1 w-full"
          style={{ background: "linear-gradient(90deg, #1d4ed8, #3b82f6, #60a5fa)" }}
        />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)" }}
              >
                <ShieldCheck size={18} style={{ color: "#3b82f6" }} />
              </div>
              <div>
                <p
                  className="leading-none mb-0.5"
                  style={{ color: "#e8ecf4", fontSize: "0.95rem", fontWeight: 600 }}
                >
                  Admin Login
                </p>
                <p style={{ color: "#64748b", fontSize: "0.75rem", fontFamily: "'JetBrains Mono', monospace" }}>
                  Portal Administrator
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
              style={{ color: "#64748b" }}
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label
                style={{ color: "#94a3b8", fontSize: "0.75rem", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.05em" }}
                className="block mb-1.5 uppercase"
              >
                Username
              </label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#64748b" }} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full rounded-lg pl-9 pr-4 py-2.5 outline-none transition-all"
                  style={{
                    background: "#1e2a3a",
                    border: "1px solid rgba(59,130,246,0.2)",
                    color: "#e8ecf4",
                    fontSize: "0.9rem",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "rgba(59,130,246,0.6)")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(59,130,246,0.2)")}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                style={{ color: "#94a3b8", fontSize: "0.75rem", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.05em" }}
                className="block mb-1.5 uppercase"
              >
                Password
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#64748b" }} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg pl-9 pr-10 py-2.5 outline-none transition-all"
                  style={{
                    background: "#1e2a3a",
                    border: "1px solid rgba(59,130,246,0.2)",
                    color: "#e8ecf4",
                    fontSize: "0.9rem",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "rgba(59,130,246,0.6)")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(59,130,246,0.2)")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "#64748b" }}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <p
                className="rounded-lg px-3 py-2"
                style={{
                  color: "#ef4444",
                  fontSize: "0.8rem",
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2.5 transition-all mt-2"
              style={{
                background: loading ? "rgba(59,130,246,0.5)" : "linear-gradient(135deg, #1d4ed8, #3b82f6)",
                color: "#ffffff",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading ? "none" : "0 4px 15px rgba(59,130,246,0.3)",
              }}
            >
              {loading ? "Memverifikasi..." : "Masuk"}
            </button>

            <p
              className="text-center"
              style={{ color: "#374151", fontSize: "0.72rem", fontFamily: "'JetBrains Mono', monospace" }}
            >
              {hasSupabase() ? "Cloud Database Connected" : "Mode Demo: admin / admin123"}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
