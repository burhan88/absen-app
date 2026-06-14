import { useState, useRef, useEffect } from "react";
import {
  LogOut, Users, Search, Plus, Pencil, Trash2, X, Shield,
  UserCog, CalendarDays, ChevronDown, Save, Settings, MapPin,
  Building2, AlertTriangle, FileText, FileSpreadsheet, Printer,
  CheckCircle, Clock, XCircle, FileBarChart2, Lock, Upload, ImageIcon,
  Camera, AlertCircle, Loader,
} from "lucide-react";
import { getEmployees, setEmployees, subscribe, avatarGradients } from "../store/employeeStore";
import type { Employee } from "../store/employeeStore";
import jsPDF from "jspdf";
// @ts-ignore
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";

// Helper to check if Supabase is configured
const hasSupabase = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

// ─── Types ────────────────────────────────────────────────────────────────────

// Employee imported from store (includes photo field)
interface AttendanceRecord {
  id: string; employeeId: string; name: string; nip: string;
  date: string; timeIn: string; status: "Hadir" | "Terlambat" | "Tidak Hadir" | "Izin";
}
interface AccountRole {
  id: string; username: string; email: string;
  role: "Admin" | "Operator" | "Viewer"; status: "Aktif" | "Nonaktif"; lastLogin: string;
}
interface AppSettings {
  companyName: string; latitude: string; longitude: string;
  radiusAbsen: string; jamMulaiCheckin: string; batasAkhirCheckin: string; maxAkurasiGPS: string;
}

type PermLevel = boolean;
interface ModulePerms { lihat: PermLevel; tambah: PermLevel; edit: PermLevel; hapus: PermLevel; }
type RoleKey = "Admin" | "Operator" | "Viewer";
type ModuleKey = "Dashboard" | "Karyawan" | "Akun & Role" | "Pengaturan" | "Laporan";

type PermMatrix = Record<RoleKey, Record<ModuleKey, ModulePerms>>;

// ─── Seed data ────────────────────────────────────────────────────────────────

// employees managed via employeeStore
const seedEmployees = [
  { id: "e1", name: "Budi Santoso",  nip: "PEG-001" },
  { id: "e2", name: "Siti Rahayu",   nip: "PEG-002" },
  { id: "e3", name: "Ahmad Fauzi",   nip: "PEG-003" },
  { id: "e4", name: "Dewi Lestari",  nip: "PEG-004" },
  { id: "e5", name: "Rizky Pratama", nip: "PEG-005" },
];

// Generate 3 weeks of attendance data
const genAttendance = (): AttendanceRecord[] => {
  const statuses: AttendanceRecord["status"][] = ["Hadir","Hadir","Hadir","Terlambat","Tidak Hadir","Izin","Hadir"];
  const result: AttendanceRecord[] = [];
  let idx = 1;
  for (let d = 0; d < 21; d++) {
    const date = new Date("2026-06-01");
    date.setDate(date.getDate() + d);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    const dateStr = date.toISOString().slice(0, 10);
    seedEmployees.forEach((emp, ei) => {
      const st = statuses[(d + ei) % statuses.length];
      result.push({
        id: `a${idx++}`, employeeId: emp.id, name: emp.name, nip: emp.nip,
        date: dateStr, timeIn: st === "Tidak Hadir" ? "--:--" : `0${7 + (ei % 2)}:${String((d * 7 + ei * 13) % 60).padStart(2,"0")}`,
        status: st,
      });
    });
  }
  return result;
};

const seedAttendance: AttendanceRecord[] = genAttendance();

const seedAccounts: AccountRole[] = [
  { id: "r1", username: "admin",     email: "admin@company.id",    role: "Admin",    status: "Aktif",    lastLogin: "2026-06-11 08:00" },
  { id: "r2", username: "operator1", email: "operator@company.id", role: "Operator", status: "Aktif",    lastLogin: "2026-06-10 14:22" },
  { id: "r3", username: "viewer1",   email: "viewer@company.id",   role: "Viewer",   status: "Nonaktif", lastLogin: "2026-06-01 09:10" },
];

const defaultSettings: AppSettings = {
  companyName: "PT. Maju Bersama", latitude: "-6.200000", longitude: "106.816666",
  radiusAbsen: "100", jamMulaiCheckin: "07:00", batasAkhirCheckin: "08:30", maxAkurasiGPS: "50",
};

const MODULES: ModuleKey[] = ["Dashboard", "Karyawan", "Akun & Role", "Pengaturan", "Laporan"];
const PERMS: (keyof ModulePerms)[] = ["lihat", "tambah", "edit", "hapus"];

const fullAccess: ModulePerms = { lihat: true, tambah: true, edit: true, hapus: true };
const readOnly:   ModulePerms = { lihat: true, tambah: false, edit: false, hapus: false };
const noAccess:   ModulePerms = { lihat: false, tambah: false, edit: false, hapus: false };

