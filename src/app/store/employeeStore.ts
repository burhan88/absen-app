import { supabase } from "../../lib/supabase";

export interface Employee {
  id: string;
  name: string;
  nip: string;
  jabatan: string;
  departemen: string;
  email: string;
  phone: string;
  status: "Aktif" | "Nonaktif";
  photo: string | null; // base64 data URL
}

export const avatarGradients = [
  "linear-gradient(135deg,#1d4ed8,#3b82f6)",
  "linear-gradient(135deg,#7c3aed,#a855f7)",
  "linear-gradient(135deg,#059669,#22c55e)",
  "linear-gradient(135deg,#d97706,#f59e0b)",
  "linear-gradient(135deg,#dc2626,#ef4444)",
  "linear-gradient(135deg,#0891b2,#06b6d4)",
];

export const initialEmployees: Employee[] = [
  { id: "e1", name: "Budi Santoso",  nip: "PEG-001", jabatan: "Staf Administrasi", departemen: "Divisi Operasional", email: "budi@company.id",  phone: "0812-0001-0001", status: "Aktif",    photo: null },
  { id: "e2", name: "Siti Rahayu",   nip: "PEG-002", jabatan: "Manajer Keuangan",  departemen: "Divisi Keuangan",    email: "siti@company.id",  phone: "0812-0002-0002", status: "Aktif",    photo: null },
  { id: "e3", name: "Ahmad Fauzi",   nip: "PEG-003", jabatan: "Staf IT",            departemen: "Divisi Teknologi",   email: "ahmad@company.id", phone: "0812-0003-0003", status: "Aktif",    photo: null },
  { id: "e4", name: "Dewi Lestari",  nip: "PEG-004", jabatan: "HRD Officer",        departemen: "Divisi SDM",         email: "dewi@company.id",  phone: "0812-0004-0004", status: "Aktif",    photo: null },
  { id: "e5", name: "Rizky Pratama", nip: "PEG-005", jabatan: "Staf Marketing",     departemen: "Divisi Pemasaran",   email: "rizky@company.id", phone: "0812-0005-0005", status: "Nonaktif", photo: null },
];

let _employees: Employee[] = [...initialEmployees];
const _listeners: Array<() => void> = [];

// Helper to check if Supabase is configured
const hasSupabase = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function fetchEmployees() {
  if (!hasSupabase()) return _employees;
  
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching employees:', error);
    return _employees;
  }

  if (data) {
    _employees = data as Employee[];
    _notify();
  }
  return _employees;
}

export function getEmployees(): Employee[] { return _employees; }

export function setEmployees(list: Employee[]) {
  _employees = list;
  _notify();
}

function _notify() {
  _listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void) {
  _listeners.push(fn);
  return () => { const i = _listeners.indexOf(fn); if (i >= 0) _listeners.splice(i, 1); };
}

// Initial fetch
fetchEmployees();
