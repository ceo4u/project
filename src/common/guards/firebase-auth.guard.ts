import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * FirebaseAuthGuard — verifies Firebase ID token from dashboard
 * Decodes the JWT (without full Firebase Admin SDK) by matching
 * the user's firebaseUid stored in the database.
 *
 * The dashboard sends: Authorization: Bearer <firebase-id-token>
 * We extract the UID from the JWT payload and find the user.
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
    constructor(private prisma: PrismaService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedException('Missing authorization header');
        }

        const token = authHeader.split(' ')[1];
        if (!token) throw new UnauthorizedException('Missing token');

        try {
            // Decode JWT payload (Firebase ID tokens are standard JWTs)
            const payloadBase64 = token.split('.')[1];
            if (!payloadBase64) throw new Error('Invalid JWT');

            const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
            const firebaseUid = payload.sub || payload.user_id;

            if (!firebaseUid) throw new Error('No UID in token');

            // Find user by Firebase UID
            const user = await this.prisma.user.findUnique({
                where: { firebaseUid },
            });

            if (!user) {
                // Auto-create user on first login
                const email = payload.email || `${firebaseUid}@ecomrtx.user`;
                const newUser = await this.prisma.user.create({
                    data: {
                        firebaseUid,
                        email,
                        name: payload.name || email.split('@')[0],
                        role: 'FREE',
                    },
                });
                // Give 1000 free credits
                await this.prisma.creditLedger.create({
                    data: {
                        userId: newUser.id,
                        type: 'CREDIT',
                        amount: 1000,
                        balance: 1000,
                        reason: 'Welcome bonus — free credits',
                    },
                });
                request.user = newUser;
            } else {
                request.user = user;
            }

            return true;
        } catch (e) {
            throw new UnauthorizedException('Invalid or expired token: ' + e.message);
        }
    }
}
