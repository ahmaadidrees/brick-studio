-- The class shelf (2026-10-28, docs/qa/code-lab-layers): Code Lab power bricks a class shares with each other.
-- A student's item waits for the teacher while shelf_needs_review (the default); the teacher's own go straight on.
-- race_heroes is the teacher's rule for which Heroes a class race allows. Safe to re-run.
create table if not exists public.brick_shelf_items (
 id uuid primary key default gen_random_uuid(),
 class_id uuid not null references public.brick_classes(id) on delete cascade,
 author_id uuid not null,
 -- What classmates see: first name and last initial, or "Teacher". Never a username or the full roster name.
 author_name text not null check (char_length(author_name) between 1 and 40),
 kind text not null default 'power' check (kind in ('power')),
 name text not null check (char_length(name) between 1 and 40),
 what text not null default '' check (char_length(what) <= 200),
 payload jsonb not null,
 status text not null default 'pending' check (status in ('pending','approved','hidden')),
 uses integer not null default 0 check (uses >= 0),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid
);
alter table public.brick_shelf_items drop constraint if exists brick_shelf_items_payload_size;
alter table public.brick_shelf_items add constraint brick_shelf_items_payload_size check (octet_length(payload::text) <= 65536);
create index if not exists brick_shelf_items_class_idx on public.brick_shelf_items(class_id, status, created_at desc);
create index if not exists brick_shelf_items_author_idx on public.brick_shelf_items(author_id);

-- At most 100 items per class, so a shelf stays a shelf (hidden items count until the teacher deletes them).
create or replace function public.brick_enforce_shelf_quota()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('brick-shelf:'||new.class_id::text,0));
 if (select count(*) from brick_shelf_items where class_id=new.class_id) >= 100 then
  raise exception using errcode='P0001', message='brick_shelf_quota';
 end if;
 return new;
end $$;
drop trigger if exists brick_shelf_items_quota on public.brick_shelf_items;
create trigger brick_shelf_items_quota before insert on public.brick_shelf_items for each row execute function public.brick_enforce_shelf_quota();

alter table public.brick_classes add column if not exists shelf_needs_review boolean not null default true;
alter table public.brick_classes add column if not exists race_heroes text not null default 'shelf';
alter table public.brick_classes drop constraint if exists brick_classes_race_heroes_check;
alter table public.brick_classes add constraint brick_classes_race_heroes_check check (race_heroes in ('builtin','shelf','any'));

-- Like every product table: only the scoped Worker service reads or writes it.
alter table public.brick_shelf_items enable row level security;
revoke all on public.brick_shelf_items from anon, authenticated;
grant all on public.brick_shelf_items to service_role;
