import "server-only";
import nodemailer from "nodemailer";

// Sends an email when SMTP is configured. Locally that's Supabase's test mailbox (http://127.0.0.1:54324),
// so nothing leaves the machine. Returns false when there's no mail server, and the screen shows the link instead.
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  if (!host) return false;
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  try {
    await transport.sendMail({ from: process.env.MAIL_FROM ?? "no-reply@crewbase.example", to, subject, text });
    return true;
  } catch {
    return false;
  }
}

export function appUrl(path: string): string {
  return `${process.env.APP_URL ?? "http://localhost:3000"}${path}`;
}
