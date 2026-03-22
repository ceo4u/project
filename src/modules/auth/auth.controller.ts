import { Controller, Get, Post, UseGuards, Req } from '@nestjs/common';
import { ExtensionAuthGuard } from '../../common/guards/extension-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('extension')
export class AuthController {
  constructor(private prisma: PrismaService) { }

  @Post('validate')
  @UseGuards(ExtensionAuthGuard)
  async validateToken(@Req() req: any) {
    const user = req.user;
    const session = await this.prisma.extensionSession.findFirst({ where: { userId: user.id } });

    // Fetch latest balance from ledger
    const lastLedger = await this.prisma.creditLedger.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });
    const currentBalance = lastLedger ? lastLedger.balance : 0;

    return {
      valid: true,
      user: { id: user.id, email: user.email },
      plan: user.role || 'FREE',
      credits: currentBalance,
      expiresAt: session?.expiresAt
    };
  }
}
