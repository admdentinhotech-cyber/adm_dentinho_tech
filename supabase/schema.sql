create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default 'Aluno'
    check (role in ('Aluno', 'Professor', 'Secretario')),
  account_status text not null default 'Pendente'
    check (account_status in ('Pendente', 'Aprovado', 'Rejeitado')),
  created_at timestamptz not null default now()
);

create table if not exists public.patient_records (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  status text not null default 'Em análise'
    check (status in ('Em análise', 'Em atendimento', 'Aguardando aprovação', 'Aprovado')),
  last_visit text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists account_status text;

alter table public.profiles
  alter column account_status set default 'Pendente';

update public.profiles
set account_status = 'Aprovado'
where account_status is null;

alter table public.profiles
  alter column account_status set not null;

do $$
begin
  alter table public.profiles drop constraint if exists profiles_role_check;
  alter table public.profiles add constraint profiles_role_check
    check (role in ('Aluno', 'Professor', 'Secretario'));
  alter table public.profiles drop constraint if exists profiles_account_status_check;
  alter table public.profiles add constraint profiles_account_status_check
    check (account_status in ('Pendente', 'Aprovado', 'Rejeitado'));
end;
$$;

create index if not exists patient_records_owner_id_idx
  on public.patient_records (owner_id);
create index if not exists patient_records_status_idx
  on public.patient_records (status);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, account_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'Aluno',
    'Pendente'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.current_user_is_professor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'Professor'
      and account_status = 'Aprovado'
  );
$$;

create or replace function public.current_user_is_secretario()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'Secretario'
      and account_status = 'Aprovado'
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  new.data = coalesce(new.data, '{}'::jsonb) || jsonb_build_object('status', new.status);
  return new;
end;
$$;

drop trigger if exists patient_records_touch_updated_at on public.patient_records;
create trigger patient_records_touch_updated_at
  before update on public.patient_records
  for each row execute procedure public.touch_updated_at();

drop trigger if exists patient_records_sync_insert on public.patient_records;
create trigger patient_records_sync_insert
  before insert on public.patient_records
  for each row execute procedure public.touch_updated_at();

create or replace function public.prevent_student_approval_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  is_professor boolean;
begin
  select public.current_user_is_professor() into is_professor;

  if auth.uid() is not null and coalesce(is_professor, false) = false then
    if new.status = 'Aprovado'
      or coalesce(new.data -> 'status', 'null'::jsonb) = '"Aprovado"'::jsonb
      or coalesce(new.data -> 'approval' ->> 'status', '') = 'Aprovado'
      or nullif(trim(coalesce(new.data -> 'approval' ->> 'professor', '')), '') is not null
    then
      raise exception 'Apenas professores podem aprovar prontuarios.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists patient_records_prevent_student_approval on public.patient_records;
create trigger patient_records_prevent_student_approval
  before insert or update on public.patient_records
  for each row execute procedure public.prevent_student_approval_changes();

revoke all on function public.handle_new_user() from public;
revoke all on function public.touch_updated_at() from public;
revoke all on function public.prevent_student_approval_changes() from public;

alter table public.profiles enable row level security;
alter table public.patient_records enable row level security;

grant select, update (full_name, role, account_status) on public.profiles to authenticated;
grant select, insert, update, delete on public.patient_records to authenticated;
grant usage on schema public to authenticated;

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null
    and not public.current_user_is_secretario()
    and (
      new.role is distinct from old.role
      or new.account_status is distinct from old.account_status
    )
  then
    raise exception 'Somente secretaria pode alterar papel ou aprovacao da conta.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute procedure public.protect_profile_role();
revoke all on function public.protect_profile_role() from public;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists "Users update own profile name" on public.profiles;
create policy "Users update own profile name"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "Secretaries read all profiles" on public.profiles;
create policy "Secretaries read all profiles"
  on public.profiles for select to authenticated
  using (public.current_user_is_secretario());

drop policy if exists "Secretaries update all profiles" on public.profiles;
create policy "Secretaries update all profiles"
  on public.profiles for update to authenticated
  using (public.current_user_is_secretario())
  with check (public.current_user_is_secretario());

drop policy if exists "Owners and professors read patient records" on public.patient_records;
create policy "Owners and professors read patient records"
  on public.patient_records for select to authenticated
  using (owner_id = auth.uid() or public.current_user_is_professor());

