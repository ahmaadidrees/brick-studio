-- Usernames become global: one student account per username across every class, so a
-- student can sign in with username and password alone. Production had 171 students and
-- no username shared between classes when this was written, so no rename is needed.
-- The per-class unique(class_id, username_key) constraint stays; it is implied and harmless.
create unique index brick_students_username_key_idx on public.brick_students(username_key);

-- Teachers may hide the tap-your-name roster on the public join screen for a class.
alter table public.brick_classes add column show_names_on_join boolean not null default true;
-- The plpgsql permission RPCs read brick_classes into a row variable with `select *`,
-- so they pick up the new column without changes.
