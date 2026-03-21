import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { ExtensionAuthGuard } from '../../common/guards/extension-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('extension')
export class AuthController {
    constructor(private prisma: PrismaService) {}

  @Get('validate')
  @UseGuards(ExtensionAuthGuard)
  async validateToken(@Req() req: any) {
    const user = req.user;
    const session = await this.prisma.session.findFirst({ where: { userId: user.id } });
    return {
      valid: true,
      user: { id: user.id, email: user.email },
      plan: user.plan,
      credits: user.credits,
      expiresAt: session?.expiresAt
    };
  }
}
