import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CreditsService {
  constructor(private prisma: PrismaService) {}

  async deductCredit(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { credits: { decrement: 1 } }
      });
      
      await tx.creditLedger.create({
        data: {
          userId,
          amount: 1,
          type: 'DEBIT'
        }
      });
      return user;
    });
  }
}
