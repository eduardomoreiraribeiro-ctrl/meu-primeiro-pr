-- =====================================================================
-- CRM Nutri Dudu — banco de dados no Supabase (fase 9)
--
-- Como usar: no painel do Supabase, abra "SQL Editor" › "New query",
-- cole este arquivo inteiro e clique em "Run". Pode rodar de novo sem
-- problema (ele não apaga dados).
--
-- O que ele cria:
--   • uma tabela por tipo de registro do sistema (clientes, consultas…),
--     cada linha guarda o registro completo em "dados" (jsonb);
--   • "perfis": o papel de cada pessoa da equipe (admin, profissional,
--     recepção). Quem acaba de ser cadastrado fica "pendente" até o
--     administrador liberar; o PRIMEIRO usuário vira administrador;
--   • regras de acesso (RLS): só a equipe liberada lê e grava; dados
--     clínicos (anamnese, avaliação, fotos, anotações e condutas) só
--     para administrador e profissional;
--   • "auditoria": quem criou, alterou, apagou ou abriu o prontuário;
--   • o depósito privado "fotos" (Storage), sem links públicos.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Perfis da equipe
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  nome text,
  papel text not null default 'pendente'
    check (papel in ('admin', 'profissional', 'recepcao', 'pendente', 'desativado')),
  profissional_id text,          -- vínculo com o cadastro de profissional (perfil "profissional")
  criado_em timestamptz not null default now()
);
alter table public.perfis enable row level security;

-- Funções de apoio para as regras (rodam com permissão própria para ler "perfis").
create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from public.perfis where user_id = auth.uid()
$$;

create or replace function public.meu_profissional() returns text
language sql stable security definer set search_path = public as $$
  select profissional_id from public.perfis where user_id = auth.uid()
$$;

create or replace function public.e_equipe() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_papel() in ('admin', 'profissional', 'recepcao'), false)
$$;

create or replace function public.ve_clinico() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_papel() in ('admin', 'profissional'), false)
$$;

create or replace function public.e_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_papel() = 'admin', false)
$$;

create or replace function public.e_financeiro() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_papel() in ('admin', 'recepcao'), false)
$$;

-- Novo usuário (criado em Authentication › Users) ganha um perfil:
-- o primeiro vira administrador; os demais ficam "pendente".
create or replace function public.criar_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (user_id, email, nome, papel)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)),
    case when exists (select 1 from public.perfis where papel = 'admin') then 'pendente' else 'admin' end
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.criar_perfil();

-- Usuários que já existiam antes deste script também ganham perfil.
insert into public.perfis (user_id, email, nome, papel, criado_em)
select u.id, u.email, split_part(u.email, '@', 1), 'pendente', u.created_at
from auth.users u
on conflict (user_id) do nothing;

update public.perfis set papel = 'admin'
where user_id = (select user_id from public.perfis order by criado_em limit 1)
  and not exists (select 1 from public.perfis where papel = 'admin');

-- Nunca deixar a clínica sem administrador.
create or replace function public.proteger_ultimo_admin() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  admins integer;
begin
  if old.papel <> 'admin' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select count(*) into admins from public.perfis where papel = 'admin';
  if tg_op = 'DELETE' then
    if admins <= 1 then raise exception 'A clínica precisa de pelo menos um administrador.'; end if;
    return old;
  end if;
  if new.papel <> 'admin' and admins <= 1 then
    raise exception 'A clínica precisa de pelo menos um administrador.';
  end if;
  return new;
end $$;

drop trigger if exists ultimo_admin on public.perfis;
create trigger ultimo_admin before update or delete on public.perfis
  for each row execute function public.proteger_ultimo_admin();

drop policy if exists "perfis: ver o próprio ou admin vê todos" on public.perfis;
create policy "perfis: ver o próprio ou admin vê todos" on public.perfis
  for select using (user_id = auth.uid() or public.e_admin());

drop policy if exists "perfis: admin altera" on public.perfis;
create policy "perfis: admin altera" on public.perfis
  for update using (public.e_admin()) with check (public.e_admin());


