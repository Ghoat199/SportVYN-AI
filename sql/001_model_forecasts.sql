-- Run once in the Supabase SQL Editor.
create table if not exists public.sportvyn_model_forecasts (
 id uuid primary key default gen_random_uuid(),
 match_id uuid not null references public.sportvyn_matches(id) on delete cascade,
 model_version text not null default 'poisson_baseline_v1',
 predicted_at timestamptz not null default now(),
 starts_at timestamptz not null,
 home_probability numeric not null,
 draw_probability numeric not null,
 away_probability numeric not null,
 predicted_outcome text not null check(predicted_outcome in ('home','draw','away')),
 home_expected_goals numeric not null,
 away_expected_goals numeric not null,
 home_sample integer not null,
 away_sample integer not null,
 settled_at timestamptz,
 actual_outcome text check(actual_outcome in ('home','draw','away')),
 correct boolean,
 unique(match_id,model_version)
);
alter table public.sportvyn_model_forecasts enable row level security;
-- No public access: the service role performs the scheduled writes.
create index if not exists sportvyn_model_forecasts_unsettled on public.sportvyn_model_forecasts(settled_at) where settled_at is null;
