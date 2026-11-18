-- Migration: Create rkas_verifikasi table for SMKN 4 Surakarta
create table if not exists public.rkas_verifikasi (
  no integer primary key,
  level integer not null default 4,
  kode_program text,
  kode_rekening text,
  uraian text,
  volume text,
  satuan text,
  tarif_harga numeric,
  jumlah numeric,
  tahap_1 numeric,
  tahap_2 numeric,
  status text default '',
  keterangan text default '',
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable Row Level Security (RLS)
alter table public.rkas_verifikasi enable row level security;

-- Allow public access for verification web app
drop policy if exists "Allow public all" on public.rkas_verifikasi;
create policy "Allow public all" on public.rkas_verifikasi
  for all
  using (true)
  with check (true);

-- Enable Realtime for live multi-user sync
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.rkas_verifikasi;
  end if;
exception when others then
  null;
end $$;
