-- Cero Agotados — privilegios para los roles de la API (anon / authenticated / service_role)
-- =========================================================================================
-- El acceso a filas lo gobierna RLS; estos GRANT dan el privilegio de tabla base.
-- `service_role` (backend FastAPI) tiene acceso total y bypassa RLS.
-- `authenticated`/`anon` reciben privilegios amplios pero RLS filtra las filas.

grant usage on schema public to anon, authenticated, service_role;

-- Backend (service_role): acceso total, presente y futuro.
grant all on all tables in schema public to service_role;
grant all on all routines in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Clientes autenticados (web): privilegios de tabla; RLS restringe las filas.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all routines in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Anónimo: solo lectura (lecturas públicas gobernadas por RLS).
grant select on all tables in schema public to anon;

-- Objetos futuros creados por el rol de migraciones.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on routines to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant execute on routines to authenticated;
