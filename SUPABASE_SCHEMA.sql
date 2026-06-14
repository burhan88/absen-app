-- Use these queries in your Supabase SQL Editor to set up the database

-- 1. Employees Table
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  nip TEXT UNIQUE NOT NULL,
  jabatan TEXT,
  departemen TEXT,
  email TEXT,
  phone TEXT,
  status TEXT DEFAULT 'Aktif',
  photo TEXT, -- base64 data URL or storage URL
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Attendance Table
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  nip TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  time_in TIME NOT NULL DEFAULT CURRENT_TIME,
  status TEXT NOT NULL, -- 'Hadir', 'Terlambat', 'Tidak Hadir', 'Izin'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Settings Table (Single row)
CREATE TABLE settings (
  id INT PRIMARY KEY DEFAULT 1,
  company_name TEXT DEFAULT 'PT. Maju Bersama',
  latitude TEXT,
  longitude TEXT,
  radius_absen TEXT DEFAULT '100',
  jam_mulai_checkin TIME DEFAULT '07:00',
  batas_akhir_checkin TIME DEFAULT '08:30',
  max_akurasi_gps TEXT DEFAULT '50',
  CONSTRAINT one_row CHECK (id = 1)
);

-- 4. Accounts Table (Admin/Operator access)
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL, -- In a real app, use Supabase Auth instead
  role TEXT DEFAULT 'Operator', -- 'Admin', 'Operator', 'Viewer'
  status TEXT DEFAULT 'Aktif',
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed initial data (optional)
INSERT INTO settings (id, company_name) VALUES (1, 'PT. Maju Bersama') ON CONFLICT DO NOTHING;

INSERT INTO accounts (username, email, password, role) 
VALUES ('admin', 'admin@company.id', 'admin123', 'Admin') 
ON CONFLICT DO NOTHING;