-- ---------------------------------------------------------------------
-- 2. Tabelas dos dados (todas com o mesmo formato)
-- ---------------------------------------------------------------------
create or replace function public.marcar_alteracao() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'configuracoes', 'profissionais', 'horarios', 'bloqueios', 'servicos',
    'pessoas', 'consultas', 'consultas_clinico', 'anamneses', 'avaliacoes', 'fotos',
    'pacotes', 'lancamentos', 'interacoes', 'conversas', 'mensagens'
  ] loop
    execute format($f$
      create table if not exists public.%I (
        id text primary key,
        dados jsonb not null default '{}'::jsonb,
        criado_em timestamptz not null default now(),
        atualizado_em timestamptz not null default now(),
        atualizado_por uuid default auth.uid()
      )$f$, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop trigger if exists marcar_alteracao on public.%I', t);
    execute format('create trigger marcar_alteracao before insert or update on public.%I
                    for each row execute function public.marcar_alteracao()', t);
  end loop;
end $$;

-- Índices para buscar os registros de um cliente.
create index if not exists consultas_pessoa on public.consultas ((dados ->> 'pessoaId'));
create index if not exists lancamentos_pessoa on public.lancamentos ((dados ->> 'pessoaId'));
create index if not exists interacoes_pessoa on public.interacoes ((dados ->> 'pessoaId'));


-- ---------------------------------------------------------------------
-- 3. Regras de acesso (RLS)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  -- Apaga as regras antigas destas tabelas (para poder rodar o script de novo).
  foreach t in array array[
    'configuracoes', 'profissionais', 'horarios', 'bloqueios', 'servicos',
    'pessoas', 'consultas', 'consultas_clinico', 'anamneses', 'avaliacoes', 'fotos',
    'pacotes', 'lancamentos', 'interacoes', 'conversas', 'mensagens'
  ] loop
    execute format('drop policy if exists "ler" on public.%I', t);
    execute format('drop policy if exists "criar" on public.%I', t);
    execute format('drop policy if exists "alterar" on public.%I', t);
    execute format('drop policy if exists "apagar" on public.%I', t);
  end loop;

  -- a) Dados do dia a dia: toda a equipe lê e grava.
  foreach t in array array['pessoas', 'consultas', 'pacotes', 'interacoes', 'conversas', 'mensagens'] loop
    execute format('create policy "ler" on public.%I for select using (public.e_equipe())', t);
    execute format('create policy "criar" on public.%I for insert with check (public.e_equipe())', t);
    execute format('create policy "alterar" on public.%I for update using (public.e_equipe()) with check (public.e_equipe())', t);
    execute format('create policy "apagar" on public.%I for delete using (public.e_equipe())', t);
  end loop;

  -- b) Cadastros da clínica: toda a equipe lê; só o administrador altera.
  foreach t in array array['configuracoes', 'profissionais', 'servicos'] loop
    execute format('create policy "ler" on public.%I for select using (public.e_equipe())', t);
    execute format('create policy "criar" on public.%I for insert with check (public.e_admin())', t);
    execute format('create policy "alterar" on public.%I for update using (public.e_admin()) with check (public.e_admin())', t);
    execute format('create policy "apagar" on public.%I for delete using (public.e_admin())', t);
  end loop;

  -- c) Prontuário: só administrador e profissional (a recepção não recebe nada).
  foreach t in array array['anamneses', 'avaliacoes', 'fotos', 'consultas_clinico'] loop
    execute format('create policy "ler" on public.%I for select using (public.ve_clinico())', t);
    execute format('create policy "criar" on public.%I for insert with check (public.ve_clinico())', t);
    execute format('create policy "alterar" on public.%I for update using (public.ve_clinico()) with check (public.ve_clinico())', t);
    execute format('create policy "apagar" on public.%I for delete using (public.ve_clinico())', t);
  end loop;
end $$;

-- d) Horários de atendimento: administrador altera todos; profissional, só os seus.
create policy "ler" on public.horarios for select using (public.e_equipe());
create policy "criar" on public.horarios for insert
  with check (public.e_admin() or (public.meu_papel() = 'profissional' and dados ->> 'profissionalId' = public.meu_profissional()));
create policy "alterar" on public.horarios for update
  using (public.e_admin() or (public.meu_papel() = 'profissional' and dados ->> 'profissionalId' = public.meu_profissional()))
  with check (public.e_admin() or (public.meu_papel() = 'profissional' and dados ->> 'profissionalId' = public.meu_profissional()));
