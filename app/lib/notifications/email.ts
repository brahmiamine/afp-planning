import nodemailer, { type Transporter } from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

let cachedTransporter: Transporter | null | undefined;

function buildTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number.parseInt(process.env.SMTP_PORT || '', 10);
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;

  if (!host || !Number.isFinite(port) || !user || !password) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass: password },
  });
}

function getTransporter(): Transporter | null {
  if (cachedTransporter === undefined) {
    cachedTransporter = buildTransporter();
    if (!cachedTransporter) {
      console.warn(
        '[email] SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD ne sont pas tous définis — les notifications par email sont désactivées.',
      );
    }
  }
  return cachedTransporter;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) return;

  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER;
  try {
    await transporter.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  } catch (error) {
    console.error('Error sending notification email:', error);
  }
}
