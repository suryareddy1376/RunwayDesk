import { supabase } from "../lib/supabase";

const MS_PER_DAY = 86_400_000;

export const INVOICE_NUDGES_SQL = `
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
create index if not exists idx_invoice_nudges_user_invoice_time on public.invoice_nudges (user_id, invoice_ref, nudged_at desc);
alter table public.invoice_nudges enable row level security;
create policy "Users can view their own invoice nudges" on public.invoice_nudges for select using (auth.uid() = user_id);
create policy "Users can insert their own invoice nudges" on public.invoice_nudges for insert with check (auth.uid() = user_id);
create policy "Users can delete their own invoice nudges" on public.invoice_nudges for delete using (auth.uid() = user_id);
`;

export type NudgeTone = "Friendly" | "Firm" | "Final";

export interface NudgeRecord {
  id: string;
  user_id: string;
  invoice_ref: string;
  client_label: string | null;
  amount_inr: number | null;
  tone: NudgeTone;
  message: string;
  nudged_at: string;
  created_at: string;
}

const TONE_LABELS: Record<NudgeTone, string> = {
  Friendly: "Friendly",
  Firm: "Firm",
  Final: "Final",
};

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function throwIfError(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

function overdueText(days: number): string {
  if (days > 0) {
    return days === 1 ? "1 day overdue" : `${days} days overdue`;
  }
  return "due";
}

export function buildNudgeMessage(
  tone: NudgeTone,
  input: { clientName: string; invoiceNumber: string; amount: number; dueDate: string; daysOverdue: number }
): string {
  const amount = inrFormatter.format(input.amount);
  const { clientName, invoiceNumber, dueDate } = input;
  const status = overdueText(input.daysOverdue);

  if (tone === "Friendly") {
    return (
      `Hi ${clientName}, this is a friendly reminder that invoice ${invoiceNumber} ` +
      `for ${amount}, due on ${dueDate}, is ${status}. ` +
      `If the payment has already been sent, please ignore this note. Thank you.`
    );
  }

  if (tone === "Firm") {
    return (
      `Dear ${clientName}, invoice ${invoiceNumber} for ${amount} was due on ${dueDate} ` +
      `and is ${status}. Please arrange payment of ${amount} within 7 days of this notice. ` +
      `Kindly confirm once the payment has been made.`
    );
  }

  return (
    `Dear ${clientName}, this is our final notice regarding invoice ${invoiceNumber} ` +
    `for ${amount}, due on ${dueDate} and ${status}. ` +
    `Please settle the full amount within 3 days of this notice. ` +
    `If payment is not received, we will have to escalate this matter.`
  );
}

export function latestNudgeLabel(nudges: NudgeRecord[], now: Date): string | null {
  if (nudges.length === 0) return null;

  const latest = nudges.reduce((a, b) =>
    Date.parse(b.nudged_at) > Date.parse(a.nudged_at) ? b : a
  );

  const elapsedMs = Math.max(0, now.getTime() - Date.parse(latest.nudged_at));
  const days = Math.floor(elapsedMs / MS_PER_DAY);

  let when: string;
  if (days === 0) {
    when = "today";
  } else if (days === 1) {
    when = "1 day ago";
  } else {
    when = `${days} days ago`;
  }

  return `Nudged ${when} (${TONE_LABELS[latest.tone]})`;
}

export async function fetchInvoiceNudges(invoiceRef: string): Promise<NudgeRecord[]> {
  const { data, error } = await supabase
    .from("invoice_nudges")
    .select("*")
    .eq("invoice_ref", invoiceRef)
    .order("nudged_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as NudgeRecord[];
}

export async function logInvoiceNudge(input: {
  invoiceRef: string;
  clientLabel: string | null;
  amountInr: number | null;
  tone: NudgeTone;
  message: string;
}): Promise<NudgeRecord> {
  const { data, error } = await supabase
    .from("invoice_nudges")
    .insert({
      invoice_ref: input.invoiceRef,
      client_label: input.clientLabel,
      amount_inr: input.amountInr,
      tone: input.tone,
      message: input.message,
    })
    .select()
    .single();
  throwIfError(error);
  return data as NudgeRecord;
}