create policy "apagar" on public.horarios for delete
  using (public.e_admin() or (public.meu_papel() = 'profissional' and dados ->> 'profissionalId' = public.meu_profissional()));

-- e) Bloqueios: administrador e recepção em qualquer agenda; profissional, só na sua.
create policy "ler" on public.bloqueios for select using (public.e_equipe());
create policy "criar" on public.bloqueios for insert
  with check (public.e_financeiro() or (public.meu_papel() = 'profissional' and dados ->> 'profissionalId' = public.meu_profissional()));
create policy "alterar" on public.bloqueios for update
  using (public.e_financeiro() or (public.meu_papel() = 'profissional' and dados ->> 'profissionalId' = public.meu_profissional()))
  with check (public.e_financeiro() or (public.meu_papel() = 'profissional' and dados ->> 'profissionalId' = public.meu_profissional()));
create policy "apagar" on public.bloqueios for delete
  using (public.e_financeiro() or (public.meu_papel() = 'profissional' and dados ->> 'profissionalId' = public.meu_profissional()));

-- f) Financeiro: toda a equipe vê e lança (o atendimento gera a cobrança da
--    consulta); receber, cancelar e apagar só administrador e recepção.
create policy "ler" on public.lancamentos for select using (public.e_equipe());
create policy "criar" on public.lancamentos for insert with check (public.e_equipe());
create policy "alterar" on public.lancamentos for update using (public.e_financeiro()) with check (public.e_financeiro());
create policy "apagar" on public.lancamentos for delete using (public.e_financeiro());


-- ---------------------------------------------------------------------
-- 4. Auditoria do prontuário (LGPD): quem criou, alterou, apagou e abriu
-- ---------------------------------------------------------------------
create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(),
  usuario uuid default auth.uid(),
  acao text not null,
  tabela text,
  registro text,
  pessoa_id text,
  detalhe text
);
alter table public.auditoria enable row level security;

drop policy if exists "auditoria: equipe registra acesso" on public.auditoria;
create policy "auditoria: equipe registra acesso" on public.auditoria
  for insert with check (public.e_equipe() and usuario = auth.uid());
drop policy if exists "auditoria: admin consulta" on public.auditoria;
create policy "auditoria: admin consulta" on public.auditoria
  for select using (public.e_admin());

create or replace function public.auditar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.auditoria (usuario, acao, tabela, registro, pessoa_id)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id),
    coalesce(new.dados ->> 'pessoaId', old.dados ->> 'pessoaId')
  );
  return coalesce(new, old);
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['anamneses', 'avaliacoes', 'fotos', 'consultas_clinico'] loop
    execute format('drop trigger if exists auditar on public.%I', t);
    execute format('create trigger auditar after insert or update or delete on public.%I
                    for each row execute function public.auditar()', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 5. Fotos: depósito privado, só para administrador e profissional
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do update set public = false;

drop policy if exists "fotos: clínico lê" on storage.objects;
create policy "fotos: clínico lê" on storage.objects
  for select using (bucket_id = 'fotos' and public.ve_clinico());
drop policy if exists "fotos: clínico envia" on storage.objects;
create policy "fotos: clínico envia" on storage.objects
  for insert with check (bucket_id = 'fotos' and public.ve_clinico());
drop policy if exists "fotos: clínico substitui" on storage.objects;
create policy "fotos: clínico substitui" on storage.objects
  for update using (bucket_id = 'fotos' and public.ve_clinico());
drop policy if exists "fotos: clínico apaga" on storage.objects;
create policy "fotos: clínico apaga" on storage.objects
  for delete using (bucket_id = 'fotos' and public.ve_clinico());


-- ---------------------------------------------------------------------
-- 6. Tempo real: o que um computador grava aparece nos outros
--    (cada um só recebe o que as regras acima deixam ver)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'configuracoes', 'profissionais', 'horarios', 'bloqueios', 'servicos',
    'pessoas', 'consultas', 'consultas_clinico', 'anamneses', 'avaliacoes', 'fotos',
    'pacotes', 'lancamentos', 'interacoes', 'conversas', 'mensagens'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object or undefined_object then
      null; -- já estava (ou o tempo real não está disponível): segue.
    end;
  end loop;
end $$;