const defaultPerms: PermMatrix = {
  Admin: {
    Dashboard: fullAccess, Karyawan: fullAccess,
    "Akun & Role": fullAccess, Pengaturan: fullAccess, Laporan: fullAccess,
  },
  Operator: {
    Dashboard: readOnly,
    Karyawan: { lihat: true, tambah: true, edit: true, hapus: false },
    "Akun & Role": noAccess, Pengaturan: noAccess,
    Laporan: readOnly,
  },
  Viewer: {
    Dashboard: readOnly, Karyawan: readOnly,
    "Akun & Role": noAccess, Pengaturan: noAccess, Laporan: readOnly,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'JetBrains Mono', monospace" };
const COMPANY = "PT. Maju Bersama";

const MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    Hadir:         { bg: "rgba(34,197,94,0.12)",   text: "#22c55e", border: "rgba(34,197,94,0.3)" },
    Terlambat:     { bg: "rgba(234,179,8,0.12)",   text: "#eab308", border: "rgba(234,179,8,0.3)" },
    "Tidak Hadir": { bg: "rgba(239,68,68,0.12)",   text: "#ef4444", border: "rgba(239,68,68,0.3)" },
    Izin:          { bg: "rgba(168,85,247,0.12)",  text: "#a855f7", border: "rgba(168,85,247,0.3)" },
    Aktif:         { bg: "rgba(34,197,94,0.12)",   text: "#22c55e", border: "rgba(34,197,94,0.3)" },
    Nonaktif:      { bg: "rgba(100,116,139,0.12)", text: "#64748b", border: "rgba(100,116,139,0.3)" },
    Admin:         { bg: "rgba(59,130,246,0.12)",  text: "#3b82f6", border: "rgba(59,130,246,0.3)" },
    Operator:      { bg: "rgba(234,179,8,0.12)",   text: "#eab308", border: "rgba(234,179,8,0.3)" },
    Viewer:        { bg: "rgba(100,116,139,0.12)", text: "#94a3b8", border: "rgba(100,116,139,0.3)" },
  };
  const c = map[status] ?? map["Nonaktif"];
  return <span className="px-2 py-0.5 rounded" style={{ ...mono, fontSize: "0.7rem", background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>{status}</span>;
}

function FieldInput({ label, value, onChange, type = "text", children, hint }: {
  label: string; value: string; onChange?: (v: string) => void;
  type?: string; children?: React.ReactNode; hint?: string;
}) {
  return (
    <div>
      <label style={{ ...mono, color: "#64748b", fontSize: "0.68rem", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>{label.toUpperCase()}</label>
      {children ?? (
        <input type={type} value={value} onChange={(e) => onChange?.(e.target.value)}
          className="w-full rounded-lg px-3 py-2 outline-none"
          style={{ background: "#1e2a3a", border: "1px solid rgba(59,130,246,0.2)", color: "#e8ecf4", fontSize: "0.88rem" }}
          onFocus={(e) => (e.target.style.borderColor = "rgba(59,130,246,0.6)")}
          onBlur={(e) => (e.target.style.borderColor = "rgba(59,130,246,0.2)")} />
      )}
      {hint && <p style={{ ...mono, fontSize: "0.65rem", color: "#374151", marginTop: 3 }}>{hint}</p>}
    </div>
  );
}

function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <FieldInput label={label} value={value}>
      <div className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg px-3 py-2 outline-none appearance-none"
          style={{ background: "#1e2a3a", border: "1px solid rgba(59,130,246,0.2)", color: "#e8ecf4", fontSize: "0.88rem" }}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#64748b" }} />
      </div>
    </FieldInput>
  );
}

function Modal({ title, onClose, children, maxW = "max-w-lg" }: { title: string; onClose: () => void; children: React.ReactNode; maxW?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${maxW} mx-4 rounded-xl overflow-hidden`} style={{ background: "#111827", border: "1px solid rgba(59,130,246,0.25)", boxShadow: "0 0 40px rgba(59,130,246,0.12)" }}>
        <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg,#1d4ed8,#3b82f6,#60a5fa)" }} />
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <p style={{ color: "#e8ecf4", fontWeight: 600, fontSize: "0.95rem" }}>{title}</p>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10" style={{ color: "#64748b" }}><X size={15} /></button>
        </div>
        <div className="p-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function ConfirmModal({ message, confirmLabel = "Hapus", danger = true, onConfirm, onCancel }: {
  message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm mx-4 rounded-xl p-6" style={{ background: "#111827", border: `1px solid ${danger ? "rgba(239,68,68,0.3)" : "rgba(59,130,246,0.3)"}` }}>
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={18} style={{ color: danger ? "#ef4444" : "#eab308", flexShrink: 0, marginTop: 1 }} />
          <p style={{ color: "#e8ecf4", fontSize: "0.88rem", lineHeight: 1.6 }}>{message}</p>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontSize: "0.82rem", border: "1px solid rgba(255,255,255,0.08)" }}>Batal</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg" style={{ background: danger ? "rgba(239,68,68,0.15)" : "rgba(59,130,246,0.15)", color: danger ? "#ef4444" : "#3b82f6", fontSize: "0.82rem", border: `1px solid ${danger ? "rgba(239,68,68,0.3)" : "rgba(59,130,246,0.3)"}` }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Camera Capture Modal ─────────────────────────────────────────────────────

function CameraCaptureModal({ onCapture, onClose }: { onCapture: (b64: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [camErr, setCamErr] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } })
      .then((s) => {
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; }
        setReady(true);
      })
      .catch(() => setCamErr(true));
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const startCountdown = () => {
    let n = 3;
    setCountdown(n);
    const iv = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(iv);
        setCountdown(null);
        shoot();
      } else {
        setCountdown(n);
      }
    }, 1000);
  };

  const shoot = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror horizontally to match what user sees
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCaptured(dataUrl);
  };

  const retake = () => setCaptured(null);

  const confirm = () => {
    if (captured) {
      onCapture(captured);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md mx-4 rounded-2xl overflow-hidden"
        style={{ background: "#0d1117", border: "1px solid rgba(59,130,246,0.3)", boxShadow: "0 0 60px rgba(59,130,246,0.2)" }}>

        {/* Top stripe */}
        <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg,#1d4ed8,#3b82f6,#60a5fa)" }} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2.5">
            <Camera size={16} style={{ color: "#3b82f6" }} />
            <span style={{ color: "#e8ecf4", fontWeight: 600, fontSize: "0.9rem" }}>Ambil Foto dari Kamera</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10"
            style={{ color: "#64748b" }}><X size={15} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* Viewfinder */}
          <div className="relative w-full rounded-xl overflow-hidden"
            style={{ aspectRatio: "4/3", background: "#0a0e1a", border: `2px solid ${captured ? "rgba(34,197,94,0.5)" : "rgba(59,130,246,0.3)"}` }}>

            {/* Live video */}
            {!captured && (
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover"
                style={{ transform: "scaleX(-1)", display: ready ? "block" : "none" }} />
            )}

            {/* Captured preview */}
            {captured && <img src={captured} alt="captured" className="w-full h-full object-cover" />}

            {/* Error */}
            {camErr && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <AlertCircle size={32} style={{ color: "#ef4444" }} />
                <p style={{ ...mono, color: "#ef4444", fontSize: "0.75rem" }}>Tidak dapat mengakses kamera</p>
              </div>
            )}

            {/* Loading */}
            {!ready && !camErr && !captured && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <Loader size={24} className="animate-spin" style={{ color: "#3b82f6" }} />
                <p style={{ ...mono, color: "#64748b", fontSize: "0.72rem" }}>Memuat kamera...</p>
              </div>
            )}

            {/* Face guide oval */}
            {ready && !captured && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <svg width="55%" height="75%" viewBox="0 0 100 130">
                  <ellipse cx="50" cy="62" rx="46" ry="58"
                    fill="none" stroke="rgba(59,130,246,0.55)" strokeWidth="2"
                    strokeDasharray="8 4" />
                </svg>
              </div>
            )}

            {/* Countdown overlay */}
            {countdown !== null && (
              <div className="absolute inset-0 flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.45)" }}>
                <div className="flex items-center justify-center rounded-full"
                  style={{ width: 80, height: 80, background: "rgba(59,130,246,0.2)", border: "3px solid #3b82f6" }}>
                  <span style={{ color: "#3b82f6", fontSize: "2.5rem", fontWeight: 800, ...mono }}>{countdown}</span>
                </div>
              </div>
            )}

            {/* Success badge on captured */}
            {captured && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{ background: "rgba(34,197,94,0.85)", backdropFilter: "blur(4px)" }}>
                <CheckCircle size={12} color="#fff" />
                <span style={{ ...mono, fontSize: "0.65rem", color: "#fff", letterSpacing: "0.06em" }}>FOTO DIAMBIL</span>
              </div>
            )}

            {/* Live badge */}
            {ready && !captured && countdown === null && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#ef4444", boxShadow: "0 0 5px #ef4444" }} />
                <span style={{ ...mono, fontSize: "0.65rem", color: "#ef4444", letterSpacing: "0.08em" }}>LIVE</span>
              </div>
            )}
          </div>

          {/* Hidden canvas for capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Instruction */}
          {!captured && ready && countdown === null && (
            <p style={{ ...mono, textAlign: "center", fontSize: "0.68rem", color: "#64748b" }}>
              Posisikan wajah di dalam panduan oval, lalu klik tombol di bawah
            </p>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {!captured ? (
              <>
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontSize: "0.85rem", border: "1px solid rgba(255,255,255,0.08)" }}>
                  Batal
                </button>
                <button
                  onClick={startCountdown}
                  disabled={!ready || countdown !== null}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all"
                  style={{
                    background: !ready || countdown !== null ? "rgba(59,130,246,0.3)" : "linear-gradient(135deg,#1d4ed8,#3b82f6)",
                    color: "#fff", fontSize: "0.88rem", fontWeight: 600,
                    boxShadow: ready && countdown === null ? "0 4px 16px rgba(59,130,246,0.35)" : "none",
                    cursor: !ready || countdown !== null ? "not-allowed" : "pointer",
                  }}>
                  <Camera size={16} />
                  {countdown !== null ? `Mengambil dalam ${countdown}...` : "Ambil Foto (3 detik)"}
                </button>
              </>
            ) : (
              <>
                <button onClick={retake} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontSize: "0.85rem", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <Camera size={15} /> Ambil Ulang
                </button>
                <button onClick={confirm}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl"
                  style={{ background: "linear-gradient(135deg,#15803d,#22c55e)", color: "#fff", fontSize: "0.88rem", fontWeight: 600, boxShadow: "0 4px 16px rgba(34,197,94,0.3)" }}>
                  <CheckCircle size={16} /> Gunakan Foto Ini
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Photo upload helper ───────────────────────────────────────────────────────

function PhotoUpload({ photo, onPhoto }: { photo: string | null; onPhoto: (b64: string | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [showCamera, setShowCamera] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = () => onPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="col-span-2">
      <label style={{ ...mono, color: "#64748b", fontSize: "0.68rem", letterSpacing: "0.07em", display: "block", marginBottom: 8 }}>
        FOTO WAJAH (DATABASE)
      </label>

      <div className="flex items-start gap-5">
        {/* Preview */}
        <div className="relative flex-shrink-0">
          <div className="rounded-2xl overflow-hidden flex items-center justify-center"
            style={{ width: 100, height: 100, background: photo ? "transparent" : "#1a2234", border: `2px solid ${photo ? "rgba(34,197,94,0.5)" : "rgba(59,130,246,0.25)"}` }}>
            {photo
              ? <img src={photo} alt="foto" className="w-full h-full object-cover" />
              : <ImageIcon size={30} color="#374151" />}
          </div>
          {photo && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: "#22c55e", border: "2px solid #111827" }}>
              <CheckCircle size={11} color="#fff" />
            </div>
          )}
        </div>

        {/* Buttons column */}
        <div className="flex flex-col gap-2 flex-1">
          {/* Camera button — primary */}
          <button type="button" onClick={() => setShowCamera(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl w-full justify-center transition-all"
            style={{ background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", fontSize: "0.85rem", fontWeight: 600, boxShadow: "0 4px 12px rgba(59,130,246,0.3)" }}>
            <Camera size={15} /> Ambil dari Kamera
          </button>

          {/* Upload file — secondary */}
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl w-full justify-center"
            style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)", color: "#3b82f6", fontSize: "0.82rem" }}>
            <Upload size={14} /> Upload dari File
          </button>

          {/* Delete */}
          {photo && (
            <button type="button" onClick={() => onPhoto(null)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl w-full justify-center"
              style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontSize: "0.82rem" }}>
              <Trash2 size={14} /> Hapus Foto
            </button>
          )}

          <p style={{ ...mono, fontSize: "0.6rem", color: "#374151", lineHeight: 1.6 }}>
            Kamera: langsung ambil wajah dari webcam<br />
            File: JPG/PNG maks 5 MB · threshold pencocokan 93%
          </p>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {showCamera && (
        <CameraCaptureModal
          onCapture={(b64) => onPhoto(b64)}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}

function EmployeeAvatar({ emp, size = 28, idx = 0 }: { emp: Employee; size?: number; idx?: number }) {
  if (emp.photo) {
    return (
      <div style={{ width: size, height: size, borderRadius: size * 0.35, overflow: "hidden", flexShrink: 0, border: "1.5px solid rgba(59,130,246,0.4)" }}>
        <img src={emp.photo} alt={emp.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.35, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: avatarGradients[idx % avatarGradients.length], fontSize: size * 0.42, fontWeight: 700, color: "#fff" }}>
      {emp.name.charAt(0)}
    </div>
  );
}

// ─── Tab: Karyawan ────────────────────────────────────────────────────────────

function EmployeeTab() {
  const [emps, setEmps] = useState<Employee[]>(() => getEmployees());
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Employee, "id">>({ name: "", nip: "", jabatan: "", departemen: "", email: "", phone: "", status: "Aktif", photo: null });
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => subscribe(() => setEmps(getEmployees())), []);

  const syncSet = async (list: Employee[]) => {
    setEmps(list);
    setEmployees(list);
  };

  const f = (k: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [k]: v }));
  
  const openAdd = () => { 
    setForm({ name: "", nip: "", jabatan: "", departemen: "", email: "", phone: "", status: "Aktif", photo: null }); 
    setEditId(null); 
    setModal("add"); 
  };
  
  const openEdit = (emp: Employee) => { 
    const { id, ...rest } = emp; 
    setForm(rest); 
    setEditId(id); 
    setModal("edit"); 
  };

  const save = async () => {
    if (!form.name || !form.nip) return;
    setLoading(true);

    try {
      if (hasSupabase()) {
        if (modal === "add") {
          const { data, error } = await supabase.from('employees').insert([form]).select();
          if (error) throw error;
          if (data) syncSet([...emps, data[0]]);
        } else if (editId) {
          const { error } = await supabase.from('employees').update(form).eq('id', editId);
          if (error) throw error;
          syncSet(emps.map((e) => e.id === editId ? { ...form, id: editId } : e));
        }
      } else {
        // Fallback local
        if (modal === "add") syncSet([...emps, { ...form, id: `e${Date.now()}` }]);
        else if (editId) syncSet(emps.map((e) => e.id === editId ? { ...form, id: editId } : e));
      }
      setModal(null);
    } catch (err) {
      console.error("Save error:", err);
      alert("Gagal menyimpan data karyawan.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setLoading(true);
    try {
      if (hasSupabase()) {
        const { error } = await supabase.from('employees').delete().eq('id', deleteId);
        if (error) throw error;
      }
      syncSet(emps.filter((e) => e.id !== deleteId));
      setDeleteId(null);
    } catch (err) {
      console.error("Delete error:", err);
      alert("Gagal menghapus data karyawan.");
    } finally {
      setLoading(false);
    }
  };

  const filtered = emps.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()) || e.nip.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#64748b" }} />
          <input type="text" placeholder="Cari nama / NIP..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-4 py-2 rounded-lg outline-none" style={{ background: "#1e2a3a", border: "1px solid rgba(59,130,246,0.2)", color: "#e8ecf4", fontSize: "0.82rem", width: 200 }} />
        </div>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
          style={{ background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", fontSize: "0.82rem", fontWeight: 500, boxShadow: "0 4px 12px rgba(59,130,246,0.3)" }}>
          <Plus size={14} /> Tambah Karyawan
        </button>
      </div>

      {/* Photo coverage bar */}
      <div className="flex items-center gap-3 mb-4 px-1">
        <ImageIcon size={13} style={{ color: "#3b82f6" }} />
        <span style={{ ...mono, fontSize: "0.7rem", color: "#64748b" }}>
          Foto wajah: <span style={{ color: "#3b82f6" }}>{emps.filter(e => e.photo).length}</span> / {emps.length} karyawan
        </span>
        <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${emps.length ? (emps.filter(e => e.photo).length / emps.length) * 100 : 0}%`, background: "linear-gradient(90deg,#1d4ed8,#3b82f6)" }} />
        </div>
        <span style={{ ...mono, fontSize: "0.65rem", color: "#374151" }}>Threshold pencocokan: 93%</span>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full">
          <thead><tr style={{ background: "#0f1924" }}>
            {["FOTO","NIP","NAMA","JABATAN","DEPARTEMEN","STATUS","AKSI"].map((h) => (
              <th key={h} className="text-left px-4 py-3" style={{ ...mono, color: "#374151", fontSize: "0.65rem", letterSpacing: "0.08em" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>{filtered.map((emp, i) => (
            <tr key={emp.id} className="transition-colors hover:bg-white/[0.02]" style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.03)" }}>
              <td className="px-4 py-2.5">
                <div className="relative inline-block">
                  <EmployeeAvatar emp={emp} size={36} idx={i} />
                  <div style={{ position: "absolute", bottom: -2, right: -2, width: 11, height: 11, borderRadius: "50%", background: emp.photo ? "#22c55e" : "#374151", border: "2px solid #111827" }}
                    title={emp.photo ? "Foto wajah tersimpan di database" : "Belum ada foto — upload untuk aktifkan absensi wajah"} />
                </div>
              </td>
              <td className="px-4 py-3"><span style={{ ...mono, fontSize: "0.75rem", color: "#3b82f6" }}>{emp.nip}</span></td>
              <td className="px-4 py-3"><span style={{ color: "#e8ecf4", fontSize: "0.85rem" }}>{emp.name}</span></td>
              <td className="px-4 py-3"><span style={{ color: "#94a3b8", fontSize: "0.82rem" }}>{emp.jabatan}</span></td>
              <td className="px-4 py-3"><span style={{ color: "#64748b", fontSize: "0.8rem" }}>{emp.departemen}</span></td>
              <td className="px-4 py-3">{statusBadge(emp.status)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(emp)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10" style={{ color: "#3b82f6" }}><Pencil size={13} /></button>
                  <button onClick={() => setDeleteId(emp.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10" style={{ color: "#ef4444" }}><Trash2 size={13} /></button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
        {filtered.length === 0 && <div className="py-10 text-center" style={{ ...mono, color: "#374151", fontSize: "0.78rem" }}>Tidak ada data karyawan.</div>}
      </div>

      {(modal === "add" || modal === "edit") && (
        <Modal title={modal === "add" ? "Tambah Karyawan" : "Edit Karyawan"} onClose={() => setModal(null)} maxW="max-w-xl">
          <div className="grid grid-cols-2 gap-4">
            <PhotoUpload photo={form.photo} onPhoto={(b64) => setForm((p) => ({ ...p, photo: b64 }))} />
            <FieldInput label="Nama Lengkap" value={form.name} onChange={f("name")} />
            <FieldInput label="NIP" value={form.nip} onChange={f("nip")} />
            <FieldInput label="Jabatan" value={form.jabatan} onChange={f("jabatan")} />
            <FieldInput label="Departemen" value={form.departemen} onChange={f("departemen")} />
            <FieldInput label="Email" value={form.email} onChange={f("email")} type="email" />
            <FieldInput label="No. HP" value={form.phone} onChange={f("phone")} />
            <SelectInput label="Status" value={form.status} onChange={f("status")} options={["Aktif", "Nonaktif"]} />
          </div>
          <div className="flex justify-end gap-3 mt-5">
            <button onClick={() => setModal(null)} className="px-4 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontSize: "0.85rem", border: "1px solid rgba(255,255,255,0.08)" }}>Batal</button>
            <button onClick={save} className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", fontSize: "0.85rem", fontWeight: 500 }}><Save size={14} /> Simpan</button>
          </div>
        </Modal>
      )}
      {deleteId && <ConfirmModal message="Yakin ingin menghapus data karyawan ini?" onConfirm={() => { syncSet(emps.filter((e) => e.id !== deleteId)); setDeleteId(null); }} onCancel={() => setDeleteId(null)} />}
    </>
  );
}

// ─── Tab: Akun & Role + Permission Matrix ─────────────────────────────────────

function AccountTab() {
  const [accounts, setAccounts] = useState<AccountRole[]>([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<AccountRole, "id" | "lastLogin">>({ username: "", email: "", role: "Operator", status: "Aktif" });
  const [password, setPassword] = useState("");
  const [perms, setPerms] = useState<PermMatrix>(defaultPerms);
  const [permSaved, setPermSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchAccounts = async () => {
    if (!hasSupabase()) {
      setAccounts(seedAccounts);
      return;
    }
    const { data, error } = await supabase.from('accounts').select('*');
    if (error) {
      console.error("Fetch accounts error:", error);
    } else if (data) {
      setAccounts(data.map(a => ({
        id: a.id,
        username: a.username,
        email: a.email,
        role: a.role as RoleKey,
        status: a.status as "Aktif" | "Nonaktif",
        lastLogin: a.last_login ? new Date(a.last_login).toLocaleString() : "-"
      })));
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const f = (k: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [k]: v }));
  const openAdd = () => { setForm({ username: "", email: "", role: "Operator", status: "Aktif" }); setPassword(""); setEditId(null); setModal("add"); };
  const openEdit = (acc: AccountRole) => { 
    const { id, lastLogin, ...rest } = acc; 
    setForm(rest); 
    setPassword(""); 
    setEditId(id); 
    setModal("edit"); 
  };

  const save = async () => {
    if (!form.username || !form.email) return;
    setLoading(true);
    try {
      if (hasSupabase()) {
        const payload: any = {
          username: form.username,
          email: form.email,
          role: form.role,
          status: form.status
        };
        if (password) payload.password = password;

        if (modal === "add") {
          const { error } = await supabase.from('accounts').insert([payload]);
          if (error) throw error;
        } else if (editId) {
          const { error } = await supabase.from('accounts').update(payload).eq('id', editId);
          if (error) throw error;
        }
        await fetchAccounts();
      } else {
        if (modal === "add") setAccounts((p) => [...p, { ...form, id: `r${Date.now()}`, lastLogin: "-" }]);
        else if (editId) setAccounts((p) => p.map((a) => a.id === editId ? { ...form, id: editId, lastLogin: a.lastLogin } : a));
      }
      setModal(null);
    } catch (err) {
      console.error("Save account error:", err);
      alert("Gagal menyimpan data akun.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setLoading(true);
    try {
      if (hasSupabase()) {
        const { error } = await supabase.from('accounts').delete().eq('id', deleteId);
        if (error) throw error;
      }
      setAccounts((p) => p.filter((a) => a.id !== deleteId));
      setDeleteId(null);
    } catch (err) {
      console.error("Delete account error:", err);
      alert("Gagal menghapus akun.");
    } finally {
      setLoading(false);
    }
  };

  const togglePerm = (role: RoleKey, mod: ModuleKey, perm: keyof ModulePerms) => {
    if (role === "Admin") return; // Admin always full
    setPerms((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as PermMatrix;
      next[role][mod][perm] = !next[role][mod][perm];
      // if tambah/edit/hapus enabled, lihat must be true
      if (perm !== "lihat" && next[role][mod][perm]) next[role][mod].lihat = true;
      // if lihat disabled, all must be false
      if (perm === "lihat" && !next[role][mod][perm]) {
        next[role][mod].tambah = false;
        next[role][mod].edit = false;
        next[role][mod].hapus = false;
      }
      return next;
    });
  };

  const savePerms = () => { setPermSaved(true); setTimeout(() => setPermSaved(false), 2500); };

  const roleIcon = (role: string) => {
    if (role === "Admin") return <Shield size={13} style={{ color: "#3b82f6" }} />;
    if (role === "Operator") return <UserCog size={13} style={{ color: "#eab308" }} />;
    return <Users size={13} style={{ color: "#64748b" }} />;
  };

  const filtered = accounts.filter((a) => a.username.toLowerCase().includes(search.toLowerCase()) || a.email.toLowerCase().includes(search.toLowerCase()));

  const roleColors: Record<RoleKey, string> = { Admin: "#3b82f6", Operator: "#eab308", Viewer: "#64748b" };
  const permLabels: Record<keyof ModulePerms, string> = { lihat: "Lihat", tambah: "Tambah", edit: "Edit", hapus: "Hapus" };

  return (
    <>
      {/* Accounts table */}
      <div className="flex items-center justify-between mb-4">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#64748b" }} />
          <input type="text" placeholder="Cari username / email..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-4 py-2 rounded-lg outline-none" style={{ background: "#1e2a3a", border: "1px solid rgba(59,130,246,0.2)", color: "#e8ecf4", fontSize: "0.82rem", width: 220 }} />
        </div>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
          style={{ background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", fontSize: "0.82rem", fontWeight: 500, boxShadow: "0 4px 12px rgba(59,130,246,0.3)" }}>
          <Plus size={14} /> Tambah Akun
        </button>
      </div>

      <div className="rounded-xl overflow-hidden mb-8" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full">
          <thead><tr style={{ background: "#0f1924" }}>{["USERNAME","EMAIL","ROLE","STATUS","LOGIN TERAKHIR","AKSI"].map((h) => (
            <th key={h} className="text-left px-4 py-3" style={{ ...mono, color: "#374151", fontSize: "0.65rem", letterSpacing: "0.08em" }}>{h}</th>
          ))}</tr></thead>
          <tbody>{filtered.map((acc, i) => (
            <tr key={acc.id} className="transition-colors hover:bg-white/[0.02]" style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.03)" }}>
              <td className="px-4 py-3"><div className="flex items-center gap-2">{roleIcon(acc.role)}<span style={{ ...mono, fontSize: "0.82rem", color: "#e8ecf4" }}>{acc.username}</span></div></td>
              <td className="px-4 py-3"><span style={{ color: "#64748b", fontSize: "0.82rem" }}>{acc.email}</span></td>
              <td className="px-4 py-3">{statusBadge(acc.role)}</td>
              <td className="px-4 py-3">{statusBadge(acc.status)}</td>
              <td className="px-4 py-3"><span style={{ ...mono, fontSize: "0.72rem", color: "#64748b" }}>{acc.lastLogin}</span></td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(acc)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10" style={{ color: "#3b82f6" }}><Pencil size={13} /></button>
                  <button onClick={() => setDeleteId(acc.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10" style={{ color: "#ef4444" }}><Trash2 size={13} /></button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* ── Role & Permission Matrix ─────────────────────────────────────── */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock size={16} style={{ color: "#3b82f6" }} />
          <p style={{ color: "#e8ecf4", fontWeight: 600, fontSize: "0.95rem" }}>Role & Permission</p>
          <span className="px-2 py-0.5 rounded" style={{ ...mono, fontSize: "0.62rem", background: "rgba(59,130,246,0.1)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.2)" }}>
            Setiap role memiliki akses berbeda
          </span>
        </div>
        <button onClick={savePerms} className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all"
          style={{ background: permSaved ? "rgba(34,197,94,0.15)" : "rgba(59,130,246,0.12)", color: permSaved ? "#22c55e" : "#3b82f6", fontSize: "0.82rem", border: `1px solid ${permSaved ? "rgba(34,197,94,0.3)" : "rgba(59,130,246,0.25)"}` }}>
          {permSaved ? <><CheckCircle size={13} /> Tersimpan!</> : <><Save size={13} /> Simpan Permission</>}
        </button>
      </div>

      {/* Role cards summary */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {(["Admin","Operator","Viewer"] as RoleKey[]).map((role) => {
          const totalTrue = MODULES.reduce((sum, mod) => sum + PERMS.filter((p) => perms[role][mod][p]).length, 0);
          const total = MODULES.length * PERMS.length;
          return (
            <div key={role} className="rounded-xl p-3" style={{ background: "#0f1924", border: `1px solid ${roleColors[role]}30` }}>
              <div className="flex items-center gap-2 mb-2">
                {roleIcon(role)}
                <span style={{ color: roleColors[role], fontWeight: 600, fontSize: "0.88rem" }}>{role}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${(totalTrue / total) * 100}%`, background: roleColors[role] }} />
                </div>
                <span style={{ ...mono, fontSize: "0.65rem", color: "#64748b" }}>{totalTrue}/{total}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Matrix grid */}
      <div className="rounded-xl overflow-auto" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full" style={{ minWidth: 700 }}>
          <thead>
            <tr style={{ background: "#0a0f1a" }}>
              <th className="text-left px-4 py-3 sticky left-0" style={{ background: "#0a0f1a", ...mono, color: "#374151", fontSize: "0.65rem", letterSpacing: "0.08em", minWidth: 130 }}>MODUL</th>
              {(["Admin","Operator","Viewer"] as RoleKey[]).map((role) => (
                <th key={role} colSpan={4} className="px-4 py-3 text-center" style={{ ...mono, color: roleColors[role], fontSize: "0.65rem", letterSpacing: "0.08em", borderLeft: "1px solid rgba(255,255,255,0.04)" }}>
                  {role.toUpperCase()}
                </th>
              ))}
            </tr>
            <tr style={{ background: "#0c1220" }}>
              <th className="sticky left-0" style={{ background: "#0c1220" }} />
              {(["Admin","Operator","Viewer"] as RoleKey[]).map((role) =>
                PERMS.map((perm) => (
                  <th key={`${role}-${perm}`} className="px-2 py-2 text-center" style={{ ...mono, color: "#374151", fontSize: "0.58rem", letterSpacing: "0.06em", borderLeft: perm === "lihat" ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                    {permLabels[perm].toUpperCase()}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {MODULES.map((mod, mi) => (
              <tr key={mod} className="transition-colors hover:bg-white/[0.015]" style={{ borderTop: mi === 0 ? "none" : "1px solid rgba(255,255,255,0.03)" }}>
                <td className="px-4 py-3 sticky left-0" style={{ background: "#111827", ...mono, fontSize: "0.75rem", color: "#94a3b8" }}>{mod}</td>
                {(["Admin","Operator","Viewer"] as RoleKey[]).map((role) =>
                  PERMS.map((perm) => {
                    const val = perms[role][mod][perm];
                    const locked = role === "Admin";
                    return (
                      <td key={`${role}-${perm}`} className="py-3 text-center" style={{ borderLeft: perm === "lihat" ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                        <button
                          onClick={() => !locked && togglePerm(role, mod, perm)}
                          title={locked ? "Admin selalu memiliki akses penuh" : undefined}
                          className="w-6 h-6 rounded flex items-center justify-center mx-auto transition-all"
                          style={{
                            background: val ? (locked ? "rgba(59,130,246,0.2)" : `${roleColors[role]}20`) : "rgba(255,255,255,0.03)",
                            border: `1px solid ${val ? (locked ? "rgba(59,130,246,0.4)" : `${roleColors[role]}50`) : "rgba(255,255,255,0.06)"}`,
                            cursor: locked ? "not-allowed" : "pointer",
                            opacity: locked ? 0.8 : 1,
                          }}
                        >
                          {val
                            ? <CheckCircle size={12} style={{ color: locked ? "#3b82f6" : roleColors[role] }} />
                            : <XCircle size={12} style={{ color: "#374151" }} />
                          }
                        </button>
                      </td>
                    );
                  })
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3" style={{ ...mono, fontSize: "0.65rem", color: "#374151" }}>
        * Klik kotak untuk toggle permission. Role Admin selalu memiliki akses penuh dan tidak dapat diubah.
      </p>

      {(modal === "add" || modal === "edit") && (
        <Modal title={modal === "add" ? "Tambah Akun" : "Edit Akun"} onClose={() => setModal(null)}>
          <div className="grid grid-cols-2 gap-4">
            <FieldInput label="Username" value={form.username} onChange={f("username")} />
            <FieldInput label="Email" value={form.email} onChange={f("email")} type="email" />
            <FieldInput label="Password" value={password} onChange={setPassword} type="password" />
            <SelectInput label="Role" value={form.role} onChange={f("role")} options={["Admin", "Operator", "Viewer"]} />
            <div className="col-span-2"><SelectInput label="Status" value={form.status} onChange={f("status")} options={["Aktif", "Nonaktif"]} /></div>
          </div>
          <div className="flex justify-end gap-3 mt-5">
            <button onClick={() => setModal(null)} className="px-4 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontSize: "0.85rem", border: "1px solid rgba(255,255,255,0.08)" }}>Batal</button>
            <button onClick={save} className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", fontSize: "0.85rem", fontWeight: 500 }}><Save size={14} /> Simpan</button>
          </div>
        </Modal>
      )}
      {deleteId && <ConfirmModal message="Yakin ingin menghapus akun ini?" onConfirm={() => { setAccounts((p) => p.filter((a) => a.id !== deleteId)); setDeleteId(null); }} onCancel={() => setDeleteId(null)} />}
    </>
  );
}

// ─── Tab: Pengaturan ──────────────────────────────────────────────────────────

function SettingsTab() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleteMonth, setDeleteMonth] = useState("");
  const [deleteYear, setDeleteYear] = useState(String(new Date().getFullYear()));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  const fetchSettings = async () => {
    if (!hasSupabase()) return;
    const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single();

    if (error) {
      // PGRST116 means table is empty, which is fine for first run
      if (error.code !== 'PGRST116') {
        console.error("Fetch settings error:", error);
      }
    } else if (data) {
      setSettings({
        companyName: data.company_name || "",
        latitude: data.latitude || "",
        longitude: data.longitude || "",
        radiusAbsen: data.radius_absen || "",
        jamMulaiCheckin: data.jamMulaiCheckin || "",
        batasAkhirCheckin: data.batasAkhirCheckin || "",
        maxAkurasiGPS: data.maxAkurasiGPS || ""
      });
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      if (hasSupabase()) {
        const { error } = await supabase.from('settings').upsert({
          id: 1,
          company_name: settings.companyName,
          latitude: settings.latitude,
          longitude: settings.longitude,
          radius_absen: settings.radiusAbsen,
          jam_mulai_checkin: settings.jamMulaiCheckin,
          batas_akhir_checkin: settings.batasAkhirCheckin,
          max_akurasi_gps: settings.maxAkurasiGPS
        });
        if (error) throw error;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("Save settings error:", err);
      alert("Gagal menyimpan pengaturan.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAttendance = async () => {
    if (!deleteMonth || !hasSupabase()) return;
    setLoading(true);
    try {
      // Create date range for the month
      const monthIdx = MONTHS_ID.indexOf(deleteMonth) + 1;
      const startDate = `${deleteYear}-${String(monthIdx).padStart(2, '0')}-01`;
      const endDate = new Date(Number(deleteYear), monthIdx, 0).toISOString().slice(0, 10);

      const { error } = await supabase
        .from('attendance')
        .delete()
        .gte('date', startDate)
        .lte('date', endDate);

      if (error) throw error;

      setDeleteSuccess(true);
      setTimeout(() => setDeleteSuccess(false), 3000);
      setConfirmDelete(false);
    } catch (err) {
      console.error("Delete attendance error:", err);
      alert("Gagal menghapus data absensi.");
    } finally {
      setLoading(false);
    }
  };

  const s = (k: keyof AppSettings) => (v: string) => setSettings((p) => ({ ...p, [k]: v }));
  const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));
  
  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center gap-2 mb-4"><Building2 size={15} style={{ color: "#3b82f6" }} /><p style={{ color: "#e8ecf4", fontWeight: 600, fontSize: "0.9rem" }}>Identitas Perusahaan</p></div>
        <FieldInput label="Nama Perusahaan" value={settings.companyName} onChange={s("companyName")} hint="Akan ditampilkan di header dan laporan." />
      </section>
      <div style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />
      <section>
        <div className="flex items-center gap-2 mb-4"><MapPin size={15} style={{ color: "#3b82f6" }} /><p style={{ color: "#e8ecf4", fontWeight: 600, fontSize: "0.9rem" }}>Lokasi & Radius Absen</p></div>
        <div className="grid grid-cols-2 gap-4">
          <FieldInput label="Latitude Kantor" value={settings.latitude} onChange={s("latitude")} hint="Contoh: -6.200000" />
          <FieldInput label="Longitude Kantor" value={settings.longitude} onChange={s("longitude")} hint="Contoh: 106.816666" />
          <FieldInput label="Radius Absen (meter)" value={settings.radiusAbsen} onChange={s("radiusAbsen")} type="number" hint="Jarak maksimal dari kantor." />
          <FieldInput label="Maksimal Akurasi GPS (meter)" value={settings.maxAkurasiGPS} onChange={s("maxAkurasiGPS")} type="number" hint="Tolak jika akurasi GPS melebihi nilai ini." />
        </div>
        <div className="mt-4 rounded-xl overflow-hidden" style={{ height: 130, background: "#0f1924", border: "1px solid rgba(59,130,246,0.2)", position: "relative" }}>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "linear-gradient(rgba(59,130,246,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,0.5) 1px,transparent 1px)", backgroundSize: "24px 24px" }} />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ background: "#3b82f6", boxShadow: "0 0 0 8px rgba(59,130,246,0.2)" }} />
            <div className="px-3 py-1 rounded-full" style={{ background: "rgba(17,24,39,0.9)", border: "1px solid rgba(59,130,246,0.3)" }}>
              <span style={{ ...mono, fontSize: "0.65rem", color: "#3b82f6" }}>{settings.latitude}, {settings.longitude} — radius {settings.radiusAbsen}m</span>
            </div>
          </div>
        </div>
      </section>
      <div style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />
      <section>
        <div className="flex items-center gap-2 mb-4"><Clock size={15} style={{ color: "#3b82f6" }} /><p style={{ color: "#e8ecf4", fontWeight: 600, fontSize: "0.9rem" }}>Pengaturan Waktu Check-In</p></div>
        <div className="grid grid-cols-2 gap-4">
          <FieldInput label="Jam Mulai Check-In" value={settings.jamMulaiCheckin} onChange={s("jamMulaiCheckin")} type="time" hint="Waktu awal absen dibuka." />
          <FieldInput label="Batas Akhir Check-In" value={settings.batasAkhirCheckin} onChange={s("batasAkhirCheckin")} type="time" hint="Setelah jam ini dianggap terlambat." />
        </div>
      </section>
      <div style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />
      <section>
        <div className="flex items-center gap-2 mb-1"><Trash2 size={15} style={{ color: "#ef4444" }} /><p style={{ color: "#e8ecf4", fontWeight: 600, fontSize: "0.9rem" }}>Hapus Data Absensi per Bulan</p></div>
        <p style={{ color: "#64748b", fontSize: "0.8rem", marginBottom: 16 }}>Hapus seluruh data absensi dalam bulan tertentu secara permanen.</p>
        <div className="p-4 rounded-xl" style={{ background: "#0f1924", border: "1px solid rgba(239,68,68,0.15)" }}>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="col-span-2">
              <label style={{ ...mono, color: "#64748b", fontSize: "0.68rem", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>BULAN</label>
              <div className="relative">
                <select value={deleteMonth} onChange={(e) => setDeleteMonth(e.target.value)} className="w-full rounded-lg px-3 py-2 outline-none appearance-none"
                  style={{ background: "#1e2a3a", border: "1px solid rgba(239,68,68,0.2)", color: deleteMonth ? "#e8ecf4" : "#64748b", fontSize: "0.88rem" }}>
                  <option value="">Pilih bulan...</option>
                  {MONTHS_ID.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#64748b" }} />
              </div>
            </div>
            <div>
              <label style={{ ...mono, color: "#64748b", fontSize: "0.68rem", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>TAHUN</label>
              <div className="relative">
                <select value={deleteYear} onChange={(e) => setDeleteYear(e.target.value)} className="w-full rounded-lg px-3 py-2 outline-none appearance-none"
                  style={{ background: "#1e2a3a", border: "1px solid rgba(239,68,68,0.2)", color: "#e8ecf4", fontSize: "0.88rem" }}>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#64748b" }} />
              </div>
            </div>
          </div>
          {deleteSuccess && (
            <div className="mb-3 px-3 py-2 rounded-lg flex items-center gap-2" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}>
              <CheckCircle size={14} style={{ color: "#22c55e" }} /><span style={{ ...mono, fontSize: "0.75rem", color: "#22c55e" }}>Data {deleteMonth} {deleteYear} berhasil dihapus.</span>
            </div>
          )}
          <button onClick={() => deleteMonth && setConfirmDelete(true)} disabled={!deleteMonth || loading} className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
            style={{ background: deleteMonth ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${deleteMonth ? "rgba(239,68,68,0.35)" : "rgba(255,255,255,0.06)"}`, color: deleteMonth ? "#ef4444" : "#374151", fontSize: "0.82rem", cursor: deleteMonth ? "pointer" : "not-allowed" }}>
            <Trash2 size={14} /> {loading ? "Memproses..." : `Hapus Data ${deleteMonth || "..."} ${deleteYear}`}
          </button>
        </div>
      </section>
      <div className="flex justify-end pt-2">
        <button onClick={handleSave} disabled={loading} className="flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all"
          style={{ background: saved ? "linear-gradient(135deg,#15803d,#22c55e)" : "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", fontWeight: 600, fontSize: "0.88rem", boxShadow: "0 4px 16px rgba(59,130,246,0.3)", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Menyimpan..." : saved ? <><CheckCircle size={15} /> Tersimpan!</> : <><Save size={15} /> Simpan Pengaturan</>}
        </button>
      </div>
      {confirmDelete && <ConfirmModal message={`Yakin ingin menghapus SELURUH data absensi bulan ${deleteMonth} ${deleteYear}? Data tidak dapat dipulihkan.`} confirmLabel="Ya, Hapus Semua" onConfirm={handleDeleteAttendance} onCancel={() => setConfirmDelete(false)} />}
    </div>
  );
}

// ─── Tab: Laporan ─────────────────────────────────────────────────────────────

function getWeekRange(dateStr: string) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { start: mon.toISOString().slice(0,10), end: sun.toISOString().slice(0,10) };
}

function LaporanTab() {
  const [period, setPeriod] = useState<"mingguan" | "bulanan">("bulanan");
  const [selectedMonth, setSelectedMonth] = useState("6");
  const [selectedYear, setSelectedYear] = useState("2026");
  const [selectedWeek, setSelectedWeek] = useState("2026-06-09");
  const [exportSuccess, setExportSuccess] = useState<"pdf" | "excel" | null>(null);
  const [search, setSearch] = useState("");

  const years = ["2026","2025","2024"];

  const getFilteredData = (): AttendanceRecord[] => {
    if (period === "bulanan") {
      const m = selectedMonth.padStart(2,"0");
      return seedAttendance.filter((r) => r.date.startsWith(`${selectedYear}-${m}`));
    } else {
      const { start, end } = getWeekRange(selectedWeek);
      return seedAttendance.filter((r) => r.date >= start && r.date <= end);
    }
  };

  const data = getFilteredData().filter((r) => r.name.toLowerCase().includes(search.toLowerCase()) || r.nip.toLowerCase().includes(search.toLowerCase()));
  const hadir = data.filter((r) => r.status === "Hadir").length;
  const terlambat = data.filter((r) => r.status === "Terlambat").length;
  const tidakHadir = data.filter((r) => r.status === "Tidak Hadir").length;
  const izin = data.filter((r) => r.status === "Izin").length;

  const periodLabel = period === "bulanan"
    ? `${MONTHS_ID[parseInt(selectedMonth) - 1]} ${selectedYear}`
    : (() => { const { start, end } = getWeekRange(selectedWeek); return `${start} s/d ${end}`; })();

  const tableRows = data.map((r) => [r.nip, r.name, r.date, r.timeIn, r.status]);

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(13, 22, 40);
    doc.rect(0, 0, pageW, 35, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(COMPANY, 14, 14);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(`Laporan Absensi ${period === "bulanan" ? "Bulanan" : "Mingguan"}`, 14, 22);
    doc.text(`Periode: ${periodLabel}`, 14, 29);

    // Stats row
    doc.setFillColor(17, 24, 39);
    doc.rect(0, 38, pageW, 22, "F");
    const stats = [
      { label: "Hadir", val: hadir, color: [34,197,94] as [number,number,number] },
      { label: "Terlambat", val: terlambat, color: [234,179,8] as [number,number,number] },
      { label: "Tidak Hadir", val: tidakHadir, color: [239,68,68] as [number,number,number] },
      { label: "Izin", val: izin, color: [168,85,247] as [number,number,number] },
    ];
    stats.forEach((st, i) => {
      const x = 14 + i * 46;
      doc.setTextColor(...st.color);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(String(st.val), x, 52);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(st.label, x, 57);
    });

    // Table
    autoTable(doc, {
      startY: 65,
      head: [["NIP", "NAMA PEGAWAI", "TANGGAL", "JAM MASUK", "STATUS"]],
      body: tableRows,
      styles: { font: "helvetica", fontSize: 9, cellPadding: 3, textColor: [30, 41, 59] },
      headStyles: { fillColor: [13, 22, 40], textColor: [148, 163, 184], fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: 22 }, 2: { cellWidth: 24 }, 3: { cellWidth: 22 }, 4: { cellWidth: 26 } },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.column.index === 4) {
          const val = data.cell.raw as string;
          if (val === "Hadir") data.cell.styles.textColor = [21, 128, 61];
          else if (val === "Terlambat") data.cell.styles.textColor = [161, 98, 7];
          else if (val === "Tidak Hadir") data.cell.styles.textColor = [185, 28, 28];
          else if (val === "Izin") data.cell.styles.textColor = [126, 34, 206];
        }
      },
    });

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`Dicetak: ${new Date().toLocaleString("id-ID")} | ${COMPANY}`, 14, doc.internal.pageSize.getHeight() - 8);
      doc.text(`Hal ${i} dari ${pageCount}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
    }

    doc.save(`Laporan_Absensi_${period}_${periodLabel.replace(/\s/g,"_")}.pdf`);
    setExportSuccess("pdf");
    setTimeout(() => setExportSuccess(null), 3000);
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ["LAPORAN ABSENSI"],
      [COMPANY],
      [`Periode: ${periodLabel}`],
      [`Dicetak: ${new Date().toLocaleString("id-ID")}`],
      [],
      ["RINGKASAN"],
      ["Status", "Jumlah", "Persentase"],
      ["Hadir", hadir, `${data.length ? ((hadir/data.length)*100).toFixed(1) : 0}%`],
      ["Terlambat", terlambat, `${data.length ? ((terlambat/data.length)*100).toFixed(1) : 0}%`],
      ["Tidak Hadir", tidakHadir, `${data.length ? ((tidakHadir/data.length)*100).toFixed(1) : 0}%`],
      ["Izin", izin, `${data.length ? ((izin/data.length)*100).toFixed(1) : 0}%`],
      ["Total", data.length, "100%"],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    ws1["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Ringkasan");

    // Detail sheet
    const detailData = [
      ["NIP", "NAMA PEGAWAI", "TANGGAL", "JAM MASUK", "STATUS"],
      ...tableRows,
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(detailData);
    ws2["!cols"] = [{ wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Detail Absensi");

    // Per-employee summary
    const empMap: Record<string, { name: string; nip: string; hadir: number; terlambat: number; tidakHadir: number; izin: number }> = {};
    data.forEach((r) => {
      if (!empMap[r.nip]) empMap[r.nip] = { name: r.name, nip: r.nip, hadir: 0, terlambat: 0, tidakHadir: 0, izin: 0 };
      if (r.status === "Hadir") empMap[r.nip].hadir++;
      else if (r.status === "Terlambat") empMap[r.nip].terlambat++;
      else if (r.status === "Tidak Hadir") empMap[r.nip].tidakHadir++;
      else empMap[r.nip].izin++;
    });
    const rekap = [
      ["NIP", "NAMA", "HADIR", "TERLAMBAT", "TIDAK HADIR", "IZIN", "TOTAL HARI"],
      ...Object.values(empMap).map((e) => [e.nip, e.name, e.hadir, e.terlambat, e.tidakHadir, e.izin, e.hadir + e.terlambat + e.tidakHadir + e.izin]),
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(rekap);
    ws3["!cols"] = [{ wch: 12 }, { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws3, "Rekap per Karyawan");

    XLSX.writeFile(wb, `Laporan_Absensi_${period}_${periodLabel.replace(/\s/g,"_")}.xlsx`);
    setExportSuccess("excel");
    setTimeout(() => setExportSuccess(null), 3000);
  };

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="p-4 rounded-xl" style={{ background: "#0f1924", border: "1px solid rgba(59,130,246,0.12)" }}>
        <p style={{ color: "#94a3b8", fontWeight: 600, fontSize: "0.88rem", marginBottom: 12 }}>Pilih Periode Laporan</p>
        <div className="flex items-center gap-3 mb-4">
          {(["mingguan","bulanan"] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className="px-4 py-2 rounded-lg transition-all capitalize"
              style={{ background: period === p ? "linear-gradient(135deg,#1d4ed8,#3b82f6)" : "rgba(255,255,255,0.04)", color: period === p ? "#fff" : "#64748b", fontWeight: period === p ? 600 : 400, fontSize: "0.85rem", border: `1px solid ${period === p ? "transparent" : "rgba(255,255,255,0.06)"}` }}>
              {p === "mingguan" ? "Mingguan" : "Bulanan"}
            </button>
          ))}
        </div>

        {period === "bulanan" ? (
          <div className="grid grid-cols-2 gap-3" style={{ maxWidth: 320 }}>
            <div>
              <label style={{ ...mono, color: "#64748b", fontSize: "0.68rem", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>BULAN</label>
              <div className="relative">
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="w-full rounded-lg px-3 py-2 outline-none appearance-none"
                  style={{ background: "#1e2a3a", border: "1px solid rgba(59,130,246,0.2)", color: "#e8ecf4", fontSize: "0.85rem" }}>
                  {MONTHS_ID.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#64748b" }} />
              </div>
            </div>
            <div>
              <label style={{ ...mono, color: "#64748b", fontSize: "0.68rem", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>TAHUN</label>
              <div className="relative">
                <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="w-full rounded-lg px-3 py-2 outline-none appearance-none"
                  style={{ background: "#1e2a3a", border: "1px solid rgba(59,130,246,0.2)", color: "#e8ecf4", fontSize: "0.85rem" }}>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#64748b" }} />
              </div>
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 220 }}>
            <label style={{ ...mono, color: "#64748b", fontSize: "0.68rem", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>PILIH MINGGU (dari tanggal)</label>
            <input type="date" value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)}
              className="w-full rounded-lg px-3 py-2 outline-none"
              style={{ background: "#1e2a3a", border: "1px solid rgba(59,130,246,0.2)", color: "#e8ecf4", fontSize: "0.85rem" }} />
            {selectedWeek && (
              <p style={{ ...mono, fontSize: "0.65rem", color: "#3b82f6", marginTop: 4 }}>
                Minggu: {getWeekRange(selectedWeek).start} s/d {getWeekRange(selectedWeek).end}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="relative mb-5">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#64748b" }} />
        <input type="text" placeholder="Cari nama / NIP..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="pl-8 pr-4 py-2 rounded-lg outline-none" style={{ background: "#1e2a3a", border: "1px solid rgba(59,130,246,0.2)", color: "#e8ecf4", fontSize: "0.82rem", width: 220 }} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Hadir", val: hadir, color: "#22c55e", icon: <CheckCircle size={16} /> },
          { label: "Terlambat", val: terlambat, color: "#eab308", icon: <Clock size={16} /> },
          { label: "Tidak Hadir", val: tidakHadir, color: "#ef4444", icon: <XCircle size={16} /> },
          { label: "Izin", val: izin, color: "#a855f7", icon: <FileText size={16} /> },
        ].map((s) => (
          <div key={s.label} className="rounded-xl p-3" style={{ background: "#0f1924", border: "1px solid rgba(255,255,255,0.04)" }}>
            <div className="flex items-center justify-between mb-1">
              <span style={{ ...mono, fontSize: "0.65rem", color: "#64748b" }}>{s.label.toUpperCase()}</span>
              <span style={{ color: s.color }}>{s.icon}</span>
            </div>
            <p style={{ fontSize: "1.6rem", fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</p>
            <p style={{ ...mono, fontSize: "0.6rem", color: "#374151", marginTop: 2 }}>
              {data.length ? `${((s.val / data.length) * 100).toFixed(0)}%` : "0%"} dari total
            </p>
          </div>
        ))}
      </div>

      {/* Export actions */}
      <div className="flex items-center gap-3">
        <p style={{ color: "#64748b", fontSize: "0.82rem" }}>
          <span style={{ color: "#e8ecf4", fontWeight: 600 }}>{data.length}</span> record ditemukan untuk periode{" "}
          <span style={{ color: "#3b82f6" }}>{periodLabel}</span>
        </p>
        <div className="flex-1" />

        {exportSuccess && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}>
            <CheckCircle size={13} style={{ color: "#22c55e" }} />
            <span style={{ ...mono, fontSize: "0.72rem", color: "#22c55e" }}>
              {exportSuccess === "pdf" ? "PDF" : "Excel"} berhasil diunduh!
            </span>
          </div>
        )}

        <button onClick={exportExcel} disabled={data.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
          style={{ background: data.length === 0 ? "rgba(255,255,255,0.03)" : "rgba(34,197,94,0.12)", color: data.length === 0 ? "#374151" : "#22c55e", border: `1px solid ${data.length === 0 ? "rgba(255,255,255,0.06)" : "rgba(34,197,94,0.3)"}`, fontSize: "0.85rem", fontWeight: 500, cursor: data.length === 0 ? "not-allowed" : "pointer" }}>
          <FileSpreadsheet size={15} /> Export Excel
        </button>

        <button onClick={exportPDF} disabled={data.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
          style={{ background: data.length === 0 ? "rgba(255,255,255,0.03)" : "rgba(239,68,68,0.12)", color: data.length === 0 ? "#374151" : "#ef4444", border: `1px solid ${data.length === 0 ? "rgba(255,255,255,0.06)" : "rgba(239,68,68,0.3)"}`, fontSize: "0.85rem", fontWeight: 500, cursor: data.length === 0 ? "not-allowed" : "pointer" }}>
          <FileText size={15} /> Export PDF
        </button>

        <button onClick={() => window.print()} disabled={data.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
          style={{ background: data.length === 0 ? "rgba(255,255,255,0.03)" : "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: data.length === 0 ? "#374151" : "#fff", fontSize: "0.85rem", fontWeight: 500, cursor: data.length === 0 ? "not-allowed" : "pointer", boxShadow: data.length > 0 ? "0 4px 12px rgba(59,130,246,0.3)" : "none" }}>
          <Printer size={15} /> Cetak
        </button>
      </div>

      {/* Preview table */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ background: "#0f1924", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="flex items-center gap-2">
            <FileBarChart2 size={14} style={{ color: "#3b82f6" }} />
            <span style={{ color: "#94a3b8", fontSize: "0.82rem", fontWeight: 600 }}>Preview Laporan — {periodLabel}</span>
          </div>
          <span style={{ ...mono, fontSize: "0.65rem", color: "#374151" }}>{data.length} baris</span>
        </div>
        <div style={{ maxHeight: 380, overflowY: "auto" }}>
          <table className="w-full">
            <thead style={{ position: "sticky", top: 0 }}>
              <tr style={{ background: "#0f1924" }}>
                {["#","NIP","NAMA PEGAWAI","TANGGAL","JAM MASUK","STATUS"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5" style={{ ...mono, color: "#374151", fontSize: "0.62rem", letterSpacing: "0.08em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((rec, i) => (
                <tr key={rec.id} className="transition-colors hover:bg-white/[0.02]" style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.025)" }}>
                  <td className="px-4 py-2.5"><span style={{ ...mono, fontSize: "0.68rem", color: "#374151" }}>{i + 1}</span></td>
                  <td className="px-4 py-2.5"><span style={{ ...mono, fontSize: "0.72rem", color: "#3b82f6" }}>{rec.nip}</span></td>
                  <td className="px-4 py-2.5"><span style={{ color: "#e8ecf4", fontSize: "0.82rem" }}>{rec.name}</span></td>
                  <td className="px-4 py-2.5"><span style={{ ...mono, fontSize: "0.72rem", color: "#64748b" }}>{rec.date}</span></td>
                  <td className="px-4 py-2.5"><span style={{ ...mono, fontSize: "0.75rem", color: "#94a3b8" }}>{rec.timeIn}</span></td>
                  <td className="px-4 py-2.5">{statusBadge(rec.status)}</td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={6} className="py-12 text-center" style={{ ...mono, color: "#374151", fontSize: "0.78rem" }}>Tidak ada data untuk periode ini.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

type Tab = "karyawan" | "akun" | "pengaturan" | "laporan";

interface AdminDashboardProps { adminName: string; onLogout: () => void; }

export function AdminDashboard({ adminName, onLogout }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>("karyawan");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "karyawan",   label: "Karyawan",     icon: <Users size={15} /> },
    { id: "laporan",    label: "Laporan",       icon: <FileBarChart2 size={15} /> },
    { id: "akun",       label: "Akun & Role",  icon: <Shield size={15} /> },
    { id: "pengaturan", label: "Pengaturan",   icon: <Settings size={15} /> },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#0a0e1a", fontFamily: "'Inter', sans-serif" }}>
      <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(59,130,246,0.12)", background: "rgba(17,24,39,0.95)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{ background: "#3b82f6", boxShadow: "0 0 8px #3b82f6" }} />
          <span style={{ color: "#e8ecf4", fontWeight: 600 }}>Dashboard Admin</span>
          <span className="px-2 py-0.5 rounded" style={{ ...mono, fontSize: "0.65rem", background: "rgba(59,130,246,0.12)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.25)" }}>ADMINISTRATOR</span>
        </div>
        <div className="flex items-center gap-4">
          <span style={{ ...mono, color: "#64748b", fontSize: "0.78rem" }}>{adminName}</span>
          <button onClick={onLogout} className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: "#94a3b8", fontSize: "0.82rem", border: "1px solid rgba(255,255,255,0.08)" }}>
            <LogOut size={13} /> Keluar
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center gap-1 mb-6 p-1 rounded-xl" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.05)", width: "fit-content" }}>
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
              style={{ background: activeTab === tab.id ? "linear-gradient(135deg,#1d4ed8,#3b82f6)" : "transparent", color: activeTab === tab.id ? "#fff" : "#64748b", fontSize: "0.85rem", fontWeight: activeTab === tab.id ? 600 : 400, boxShadow: activeTab === tab.id ? "0 2px 10px rgba(59,130,246,0.3)" : "none" }}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        <div className="rounded-xl p-6" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.05)" }}>
          {activeTab === "karyawan"   && <EmployeeTab />}
          {activeTab === "laporan"    && <LaporanTab />}
          {activeTab === "akun"       && <AccountTab />}
          {activeTab === "pengaturan" && <SettingsTab />}
        </div>
      </main>
    </div>
  );
}
