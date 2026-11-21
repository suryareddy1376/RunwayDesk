export type ReminderTone = 'friendly' | 'firm' | 'final';

export const TONE_LABELS: Record<ReminderTone, string> = {
  friendly: 'Friendly Nudge',
  firm: 'Firm Reminder',
  final: 'Final Notice',
};

export interface ReminderInput {
  contactName: string;
  studioName: string;
  invoiceNumber: string;
  amount: number;
  daysOverdue: number;
}

/** Formats an amount as rupees with Indian digit grouping, e.g. 95000 -> "₹95,000", 1234567 -> "₹12,34,567". */
export function formatINR(amount: number): string {
  const rounded = Math.round(amount);
  const digits = String(Math.abs(rounded));
  let grouped = digits;
  if (digits.length > 3) {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3);
    grouped = `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
  }
  return `${rounded < 0 ? '-' : ''}\u20B9${grouped}`;
}

export function buildReminder(tone: ReminderTone, input: ReminderInput): string {
  const { contactName, studioName, invoiceNumber, daysOverdue } = input;
  const amount = formatINR(input.amount);
  const overdue = daysOverdue > 0 ? `${daysOverdue} days past due` : 'coming due shortly';

  switch (tone) {
    case 'friendly':
      return (
        `Hi ${contactName}, hope you are doing well. ` +
        `A quick friendly reminder that invoice ${invoiceNumber} for ${amount} is ${overdue}. ` +
        `Could you let us know when we can expect the payment? Thank you!\n\n` +
        `Regards,\n${studioName}`
      );
    case 'firm':
      return (
        `Hi ${contactName}, following up on invoice ${invoiceNumber} for ${amount}, which is ${overdue}. ` +
        `Please arrange payment at the earliest. If there is an issue, let us know so we can discuss it.\n\n` +
        `Regards,\n${studioName}`
      );
    case 'final':
      return (
        `Dear ${contactName}, this is a final notice regarding invoice ${invoiceNumber} for ${amount}, ` +
        `now ${overdue}. Please make the payment within 7 days. ` +
        `If we do not hear back, we will have to escalate this further.\n\n` +
        `Regards,\n${studioName}`
      );
  }
}

export function buildWhatsAppUrl(whatsapp: string, text: string): string {
  const digits = whatsapp.replace(/\D/g, '');
  return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(text);
}

export function buildMailtoUrl(email: string, subject: string, body: string): string {
  return 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
}
