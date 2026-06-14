// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
//TAMBAHKAN INI UNTUK CEK DI CONSOLE BROWSER (F12)
console.log("Supabase URL:", supabaseUrl);
console.log("Supabase Key exists:", !!supabaseAnonKey);

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");
