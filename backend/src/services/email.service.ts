import nodemailer from 'nodemailer';
import { config } from '@config/app.config';
import { logger } from '@config/logger';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface SendVerificationEmailDto {
  to: string;
  name: string;
  token: string;
}

interface SendPasswordResetEmailDto {
  to: string;
  name: string;
  token: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: {
        user: config.email.user,
        pass: config.email.password,
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      tls: {
        rejectUnauthorized: config.node.env === 'production',
      },
    });
  }

  private async send(options: EmailOptions): Promise<void> {
    if (config.node.env === 'test') return; // Don't send emails in tests

    try {
      await this.transporter.sendMail({
        from: `${config.app.name} <${config.email.from}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text ?? this.stripHtml(options.html),
      });

      logger.info('Email sent', { to: options.to, subject: options.subject });
    } catch (error) {
      logger.error('Failed to send email', { to: options.to, error });
      // Don't throw — email failures shouldn't crash the API
    }
  }

  async sendVerificationEmail(dto: SendVerificationEmailDto): Promise<void> {
    const verifyUrl = `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/verify-email?token=${dto.token}`;

    await this.send({
      to: dto.to,
      subject: `Verify your ${config.app.name} account`,
      html: this.baseTemplate({
        title: 'Verify your email address',
        body: `
          <p>Hi ${dto.name},</p>
          <p>Thanks for registering! Please verify your email address by clicking the button below.</p>
          <p>This link expires in <strong>24 hours</strong>.</p>
        `,
        ctaUrl: verifyUrl,
        ctaText: 'Verify Email',
        footer: "If you didn't create an account, you can safely ignore this email.",
      }),
    });
  }

  async sendPasswordResetEmail(dto: SendPasswordResetEmailDto): Promise<void> {
    const resetUrl = `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/reset-password?token=${dto.token}`;

    await this.send({
      to: dto.to,
      subject: `Reset your ${config.app.name} password`,
      html: this.baseTemplate({
        title: 'Reset your password',
        body: `
          <p>Hi ${dto.name},</p>
          <p>We received a request to reset your password. Click the button below to create a new one.</p>
          <p>This link expires in <strong>1 hour</strong>.</p>
        `,
        ctaUrl: resetUrl,
        ctaText: 'Reset Password',
        footer: "If you didn't request this, you can safely ignore this email. Your password won't change.",
      }),
    });
  }

  async sendWelcomeEmail(dto: { to: string; name: string }): Promise<void> {
    await this.send({
      to: dto.to,
      subject: `Welcome to ${config.app.name}!`,
      html: this.baseTemplate({
        title: `Welcome, ${dto.name}!`,
        body: `
          <p>Your account has been verified and is now active.</p>
          <p>You can now sign in and start using the platform.</p>
        `,
        ctaUrl: `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/login`,
        ctaText: 'Sign In',
        footer: `You're receiving this because you signed up for ${config.app.name}.`,
      }),
    });
  }

  private baseTemplate(opts: {
    title: string;
    body: string;
    ctaUrl: string;
    ctaText: string;
    footer: string;
  }): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${opts.title}</title>
    </head>
    <body style="margin:0;padding:0;background:#f9fafb;font-family:Inter,-apple-system,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding:40px 16px;">
            <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
              <!-- Header -->
              <tr>
                <td style="background:#4f46e5;padding:28px 40px;">
                  <span style="color:#ffffff;font-size:20px;font-weight:700;">${config.app.name}</span>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding:40px;color:#374151;font-size:15px;line-height:1.6;">
                  <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">${opts.title}</h1>
                  ${opts.body}
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;">
                    <tr>
                      <td>
                        <a href="${opts.ctaUrl}"
                           style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">
                          ${opts.ctaText}
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin-top:24px;font-size:13px;color:#6b7280;">
                    Or copy this link:<br/>
                    <a href="${opts.ctaUrl}" style="color:#4f46e5;word-break:break-all;">${opts.ctaUrl}</a>
                  </p>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="padding:24px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
                  ${opts.footer}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  async verifyConnection(): Promise<void> {
    if (config.node.env === 'test') return;
    try {
      await this.transporter.verify();
      logger.info('Email service connected');
    } catch (error) {
      logger.warn('Email service connection failed', { error });
    }
  }
}

export const emailService = new EmailService();
