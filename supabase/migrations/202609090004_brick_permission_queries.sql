-- One database round trip for current live permissions; never returns world JSON.
create function public.brick_authorize_world(p_world_id uuid,p_user_id uuid,p_session_id uuid,p_auth_version integer,p_teacher_allowed boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare w record; s brick_students; c brick_classes; teacher boolean:=false; display_name text;
begin
 if p_teacher_allowed and p_auth_version=0 then
  perform 1 from brick_teacher_sessions where session_id=p_session_id and user_id=p_user_id and not revoked;
  if not found then return jsonb_build_object('error','session_revoked'); end if;
  teacher:=true; display_name:='Teacher';
 else
  select * into s from brick_students where user_id=p_user_id;
  if not found or s.auth_version<>p_auth_version then return jsonb_build_object('error','session_revoked'); end if;
  perform 1 from brick_sessions where session_id=p_session_id and user_id=p_user_id and auth_version=s.auth_version;
  if not found then return jsonb_build_object('error','session_revoked'); end if;
  if s.suspended then return jsonb_build_object('error','suspended'); end if;
  if s.reset_required then return jsonb_build_object('error','password_change_required'); end if;
  display_name:=s.username;
 end if;
 select id,owner_id,class_id,kind into w from brick_worlds where id=p_world_id;
 if not found then return jsonb_build_object('error','not_found'); end if;
 if w.kind='personal' then return jsonb_build_object('error','private_world'); end if;
 select * into c from brick_classes where id=w.class_id;
 if teacher then
  if c.teacher_id<>p_user_id then return jsonb_build_object('error','not_found'); end if;
 else
  if c.id<>s.class_id then return jsonb_build_object('error','not_found'); end if;
  if not c.collaboration_open then return jsonb_build_object('error','class_closed'); end if;
  if w.kind='group' then
   perform 1 from brick_world_members where world_id=w.id and user_id=p_user_id;
   if not found then return jsonb_build_object('error','not_found'); end if;
  end if;
 end if;
 return jsonb_build_object('userId',p_user_id,'username',display_name,'role',case when teacher then 'teacher' else 'student' end,
  'worldId',w.id,'classId',w.class_id,'canEdit',true,'isTeacher',teacher,'isOwner',w.owner_id=p_user_id,'authVersion',p_auth_version,'sessionId',p_session_id);
end $$;
create function public.brick_authorize_world_batch(p_world_id uuid,p_identities jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item jsonb; results jsonb:='[]'::jsonb;
begin
 if jsonb_typeof(p_identities)<>'array' or jsonb_array_length(p_identities)>64 then raise exception 'Invalid permission batch'; end if;
 for item in select value from jsonb_array_elements(p_identities) loop
  results:=results||jsonb_build_array(brick_authorize_world(p_world_id,(item->>'userId')::uuid,(item->>'sessionId')::uuid,(item->>'authVersion')::integer,coalesce((item->>'teacherAllowed')::boolean,false)));
 end loop;
 return results;
end $$;
revoke all on function public.brick_authorize_world(uuid,uuid,uuid,integer,boolean),public.brick_authorize_world_batch(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.brick_authorize_world(uuid,uuid,uuid,integer,boolean),public.brick_authorize_world_batch(uuid,jsonb) to service_role;
