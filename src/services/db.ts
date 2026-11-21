import { supabase } from "../lib/supabase";
import type {
  Bill,
  Client,
  FollowupChannel,
  FollowupLog,
  FollowupTone,
  Invoice,
  StudioSettings,
} from "../types/database";

export interface WorkspaceData {
  settings: StudioSettings | null;
  clients: Client[];
  invoices: Invoice[];
  bills: Bill[];
  followupLogs: FollowupLog[];
}

type ClientInput = Omit<Client, "id" | "user_id" | "created_at">;
type ClientPatch = Partial<ClientInput>;
type InvoiceInput = Omit<Invoice, "id" | "user_id" | "created_at">;
type InvoicePatch = Partial<InvoiceInput>;
type BillInput = Omit<Bill, "id" | "user_id" | "created_at">;

function throwIfError(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  throwIfError(error);
  if (!data.user) {
    throw new Error("No authenticated user session.");
  }
  return data.user.id;
}

function normalizeSettings(row: StudioSettings): StudioSettings {
  return {
    ...row,
    opening_balance: Number(row.opening_balance),
    safe_buffer_amount: Number(row.safe_buffer_amount),
  };
}

function normalizeInvoice(row: Invoice): Invoice {
  return { ...row, amount: Number(row.amount) };
}

function normalizeBill(row: Bill): Bill {
  return { ...row, amount: Number(row.amount) };
}

function localIsoDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function fetchWorkspaceData(userId: string): Promise<WorkspaceData> {
  const [settingsRes, clientsRes, invoicesRes, billsRes, logsRes] = await Promise.all([
    supabase.from("studio_settings").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("clients").select("*").eq("user_id", userId),
    supabase.from("invoices").select("*").eq("user_id", userId),
    supabase.from("bills").select("*").eq("user_id", userId),
    supabase.from("followup_logs").select("*").eq("user_id", userId),
  ]);

  throwIfError(settingsRes.error);
  throwIfError(clientsRes.error);
  throwIfError(invoicesRes.error);
  throwIfError(billsRes.error);
  throwIfError(logsRes.error);

  const settingsRow = settingsRes.data as StudioSettings | null;
  const invoiceRows = (invoicesRes.data ?? []) as Invoice[];
  const billRows = (billsRes.data ?? []) as Bill[];

  return {
    settings: settingsRow ? normalizeSettings(settingsRow) : null,
    clients: (clientsRes.data ?? []) as Client[],
    invoices: invoiceRows.map(normalizeInvoice),
    bills: billRows.map(normalizeBill),
    followupLogs: (logsRes.data ?? []) as FollowupLog[],
  };
}

export async function seedDemoWorkspace(): Promise<void> {
  const { error } = await supabase.rpc("seed_demo_workspace");
  throwIfError(error);
}

export async function createClientRecord(input: ClientInput): Promise<Client> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("clients")
    .insert({ ...input, user_id: userId })
    .select()
    .single();
  throwIfError(error);
  return data as Client;
}

export async function updateClientRecord(id: string, patch: ClientPatch): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  throwIfError(error);
  return data as Client;
}

export async function createInvoice(input: InvoiceInput): Promise<Invoice> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("invoices")
    .insert({ ...input, user_id: userId })
    .select()
    .single();
  throwIfError(error);
  return normalizeInvoice(data as Invoice);
}

export async function updateInvoice(id: string, patch: InvoicePatch): Promise<Invoice> {
  const { data, error } = await supabase
    .from("invoices")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  throwIfError(error);
  return normalizeInvoice(data as Invoice);
}

export async function markInvoicePaid(
  invoice: Invoice,
  currentOpeningBalance: number
): Promise<Invoice> {
  const userId = await currentUserId();

  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "paid", paid_date: localIsoDate(new Date()) })
    .eq("id", invoice.id)
    .select()
    .single();
  throwIfError(error);

  const newOpeningBalance = Number(currentOpeningBalance) + Number(invoice.amount);
  const settingsRes = await supabase
    .from("studio_settings")
    .update({ opening_balance: newOpeningBalance })
    .eq("user_id", userId);
  throwIfError(settingsRes.error);

  return normalizeInvoice(data as Invoice);
}

export async function createBill(input: BillInput): Promise<Bill> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("bills")
    .insert({ ...input, user_id: userId })
    .select()
    .single();
  throwIfError(error);
  return normalizeBill(data as Bill);
}

export async function toggleBillPaid(bill: Bill): Promise<Bill> {
  const { data, error } = await supabase
    .from("bills")
    .update({ paid: !bill.paid })
    .eq("id", bill.id)
    .select()
    .single();
  throwIfError(error);
  return normalizeBill(data as Bill);
}

export async function logFollowUp(
  invoiceId: string,
  channel: FollowupChannel,
  tone: FollowupTone,
  message: string
): Promise<FollowupLog> {
  const userId = await currentUserId();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("followup_logs")
    .insert({
      user_id: userId,
      invoice_id: invoiceId,
      sent_at: now,
      channel,
      tone,
      message,
    })
    .select()
    .single();
  throwIfError(error);

  const invoiceRes = await supabase
    .from("invoices")
    .update({ last_followed_up_at: now })
    .eq("id", invoiceId);
  throwIfError(invoiceRes.error);

  return data as FollowupLog;
}
