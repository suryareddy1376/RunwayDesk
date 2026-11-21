export type InvoiceStatus = 'draft' | 'sent' | 'overdue' | 'paid';

export type BillCategory = 'rent' | 'contractor' | 'software' | 'tax' | 'other';

export type FollowupChannel = 'whatsapp' | 'email';

export type FollowupTone = 'friendly' | 'firm' | 'final';

export interface StudioSettings {
  user_id: string;
  studio_name: string;
  owner_name: string;
  currency_symbol: string;
  opening_balance: number;
  safe_buffer_amount: number;
  created_at: string;
}

export interface Client {
  id: string;
  user_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  whatsapp: string | null;
  avg_delay_days: number;
  notes: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  user_id: string;
  client_id: string;
  invoice_number: string;
  title: string;
  amount: number;
  issue_date: string;
  due_date: string;
  status: InvoiceStatus;
  paid_date: string | null;
  last_followed_up_at: string | null;
  created_at: string;
}

export interface Bill {
  id: string;
  user_id: string;
  title: string;
  category: BillCategory;
  amount: number;
  due_date: string;
  recurring_monthly: boolean;
  paid: boolean;
  created_at: string;
}

export interface FollowupLog {
  id: string;
  user_id: string;
  invoice_id: string;
  sent_at: string;
  channel: FollowupChannel;
  tone: FollowupTone;
  message: string;
  created_at: string;
}
