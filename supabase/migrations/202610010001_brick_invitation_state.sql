-- Durable recipient state lives alongside membership, whose existence remains the access grant.
-- No authorization functions or browser privileges change. Group rows also receive defaults,
-- but the invitation API only exposes personal worlds with class_visibility = 'members'.
begin;

alter table public.brick_world_members
  add column invite_id uuid not null default gen_random_uuid(),
  add column invited_at timestamptz not null default now(),
  add column seen_at timestamptz,
  add column joined_at timestamptz;

-- Historical per-recipient arrival times are unavailable. Use the world's existing sharing
-- time when available; otherwise the migration time. Existing memberships and access stay intact.
update public.brick_world_members m
set invited_at = coalesce(w.class_shared_at, m.invited_at)
from public.brick_worlds w
where w.id = m.world_id and w.kind = 'personal' and w.class_visibility = 'members';

create unique index brick_world_members_invite_id_idx on public.brick_world_members(invite_id);
create index brick_world_members_recipient_invites_idx on public.brick_world_members(user_id, invited_at desc, invite_id);

comment on column public.brick_world_members.invite_id is 'Changes only on explicit owner resend or new membership; never an authorization token.';
comment on column public.brick_world_members.seen_at is 'Server-side acknowledgement by this membership recipient.';
comment on column public.brick_world_members.joined_at is 'Recipient tapped the join action; not a presence or successful room-entry proof.';

commit;
