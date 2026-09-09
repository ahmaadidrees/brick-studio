-- Additive Brick Studio namespace. No existing ClassChat tables or auth users changed.
create table public.brick_classes (
 id uuid primary key default gen_random_uuid(), teacher_id uuid not null references auth.users(id),
 name text not null check(length(name) between 1 and 80), login_code text not null unique,
 enrollment_open boolean not null default true, collaboration_open boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.brick_class_codes (
 code text primary key, class_id uuid not null references public.brick_classes(id) on delete cascade,
 can_enroll boolean not null default true
);
create unique index brick_class_one_enrollment_code on public.brick_class_codes(class_id) where can_enroll;
create table public.brick_students (
 user_id uuid primary key references auth.users(id) on delete cascade,
 class_id uuid not null references public.brick_classes(id), username text not null,
 username_key text not null, roster_name text not null,
 suspended boolean not null default false, reset_required boolean not null default false,
 auth_version integer not null default 1,
 unique(class_id,username_key), check(length(username) between 3 and 24), check(length(roster_name) between 1 and 80)
);
create table public.brick_worlds (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 class_id uuid references public.brick_classes(id), kind text not null check(kind in ('personal','group','class')),
 title text not null check(length(title) between 1 and 80), document jsonb not null,
 revision integer not null default 1 check(revision > 0), updated_at timestamptz not null default now(),
 check((kind='personal' and class_id is null) or (kind<>'personal' and class_id is not null))
);
create table public.brick_sessions (
 session_id uuid primary key, user_id uuid not null references public.brick_students(user_id) on delete cascade,
 auth_version integer not null, created_at timestamptz not null default now()
);
create table public.brick_world_members (
 world_id uuid not null references public.brick_worlds(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, primary key(world_id,user_id)
);
create table public.brick_checkpoints (
 id uuid primary key default gen_random_uuid(), world_id uuid not null references public.brick_worlds(id) on delete cascade,
 revision integer not null, document jsonb not null, title text not null,
 reason text not null, created_at timestamptz not null default now()
);
create index brick_worlds_owner_idx on public.brick_worlds(owner_id);
create index brick_worlds_class_idx on public.brick_worlds(class_id);
create index brick_students_class_idx on public.brick_students(class_id);
create index brick_checkpoints_world_idx on public.brick_checkpoints(world_id, created_at desc);
create table public.brick_rate_limits (key text primary key, hits integer not null, expires_at timestamptz not null);
create table public.brick_audit_events (
 id bigint generated always as identity primary key, actor_id uuid not null,
 class_id uuid, target_id uuid, action text not null, created_at timestamptz not null default now()
);
-- All product data is accessed only by the scoped Worker service. No browser table access.
alter table public.brick_classes enable row level security;
alter table public.brick_sessions enable row level security;
alter table public.brick_class_codes enable row level security;
alter table public.brick_students enable row level security;
alter table public.brick_worlds enable row level security;
alter table public.brick_world_members enable row level security;
alter table public.brick_checkpoints enable row level security;
alter table public.brick_rate_limits enable row level security;
alter table public.brick_audit_events enable row level security;
revoke all on public.brick_classes, public.brick_class_codes, public.brick_students, public.brick_worlds,
 public.brick_world_members, public.brick_checkpoints, public.brick_rate_limits, public.brick_audit_events from anon, authenticated;
revoke all on public.brick_sessions from anon, authenticated;
grant all on public.brick_sessions to service_role;
grant all on public.brick_classes, public.brick_class_codes, public.brick_students, public.brick_worlds,
 public.brick_world_members, public.brick_checkpoints, public.brick_rate_limits, public.brick_audit_events to service_role;
grant usage, select on sequence public.brick_audit_events_id_seq to service_role;

create function public.brick_take_rate_limit(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 insert into brick_rate_limits(key,hits,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set
 hits=case when brick_rate_limits.expires_at<=now() then 1 else brick_rate_limits.hits+1 end,
 expires_at=case when brick_rate_limits.expires_at<=now() then now()+make_interval(secs=>p_seconds) else brick_rate_limits.expires_at end
 returning hits into n;
 -- Bounded cleanup keeps temporary abuse accounting from becoming permanent storage.
 delete from brick_rate_limits where key in (select key from brick_rate_limits where expires_at<now()-interval '1 day' limit 100);
 return n<=p_limit;
end $$;

create function public.brick_save_world(p_world_id uuid,p_expected_revision integer,p_document jsonb,p_title text,p_reason text default 'save')
returns jsonb language plpgsql security definer set search_path=public as $$
declare w brick_worlds; newest timestamptz;
begin
 select * into w from brick_worlds where id=p_world_id for update;
 if not found then return jsonb_build_object('error','not_found'); end if;
 if w.revision<>p_expected_revision then return jsonb_build_object('error','conflict','currentRevision',w.revision); end if;
 select max(created_at) into newest from brick_checkpoints where world_id=p_world_id;
 -- Snapshot the previous version at most once per minute, always before a restore.
 if newest is null or newest<now()-interval '1 minute' or p_reason='restore' then
  insert into brick_checkpoints(world_id,revision,document,title,reason) values(w.id,w.revision,w.document,w.title,p_reason);
 end if;
 update brick_worlds set document=p_document,title=coalesce(p_title,title),revision=revision+1,updated_at=now() where id=p_world_id returning * into w;
 delete from brick_checkpoints where world_id=p_world_id and id not in
  (select id from brick_checkpoints where world_id=p_world_id order by created_at desc limit 30);
 return to_jsonb(w);
end $$;
revoke all on function public.brick_take_rate_limit(text,integer,integer), public.brick_save_world(uuid,integer,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.brick_take_rate_limit(text,integer,integer), public.brick_save_world(uuid,integer,jsonb,text,text) to service_role;
