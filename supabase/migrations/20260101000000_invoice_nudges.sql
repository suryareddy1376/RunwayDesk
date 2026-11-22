-- 1. Create the invoice_nudges table
create table if not exists public.invoice_nudges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  invoice_ref text not null,
  client_label text,
  amount_inr numeric(12, 2),
  tone text not null check (tone in ('Friendly', 'Firm', 'Final')),
  message text not null,
  nudged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 2. Index for fast lookups by user and invoice reference
create index if not exists idx_invoice_nudges_user_invoice_time on public.invoice_nudges (user_id, invoice_ref, nudged_at desc);

-- 3. Row level security: each user sees and inserts only their own nudges
alter table public.invoice_nudges enable row level security;

create policy "Users can view their own invoice nudges" on public.invoice_nudges for select using (auth.uid() = user_id);
create policy "Users can insert their own invoice nudges" on public.invoice_nudges for insert with check (auth.uid() = user_id);
create policy "Users can delete their own invoice nudges" on public.invoice_nudges for delete using (auth.uid() = user_id);
