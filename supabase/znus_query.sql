-- Vercel serverless fallback for environments where outbound Postgres TCP is blocked.
-- The function is called only with the server-side Supabase service-role key.
create or replace function public.znus_query(query text, params jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rendered text := query;
  result jsonb := '[]'::jsonb;
  index integer;
begin
  if jsonb_typeof(params) <> 'array' then
    raise exception 'params must be a JSON array';
  end if;

  -- Replace PostgreSQL placeholders from right to left so $10 is not
  -- accidentally matched as $1. Values are quoted before insertion.
  for index in reverse jsonb_array_length(params)..1 loop
    rendered := replace(rendered, '$' || index::text,
      quote_nullable(params ->> (index - 1)));
  end loop;

  if rendered ~* '^\s*(select|with)\s' then
    execute format('select coalesce(jsonb_agg(to_jsonb(row_data)), ''[]''::jsonb) from (%s) row_data', rendered)
      into result;
  elsif position('returning' in lower(rendered)) > 0 then
    execute format('with result_rows as (%s) select coalesce(jsonb_agg(to_jsonb(result_rows)), ''[]''::jsonb) from result_rows', rendered)
      into result;
  else
    execute rendered;
  end if;

  return result;
end;
$$;

revoke all on function public.znus_query(text, jsonb) from public, anon, authenticated;
grant execute on function public.znus_query(text, jsonb) to service_role;
