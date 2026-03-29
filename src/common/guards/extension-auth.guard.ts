import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ExtensionAuthGuard implements CanActivate {
  constructor(private prisma: PrismaService) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    let token = request.headers['x-extension-token'];
    if (!token && request.headers.authorization && request.headers.authorization.startsWith('Bearer ')) {
      token = request.headers.authorization.split(' ')[1];
    }

    if (!token) throw new UnauthorizedException('Missing extension token');

    const session = await this.prisma.extensionSession.findFirst({
      where: { token },
      include: { user: true }
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired extension token');
    }

    const deviceId = request.headers['x-device-id'];
    if (!deviceId) throw new UnauthorizedException('Missing x-device-id header');

    if (!session.deviceId) {
      // First use: Bind the token to this specific hardware profile
      await this.prisma.extensionSession.update({
        where: { id: session.id },
        data: { deviceId }
      });
    } else if (session.deviceId !== deviceId) {
      // Token theft or copying attempt detected
      throw new UnauthorizedException('Unauthorized Device: Token is bound to another hardware profile.');
    }

    // ── HMAC Session Signature Verification ──
    if (!request.url.includes('/validate')) {
      const signature = request.headers['x-session-signature'];
      const timestamp = request.headers['x-session-expires-at'];

      if (!signature || !timestamp) {
        throw new UnauthorizedException('Missing session signature/timestamp for secure request');
      }

      const now = Math.floor(Date.now() / 1000);
      if (now > parseInt(timestamp, 10)) {
        throw new UnauthorizedException('Session signature expired. Please re-authenticate.');
      }

      const crypto = require('crypto');
      const expectedSignature = crypto.createHmac('sha256', process.env.JWT_SECRET || 'ECOM_RTX_SECRET_CORE')
        .update(token + deviceId + timestamp)
        .digest('hex');

      if (signature !== expectedSignature) {
        throw new UnauthorizedException('Invalid session signature. Anti-tampering check failed.');
      }
    }

    request.user = session.user;
    return true;
  }
}
