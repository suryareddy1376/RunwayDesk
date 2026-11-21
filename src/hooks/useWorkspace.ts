import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchWorkspaceData, type WorkspaceData } from "../services/db";
import { buildAlerts, type Alert, type AlertBill, type AlertInvoice } from "../engine/alerts";
import { forecast, type ForecastResult } from "../engine/forecast";

export const FORECAST_HORIZON_DAYS = 30;

/** Window event that asks every mounted workspace to reload from Supabase. */
export const WORKSPACE_CHANGED_EVENT = "runwaydesk:workspace-changed";

/** Local calendar date as 'YYYY-MM-DD'. */
export function todayIso(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export interface UseWorkspaceResult {
  data: WorkspaceData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  alerts: Alert[];
  forecast: ForecastResult | null;
}

/** Latest follow-up date per invoice_number, from invoice timestamps and follow-up logs. */
function lastFollowUpByInvoice(data: WorkspaceData): Record<string, string> {
  const byNumber: Record<string, string> = {};
  const numberById = new Map<string, string>();
  for (const inv of data.invoices) numberById.set(inv.id, inv.invoice_number);

  const record = (invoiceNumber: string, timestamp: string) => {
    const day = timestamp.slice(0, 10);
    if (!byNumber[invoiceNumber] || day > byNumber[invoiceNumber]) {
      byNumber[invoiceNumber] = day;
    }
  };

  for (const inv of data.invoices) {
    if (inv.last_followed_up_at) record(inv.invoice_number, inv.last_followed_up_at);
  }
  for (const log of data.followupLogs) {
    const invoiceNumber = numberById.get(log.invoice_id);
    if (invoiceNumber) record(invoiceNumber, log.sent_at);
  }
  return byNumber;
}

export function useWorkspace(): UseWorkspaceResult {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;

    if (!userId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await fetchWorkspaceData(userId);
      if (seq === requestSeq.current) setData(next);
    } catch (err) {
      if (seq === requestSeq.current) {
        setError(err instanceof Error ? err.message : "Could not load workspace.");
      }
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
    const onChanged = () => {
      void load();
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, onChanged);
  }, [load]);

  const derived = useMemo<{ alerts: Alert[]; forecast: ForecastResult | null }>(() => {
    if (!data || !data.settings) return { alerts: [], forecast: null };

    const today = todayIso();
    const clientNameById = new Map<string, string>();
    for (const client of data.clients) clientNameById.set(client.id, client.name);

    const invoices: AlertInvoice[] = data.invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      clientName: clientNameById.get(inv.client_id) ?? "Unknown client",
      amount: inv.amount,
      dueDate: inv.due_date,
      status: inv.status,
    }));

    const bills: AlertBill[] = data.bills.map((bill) => ({
      id: bill.id,
      name: bill.title,
      amount: bill.amount,
      dueDate: bill.due_date,
      status: bill.paid ? "paid" : "unpaid",
    }));

    const result = forecast(
      { today, studio: data.settings, invoices: data.invoices, bills: data.bills },
      { horizonDays: FORECAST_HORIZON_DAYS }
    );

    const alerts = buildAlerts({
      invoices,
      bills,
      lowestBalance: result.lowestBalance,
      safeBuffer: data.settings.safe_buffer_amount,
      today,
      lastFollowUpByInvoice: lastFollowUpByInvoice(data),
    });

    return { alerts, forecast: result };
  }, [data]);

  return {
    data,
    loading,
    error,
    refresh: load,
    alerts: derived.alerts,
    forecast: derived.forecast,
  };
}
