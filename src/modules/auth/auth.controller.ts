import { Controller, Get, Post, UseGuards, Req, Body } from '@nestjs/common';
import { ExtensionAuthGuard } from '../../common/guards/extension-auth.guard';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { randomBytes } from 'crypto';

@Controller('extension')
export class AuthController {
  constructor(private prisma: PrismaService) { }

  // ── Called by the EXTENSION popup to validate its token ──
  @Post('validate')
  @UseGuards(ExtensionAuthGuard)
  async validateToken(@Req() req: any) {
    const user = req.user;
    const session = await this.prisma.extensionSession.findFirst({
      where: { userId: user.id },
    });

    const lastLedger = await this.prisma.creditLedger.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    const currentBalance = lastLedger ? lastLedger.balance : 0;

    const session_expires_in = 900; // 15 mins
    const session_expires_at = Math.floor(Date.now() / 1000) + session_expires_in;
    const deviceId = req.headers['x-device-id'];

    let session_signature = null;
    if (deviceId && session?.token) {
      const crypto = require('crypto');
      session_signature = crypto.createHmac('sha256', process.env.JWT_SECRET || 'ECOM_RTX_SECRET_CORE')
        .update(session.token + deviceId + session_expires_at)
        .digest('hex');
    }

    return {
      valid: true,
      user: { id: user.id, email: user.email },
      plan: user.role || 'FREE',
      credits: currentBalance,
      expiresAt: session?.expiresAt,
      session_signature,
      session_expires_at,
      session_expires_in
    };
  }

  // ── Called by DASHBOARD to check if user already has a token ──
  @Get('token')
  @UseGuards(FirebaseAuthGuard)
  async getToken(@Req() req: any) {
    const user = req.user;

    const session = await this.prisma.extensionSession.findFirst({
      where: {
        userId: user.id,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (session) {
      return {
        hasToken: true,
        token: session.token,
        expiresAt: session.expiresAt,
      };
    }

    return { hasToken: false };
  }

  // ── Called by DASHBOARD to generate a new extension token ──
  @Post('token')
  @UseGuards(FirebaseAuthGuard)
  async generateToken(@Req() req: any) {
    const user = req.user;

    // Generate secure random token
    const token = 'ert_' + randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    // Delete old sessions for this user
    await this.prisma.extensionSession.deleteMany({
      where: { userId: user.id },
    });

    // Create new session
    const session = await this.prisma.extensionSession.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    return {
      token: session.token,
      expiresAt: session.expiresAt,
    };
  }

  // ── Called by EXTENSION to GET synced defaults ──
  @Get('defaults')
  @UseGuards(ExtensionAuthGuard)
  async getDefaults(@Req() req: any) {
    const defaults = await this.prisma.extensionDefault.findMany({
      where: { userId: req.user.id },
      select: { id: true, label: true, selector: true, type: true, value: true, createdAt: true }
    });
    return { success: true, defaults };
  }

  // ── Called by EXTENSION to SAVE/SYNC defaults ──
  @Post('defaults')
  @UseGuards(ExtensionAuthGuard)
  async saveDefaults(@Req() req: any, @Body() body: any) {
    const { defaults } = body;
    if (!Array.isArray(defaults)) return { success: false, error: 'Invalid payload' };

    // Completely replace user defaults to keep it perfectly synced
    await this.prisma.$transaction([
      this.prisma.extensionDefault.deleteMany({ where: { userId: req.user.id } }),
      this.prisma.extensionDefault.createMany({
        data: defaults.map(d => ({
          userId: req.user.id,
          label: d.label,
          selector: d.selector || null,
          type: d.type || 'text',
          value: String(d.value)
        }))
      })
    ]);

    return { success: true, synced: defaults.length };
  }
}
