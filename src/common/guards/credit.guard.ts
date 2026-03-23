import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CreditGuard implements CanActivate {
  constructor(private prisma: PrismaService) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) throw new ForbiddenException('User not authenticated');

    // ADMIN and PRO users get unlimited credits
    if (user.role === 'ADMIN' || user.role === 'PRO') return true;

    // Check actual balance from CreditLedger
    const lastLedger = await this.prisma.creditLedger.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    const balance = lastLedger ? lastLedger.balance : 0;

    if (balance <= 0) throw new ForbiddenException('Insufficient credits. Purchase more to continue.');

    return true;
  }
}
