import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async getTransport() {
    const settings = await this.prisma.setting.findMany({
      where: { key: { in: ['smtp.host', 'smtp.port', 'smtp.user', 'smtp.password', 'smtp.from'] } },
    });
    const get = (key: string) => settings.find((s) => s.key === key)?.value ?? '';
    const host = get('smtp.host');
    if (!host) return null;
    return nodemailer.createTransport({
      host,
      port: parseInt(get('smtp.port') || '587', 10),
      secure: parseInt(get('smtp.port') || '587', 10) === 465,
      auth: get('smtp.user') ? { user: get('smtp.user'), pass: get('smtp.password') } : undefined,
    });
  }

  async send(to: string, subject: string, html: string): Promise<boolean> {
    try {
      const transport = await this.getTransport();
      if (!transport) return false;
      const fromSetting = await this.prisma.setting.findUnique({ where: { key: 'smtp.from' } });
      const from = fromSetting?.value ?? 'VCP <noreply@vcp.local>';
      await transport.sendMail({ from, to, subject, html });
      this.logger.log(`E-Mail gesendet an ${to}: ${subject}`);
      return true;
    } catch (err: any) {
      this.logger.error(`E-Mail-Fehler: ${err.message}`);
      return false;
    }
  }
}
