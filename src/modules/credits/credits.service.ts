import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CreditsService {
  constructor(private prisma: PrismaService) { }

  async deductCredit(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const lastLedger = await tx.creditLedger.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      const currentBalance = lastLedger ? lastLedger.balance : 0;

      await tx.creditLedger.create({
        data: {
          userId,
          amount: 1,
          balance: currentBalance - 1,
          type: 'DEBIT',
          reason: 'Extension AI Analysis'
        }
      });
      return { id: userId, credits: currentBalance - 1 };
    });
  }
}