drop policy if exists "Students create own patient records" on public.patient_records;
create policy "Students create own patient records"
  on public.patient_records for insert to authenticated
  with check (owner_id = auth.uid() and not public.current_user_is_professor());

drop policy if exists "Students update own patient records" on public.patient_records;
create policy "Students update own patient records"
  on public.patient_records for update to authenticated
  using (owner_id = auth.uid() and not public.current_user_is_professor())
  with check (owner_id = auth.uid() and not public.current_user_is_professor());

drop policy if exists "Students delete own patient records" on public.patient_records;
create policy "Students delete own patient records"
  on public.patient_records for delete to authenticated
  using (owner_id = auth.uid() and not public.current_user_is_professor());

create or replace function public.approve_patient_record(
  record_id uuid,
  professor_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  professor_full_name text;
begin
  if auth.uid() is null or not public.current_user_is_professor() then
    raise exception 'Apenas professores podem aprovar prontuarios.';
  end if;

  select nullif(trim(full_name), '')
  into professor_full_name
  from public.profiles
  where id = auth.uid();

  if professor_full_name is null then
    professor_full_name := nullif(trim(professor_name), '');
  end if;

  if professor_full_name is null then
    raise exception 'Informe o nome do professor.';
  end if;

  update public.patient_records
  set
    status = 'Aprovado',
    data = jsonb_set(
      jsonb_set(
        coalesce(data, '{}'::jsonb) || jsonb_build_object('status', 'Aprovado'),
        '{approval}',
        coalesce(data -> 'approval', '{}'::jsonb) ||
          jsonb_build_object(
            'status', 'Aprovado',
            'professor', professor_full_name
          ),
        true
      ),
      '{history}',
      coalesce(data -> 'history', '[]'::jsonb) ||
        jsonb_build_array(
          jsonb_build_object(
            'date', to_char(current_date, 'DD/MM/YYYY'),
            'title', 'Prontuário aprovado',
            'description', 'Assinado e aprovado por ' || professor_full_name
          )
        ),
      true
    )
  where id = record_id
    and (
      status = 'Aguardando aprovação'
      or data #>> '{approval,status}' = 'Solicitação enviada'
    );

  if not found then
    raise exception 'Prontuário não encontrado ou não está aguardando aprovação.';
  end if;
end;
$$;

revoke all on function public.current_user_is_professor() from public;
grant execute on function public.current_user_is_professor() to authenticated;
revoke all on function public.approve_patient_record(uuid, text) from public;
grant execute on function public.approve_patient_record(uuid, text) to authenticated;

create or replace function public.review_user_account(
  account_id uuid,
  approved_role text,
  approved boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.current_user_is_secretario() then
    raise exception 'Somente secretaria pode aprovar contas.';
  end if;

  if approved then
    if approved_role not in ('Aluno', 'Professor', 'Secretario') then
      raise exception 'Papel informado invalido.';
    end if;

    update public.profiles
    set role = approved_role,
        account_status = 'Aprovado'
    where id = account_id
      and account_status = 'Pendente';
  else
    update public.profiles
    set account_status = 'Rejeitado'
    where id = account_id
      and account_status = 'Pendente';
  end if;

  if not found then
    raise exception 'Conta nao encontrada ou nao esta pendente.';
  end if;
end;
$$;

revoke all on function public.current_user_is_secretario() from public;
grant execute on function public.current_user_is_secretario() to authenticated;
revoke all on function public.review_user_account(uuid, text, boolean) from public;
grant execute on function public.review_user_account(uuid, text, boolean) to authenticated;

insert into storage.buckets (id, name, public)
values ('radiografia', 'radiografia', false)
on conflict (id) do update set public = false;

drop policy if exists "Owners and professors read patient images" on storage.objects;
create policy "Owners and professors read patient images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'radiografia'
    and (
      public.current_user_is_professor()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop policy if exists "Students upload own patient images" on storage.objects;
create policy "Students upload own patient images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'radiografia'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.current_user_is_professor()
  );

drop policy if exists "Students update own patient images" on storage.objects;
create policy "Students update own patient images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'radiografia'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.current_user_is_professor()
  )
  with check (
    bucket_id = 'radiografia'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.current_user_is_professor()
  );

drop policy if exists "Students delete own patient images" on storage.objects;
create policy "Students delete own patient images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'radiografia'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.current_user_is_professor()
  );
