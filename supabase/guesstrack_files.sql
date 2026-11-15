-- Таблица для постоянного хранения данных сервера GuessTrack (правки админа, обложки, порядок артистов).
-- RLS включён без политик: доступ только у серверного ключа service_role.
create table if not exists public.guesstrack_files (
  path text primary key,
  content_base64 text not null,
  updated_at timestamptz not null default now()
);
alter table public.guesstrack_files enable row level security;
