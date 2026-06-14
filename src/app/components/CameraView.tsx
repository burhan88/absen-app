import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle,
  AlertCircle,
  Loader,
  ShieldAlert,
  UserCheck,
  Database,
} from "lucide-react";
import {
  getEmployees,
  subscribe,
  avatarGradients,
} from "../store/employeeStore";
import type { Employee } from "../store/employeeStore";
import { supabase } from "../../lib/supabase";

// Helper to check if Supabase is configured
const hasSupabase = () =>
  !!import.meta.env.VITE_SUPABASE_URL &&
  !!import.meta.env.VITE_SUPABASE_ANON_KEY;

const mono = { fontFamily: "'JetBrains Mono', monospace" };

const MATCH_THRESHOLD = 93; // minimum % to accept

type ScanStatus = "idle" | "scanning" | "matching" | "success" | "failed";

// Simulate which employee is detected (round-robin for demo)
let _detectIdx = 0;

export function CameraView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [permission, setPermission] = useState<
    "pending" | "granted" | "denied"
  >("pending");
  const [matchPercent, setMatchPercent] = useState(0);
  const [detectedEmployee, setDetectedEmployee] = useState<Employee | null>(
    null,
  );
  const [employees, setEmployeesLocal] = useState<Employee[]>(() =>
    getEmployees(),
  );

  // Sync employees from store
  useEffect(() => subscribe(() => setEmployeesLocal(getEmployees())), []);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Start camera
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } })
      .then((s) => {
        stream = s;
        setPermission("granted");
        setCameraActive(true);
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setPermission("denied"));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  const handleAbsen = () => {
    if (scanStatus !== "idle" || !cameraActive) return;
    const activeEmployees = employees.filter((e) => e.status === "Aktif");
    if (activeEmployees.length === 0) return;

    setScanStatus("scanning");
    setMatchPercent(0);
    setDetectedEmployee(null);

    // Phase 1: scanning wajah 1.5s
    setTimeout(() => {
      setScanStatus("matching");
      const emp = activeEmployees[_detectIdx % activeEmployees.length];
      _detectIdx++;
      setDetectedEmployee(emp);

      // Phase 2: animate match percentage
      let pct = 0;
      const hasFaceData = !!emp.photo;
      const finalPct = hasFaceData
        ? Math.floor(Math.random() * 5) + 93 // 93–97
        : Math.floor(Math.random() * 10) + 78; // 78–87

      const step = setInterval(async () => {
        pct = Math.min(pct + Math.floor(Math.random() * 8) + 3, finalPct);
        setMatchPercent(pct);
        if (pct >= finalPct) {
          clearInterval(step);
          const isSuccess = finalPct >= MATCH_THRESHOLD;

          if (isSuccess && hasSupabase()) {
            try {
              const now = new Date();
              await supabase.from("attendance").insert([
                {
                  employee_id: emp.id,
                  name: emp.name,
                  nip: emp.nip,
                  date: now.toISOString().slice(0, 10),
                  time_in: now.toLocaleTimeString("id-ID", {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                  status:
                    now.getHours() >= 8 && now.getMinutes() > 30
                      ? "Terlambat"
                      : "Hadir",
                },
              ]);
            } catch (err) {
              console.error("Gagal mencatat absensi:", err);
            }
          }

          setTimeout(() => {
            setScanStatus(isSuccess ? "success" : "failed");
            setTimeout(() => {
              setScanStatus("idle");
              setMatchPercent(0);
              setDetectedEmployee(null);
            }, 3500);
          }, 300);
        }
      }, 60);
    }, 1500);
  };

  const fmt = (d: Date) =>
    d.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("id-ID", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const frameBorderColor =
    scanStatus === "success"
      ? "#22c55e"
      : scanStatus === "failed"
        ? "#ef4444"
        : scanStatus === "matching" || scanStatus === "scanning"
          ? "#3b82f6"
          : "rgba(59,130,246,0.5)";

  const activeEmployee =
    employees.find((e) => e.status === "Aktif") ?? employees[0];
  const displayEmployee = detectedEmployee ?? activeEmployee;
  const empIdx = employees.findIndex((e) => e.id === displayEmployee?.id);

  return (
    <div className="flex flex-col items-center w-full max-w-lg mx-auto gap-4">
      {/* Camera box */}
      <div
        className="relative w-full rounded-2xl overflow-hidden"
        style={{
          aspectRatio: "4/3",
          background: "#0d1117",
          border: `2px solid ${frameBorderColor}`,
          boxShadow: `0 0 32px ${frameBorderColor}40`,
          transition: "border-color 0.4s, box-shadow 0.4s",
        }}
      >
        {/* Video stream */}
        {permission === "granted" && (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
        )}

        {/* Permissions states */}
        {permission === "denied" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Camera size={40} style={{ color: "#374151" }} />
            <p style={{ ...mono, color: "#374151", fontSize: "0.82rem" }}>
              Akses kamera ditolak
            </p>
          </div>
        )}
        {permission === "pending" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Loader
              size={28}
              style={{ color: "#3b82f6" }}
              className="animate-spin"
            />
            <p style={{ ...mono, color: "#64748b", fontSize: "0.78rem" }}>
              Memuat kamera...
            </p>
          </div>
        )}

        {/* Face detection frame */}
        {cameraActive && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="relative"
              style={{ width: "50%", aspectRatio: "3/4" }}
            >
              {[
                { top: 0, left: 0 },
                { top: 0, right: 0 },
                { bottom: 0, left: 0 },
                { bottom: 0, right: 0 },
              ].map((pos, i) => (
                <div
                  key={i}
                  className="absolute"
                  style={{
                    width: 22,
                    height: 22,
                    ...pos,
                    borderTopWidth: i < 2 ? 2.5 : 0,
                    borderBottomWidth: i >= 2 ? 2.5 : 0,
                    borderLeftWidth: i === 0 || i === 2 ? 2.5 : 0,
                    borderRightWidth: i === 1 || i === 3 ? 2.5 : 0,
                    borderStyle: "solid",
                    borderColor: frameBorderColor,
                    transition: "border-color 0.4s",
                  }}
                />
              ))}

              {/* Scan line */}
              {(scanStatus === "scanning" || scanStatus === "matching") && (
                <div
                  className="absolute left-0 right-0 h-0.5"
                  style={{
                    background:
                      "linear-gradient(90deg,transparent,#3b82f6,transparent)",
                    animation: "scanline 1.2s ease-in-out infinite",
                    top: "40%",
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* ── SUCCESS overlay ── */}
        {scanStatus === "success" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            style={{
              background: "rgba(34,197,94,0.12)",
              backdropFilter: "blur(2px)",
            }}
          >
            <UserCheck size={52} style={{ color: "#22c55e" }} />
            <p style={{ color: "#22c55e", fontWeight: 700, fontSize: "1rem" }}>
              Wajah Cocok — Absensi Tercatat!
            </p>
            <p style={{ ...mono, color: "#22c55e", fontSize: "0.8rem" }}>
              Kecocokan: {matchPercent}%
            </p>
          </div>
        )}

        {/* ── FAILED overlay ── */}
        {scanStatus === "failed" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            style={{
              background: "rgba(239,68,68,0.1)",
              backdropFilter: "blur(2px)",
            }}
          >
            <ShieldAlert size={52} style={{ color: "#ef4444" }} />
            <p style={{ color: "#ef4444", fontWeight: 700, fontSize: "1rem" }}>
              Wajah Tidak Cocok
            </p>
            <p style={{ ...mono, color: "#ef4444", fontSize: "0.75rem" }}>
              Kecocokan {matchPercent}% — Batas minimum {MATCH_THRESHOLD}%
            </p>
          </div>
        )}

        {/* HUD: live badge */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: cameraActive ? "#22c55e" : "#374151",
              boxShadow: cameraActive ? "0 0 6px #22c55e" : "none",
            }}
          />
          <span
            style={{
              ...mono,
              fontSize: "0.65rem",
              color: cameraActive ? "#22c55e" : "#374151",
              letterSpacing: "0.1em",
            }}
          >
            {cameraActive ? "LIVE" : "OFFLINE"}
          </span>
        </div>

        {/* HUD: clock */}
        <div
          className="absolute top-3 right-3 px-2 py-0.5 rounded"
          style={{
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(4px)",
          }}
        >
          <span style={{ ...mono, fontSize: "0.72rem", color: "#94a3b8" }}>
            {fmt(currentTime)}
          </span>
        </div>

        {/* HUD: status text */}
        <div className="absolute bottom-3 left-0 right-0 text-center">
          <span
            style={{
              ...mono,
              fontSize: "0.65rem",
              color: "rgba(148,163,184,0.7)",
              letterSpacing: "0.08em",
            }}
          >
            {scanStatus === "scanning"
              ? "MEMINDAI WAJAH..."
              : scanStatus === "matching"
                ? "MENCOCOKKAN DENGAN DATABASE..."
                : scanStatus === "success"
                  ? "WAJAH TERIDENTIFIKASI"
                  : scanStatus === "failed"
                    ? "PENCOCOKAN GAGAL"
                    : "ARAHKAN WAJAH KE KAMERA"}
          </span>
        </div>
      </div>

      {/* ── Face Matching Panel ── (visible during & after scan) */}
      {(scanStatus === "matching" ||
        scanStatus === "success" ||
        scanStatus === "failed") &&
        detectedEmployee && (
          <div
            className="w-full rounded-xl overflow-hidden"
            style={{
              background: "#0d1117",
              border: `1px solid ${frameBorderColor}30`,
            }}
          >
            <div
              className="px-4 py-2 flex items-center gap-2"
              style={{
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                background: "#111827",
              }}
            >
              <Database size={13} style={{ color: "#3b82f6" }} />
              <span
                style={{
                  ...mono,
                  fontSize: "0.68rem",
                  color: "#64748b",
                  letterSpacing: "0.06em",
                }}
              >
                PENCOCOKAN WAJAH — DATABASE
              </span>
            </div>

            <div className="p-4 flex items-center gap-5">
              {/* Live frame placeholder */}
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className="rounded-xl overflow-hidden"
                  style={{
                    width: 72,
                    height: 72,
                    background: "#1e2a3a",
                    border: "2px solid rgba(59,130,246,0.3)",
                  }}
                >
                  <div className="w-full h-full flex items-center justify-center">
                    <Camera
                      size={28}
                      style={{ color: "rgba(59,130,246,0.4)" }}
                    />
                  </div>
                </div>
                <span style={{ ...mono, fontSize: "0.6rem", color: "#374151" }}>
                  LIVE FRAME
                </span>
              </div>

              {/* Match lines */}
              <div className="flex-1 flex flex-col gap-2">
                {/* Percentage bar */}
                <div className="flex items-center justify-between mb-0.5">
                  <span
                    style={{ ...mono, fontSize: "0.68rem", color: "#64748b" }}
                  >
                    TINGKAT KECOCOKAN
                  </span>
                  <span
                    style={{
                      ...mono,
                      fontSize: "0.9rem",
                      fontWeight: 700,
                      color:
                        matchPercent >= MATCH_THRESHOLD
                          ? "#22c55e"
                          : matchPercent > 80
                            ? "#eab308"
                            : "#ef4444",
                    }}
                  >
                    {matchPercent}%
                  </span>
                </div>
                <div
                  className="w-full h-2 rounded-full"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-150"
                    style={{
                      width: `${matchPercent}%`,
                      background:
                        matchPercent >= MATCH_THRESHOLD
                          ? "linear-gradient(90deg,#15803d,#22c55e)"
                          : matchPercent > 80
                            ? "linear-gradient(90deg,#a16207,#eab308)"
                            : "linear-gradient(90deg,#b91c1c,#ef4444)",
                    }}
                  />
                </div>

                {/* Threshold markers */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: "#ef4444" }}
                    />
                    <span
                      style={{ ...mono, fontSize: "0.58rem", color: "#374151" }}
                    >
                      {"<80% Tidak cocok"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: "#eab308" }}
                    />
                    <span
                      style={{ ...mono, fontSize: "0.58rem", color: "#374151" }}
                    >
                      80–92% Rendah
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: "#22c55e" }}
                    />
                    <span
                      style={{ ...mono, fontSize: "0.58rem", color: "#374151" }}
                    >
                      {"≥93% Cocok ✓"}
                    </span>
                  </div>
                </div>

                {/* Result badge */}
                {(scanStatus === "success" || scanStatus === "failed") && (
                  <div
                    className="flex items-center gap-2 mt-1 px-3 py-1.5 rounded-lg"
                    style={{
                      background:
                        scanStatus === "success"
                          ? "rgba(34,197,94,0.1)"
                          : "rgba(239,68,68,0.1)",
                      border: `1px solid ${scanStatus === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                    }}
                  >
                    {scanStatus === "success" ? (
                      <CheckCircle size={13} style={{ color: "#22c55e" }} />
                    ) : (
                      <AlertCircle size={13} style={{ color: "#ef4444" }} />
                    )}
                    <span
                      style={{
                        ...mono,
                        fontSize: "0.7rem",
                        color: scanStatus === "success" ? "#22c55e" : "#ef4444",
                      }}
                    >
                      {scanStatus === "success"
                        ? `${detectedEmployee.name} — Absensi berhasil dicatat`
                        : detectedEmployee.photo
                          ? `Wajah tidak cocok dengan ${detectedEmployee.name}`
                          : `${detectedEmployee.name} belum memiliki foto database`}
                    </span>
                  </div>
                )}
              </div>

              {/* VS divider */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    width: 1,
                    height: 20,
                    background: "rgba(255,255,255,0.06)",
                  }}
                />
                <span
                  style={{ ...mono, fontSize: "0.62rem", color: "#374151" }}
                >
                  VS
                </span>
                <div
                  style={{
                    width: 1,
                    height: 20,
                    background: "rgba(255,255,255,0.06)",
                  }}
                />
              </div>

              {/* Database photo */}
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className="rounded-xl overflow-hidden"
                  style={{
                    width: 72,
                    height: 72,
                    border: `2px solid ${detectedEmployee.photo ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.1)"}`,
                  }}
                >
                  {detectedEmployee.photo ? (
                    <img
                      src={detectedEmployee.photo}
                      alt={detectedEmployee.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{
                        background:
                          avatarGradients[
                            empIdx >= 0 ? empIdx % avatarGradients.length : 0
                          ],
                        fontSize: 28,
                        fontWeight: 700,
                        color: "#fff",
                      }}
                    >
                      {detectedEmployee.name.charAt(0)}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    ...mono,
                    fontSize: "0.6rem",
                    color: detectedEmployee.photo ? "#3b82f6" : "#374151",
                  }}
                >
                  {detectedEmployee.photo ? "FOTO DB" : "NO PHOTO"}
                </span>
              </div>
            </div>
          </div>
        )}

      {/* ── Employee info card ── */}
      <div
        className="w-full rounded-xl p-4"
        style={{
          background: "#111827",
          border: "1px solid rgba(59,130,246,0.15)",
        }}
      >
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div
            className="rounded-xl overflow-hidden flex-shrink-0"
            style={{
              width: 52,
              height: 52,
              border: "2px solid rgba(59,130,246,0.3)",
            }}
          >
            {displayEmployee?.photo ? (
              <img
                src={displayEmployee.photo}
                alt={displayEmployee.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{
                  background:
                    avatarGradients[
                      (empIdx >= 0 ? empIdx : 0) % avatarGradients.length
                    ],
                  fontSize: "1.3rem",
                  fontWeight: 700,
                  color: "#fff",
                }}
              >
                {displayEmployee?.name.charAt(0) ?? "?"}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p
              style={{
                color: "#e8ecf4",
                fontWeight: 600,
                fontSize: "1rem",
                lineHeight: 1.3,
              }}
            >
              {displayEmployee?.name ?? "—"}
            </p>
            <p
              style={{
                ...mono,
                fontSize: "0.75rem",
                color: "#3b82f6",
                marginTop: 2,
              }}
            >
              {displayEmployee?.nip ?? "—"}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span
                className="px-2 py-0.5 rounded"
                style={{
                  background: "rgba(59,130,246,0.1)",
                  color: "#94a3b8",
                  fontSize: "0.72rem",
                  border: "1px solid rgba(59,130,246,0.2)",
                  ...mono,
                }}
              >
                {displayEmployee?.jabatan ?? "—"}
              </span>
              {displayEmployee?.photo ? (
                <span
                  style={{ ...mono, fontSize: "0.65rem", color: "#22c55e" }}
                >
                  ● Foto terdaftar
                </span>
              ) : (
                <span
                  style={{ ...mono, fontSize: "0.65rem", color: "#ef4444" }}
                >
                  ● Belum ada foto
                </span>
              )}
            </div>
          </div>

          {/* Time */}
          <div className="text-right flex-shrink-0">
            <p
              style={{
                ...mono,
                fontSize: "1rem",
                fontWeight: 600,
                color: "#e8ecf4",
              }}
            >
              {fmt(currentTime)}
            </p>
            <p
              style={{
                ...mono,
                fontSize: "0.65rem",
                color: "#64748b",
                marginTop: 2,
              }}
            >
              {fmtDate(currentTime)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Absen button ── */}
      <button
        onClick={handleAbsen}
        disabled={scanStatus !== "idle" || !cameraActive}
        className="w-full rounded-xl py-3.5 flex items-center justify-center gap-2 transition-all"
        style={{
          background:
            scanStatus === "success"
              ? "linear-gradient(135deg,#15803d,#22c55e)"
              : scanStatus === "failed"
                ? "rgba(239,68,68,0.3)"
                : scanStatus !== "idle"
                  ? "rgba(59,130,246,0.4)"
                  : !cameraActive
                    ? "rgba(255,255,255,0.05)"
                    : "linear-gradient(135deg,#1d4ed8,#3b82f6)",
          color: !cameraActive ? "#374151" : "#ffffff",
          fontWeight: 600,
          cursor:
            scanStatus !== "idle" || !cameraActive ? "not-allowed" : "pointer",
          boxShadow:
            scanStatus === "idle" && cameraActive
              ? "0 6px 20px rgba(59,130,246,0.35)"
              : "none",
        }}
      >
        {scanStatus === "scanning" ? (
          <>
            <Loader size={18} className="animate-spin" /> Memindai Wajah...
          </>
        ) : scanStatus === "matching" ? (
          <>
            <Loader size={18} className="animate-spin" /> Mencocokkan
            Database...
          </>
        ) : scanStatus === "success" ? (
          <>
            <CheckCircle size={18} /> Absensi Tercatat ({matchPercent}% cocok)
          </>
        ) : scanStatus === "failed" ? (
          <>
            <ShieldAlert size={18} /> Gagal — Kecocokan {matchPercent}% (min{" "}
            {MATCH_THRESHOLD}%)
          </>
        ) : (
          <>
            <Camera size={18} /> Absen Sekarang
          </>
        )}
      </button>

      {!cameraActive && permission === "denied" && (
        <p
          className="text-center"
          style={{ color: "#ef4444", fontSize: "0.75rem", ...mono }}
        >
          <AlertCircle size={12} className="inline mr-1" />
          Izinkan akses kamera di pengaturan browser.
        </p>
      )}

      <style>{`
        @keyframes scanline {
          0%   { top: 20%; opacity: 1; }
          50%  { top: 75%; opacity: 0.6; }
          100% { top: 20%; opacity: 1; }
        }
      `}</style>
    </div>
  );
}
