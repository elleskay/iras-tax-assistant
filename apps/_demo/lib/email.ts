import "server-only";
import { Resend } from "resend";

let cached: Resend | null = null;

function client(): Resend | null {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cached = new Resend(key);
  return cached;
}

export interface SendEmailInput {
  to: string | string[];
  from: string;
  subject: string;
  /** Provide html OR text (or both). At least one is required. */
  html?: string;
  text?: string;
  replyTo?: string;
}

/**
 * Send a transactional email via Resend.
 *
 * Gracefully no-ops when RESEND_API_KEY isn't set (local dev, smoke tests),
 * logs a warning and returns null. In production, set the env var; the helper
 * throws on a real Resend API error so callers can fail loudly.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ id: string } | null> {
  const c = client();
  if (!c) {
    console.warn("[email] RESEND_API_KEY not set, skipping send to", input.to);
    return null;
  }

  if (!input.html && !input.text) {
    throw new Error("[email] Either html or text must be provided");
  }

  // Build the payload as a permissive shape and cast: Resend's TS types are a
  // discriminated union over (html | text | react) which TS can't narrow from
  // our optional inputs at compile time.
  const payload = {
    to: input.to,
    from: input.from,
    subject: input.subject,
    replyTo: input.replyTo,
    ...(input.html ? { html: input.html } : {}),
    ...(input.text ? { text: input.text } : {}),
  } as Parameters<typeof c.emails.send>[0];

  const { data, error } = await c.emails.send(payload);
  if (error) throw new Error(`[email] Resend error: ${error.message}`);
  return data ? { id: data.id } : null;
}
