import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { CreditsService } from '../credits/credits.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AiService {
  constructor(private creditsService: CreditsService, private prisma: PrismaService) {}

  async analyzeImage(imageBuffer: Buffer, mimeType: string, userId: string) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new InternalServerErrorException('Server missing Gemini Key');

    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: imageBuffer.toString('base64') } },
            { text: "Analyze this product image and return structured JSON: product_title, category, color, target_audience, key_features (list), keywords (list). DO NOT wrap in markdown." }
          ]
        }]
      })
    });

    const data = await response.json();
    if (data.error) throw new InternalServerErrorException(data.error.message);

    try {
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        
        await this.creditsService.deductCredit(userId);
        
        await this.prisma.activityLog.create({
          data: {
            eventType: 'ai_analyze',
            userId: userId,
            metadata: { success: true }
          }
        });
        
        return parsed;
    } catch (e) {
      throw new InternalServerErrorException('Failed to parse Gemini output');
    }
  }
}
