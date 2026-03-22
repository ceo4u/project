import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { CreditsService } from '../credits/credits.service';
import { PrismaService } from '../../prisma/prisma.service';

const MEESHO_LISTING_PROMPT = `You are a Meesho product listing expert for the Indian market.
Analyze this product image and/or description and generate an optimized listing.
Return ONLY valid JSON with this exact structure:
{
  "title": "SEO-optimized product title in Hindi/English mix (max 100 chars)",
  "description": "compelling product description (150-200 words)",
  "category": "Meesho category name",
  "hsn": "6-digit HSN code",
  "gst": 12,
  "sku": "auto-generated SKU",
  "weight": 300,
  "length": 20,
  "breadth": 15,
  "height": 5,
  "pack_of": 1,
  "stock": 100,
  "color": "dominant color",
  "price": <basePrice>,
  "mrp": <basePrice * 4>,
  "defective_price": <basePrice * 0.5>
}`;

@Injectable()
export class AiService {
  constructor(private creditsService: CreditsService, private prisma: PrismaService) { }

  async analyzeImage(base64Data: string, mimeType: string, userId: string, basePrice: number, textPrompt?: string) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new InternalServerErrorException('Server missing Gemini Key');

    const prompt = MEESHO_LISTING_PROMPT
      .replace('<basePrice>', basePrice.toString())
      .replace('<basePrice * 4>', (Math.round(basePrice * 4)).toString())
      .replace('<basePrice * 0.5>', (Math.max(1, Math.round(basePrice * 0.5))).toString());

    let parts: any[] = [];
    if (base64Data) {
      parts = [
        { inlineData: { mimeType, data: base64Data } },
        { text: prompt + (textPrompt ? `\\n\\nAdditional user description: ${textPrompt}` : '') }
      ];
    } else if (textPrompt) {
      parts = [{ text: `Product description: ${textPrompt}\\n\\n${prompt}` }];
    } else {
      throw new InternalServerErrorException('No image or prompt provided');
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    });

    const data = await response.json();
    if (data.error) throw new InternalServerErrorException(data.error.message || 'Gemini API Error');

    try {
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      await this.creditsService.deductCredit(userId);

      await this.prisma.activityLog.create({
        data: {
          action: 'ai_analyze',
          userId: userId,
          metadata: { success: true, basePrice }
        }
      });

      return parsed;
    } catch (e) {
      console.error('AI Processing Error:', e);
      throw new InternalServerErrorException(`AI Processing Failed: ${e?.message || 'Unknown'}`);
    }
  }
}

