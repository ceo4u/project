import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';

@Injectable()
export class CreditGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    if (!user) throw new ForbiddenException('User not authenticated');
    if (user.credits <= 0) throw new ForbiddenException('Insufficient credits. Access denied.');
    
    return true;
  }
}
