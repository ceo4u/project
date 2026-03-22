import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { CreditsService } from '../credits/credits.service';
import { PrismaService } from '../../prisma/prisma.service';

const MEESHO_SYSTEM_PROMPT = `You are a Meesho seller growth specialist AI.
Analyze the product and return ONLY this exact JSON — no markdown, no extra text:

{
  "title": "[Color] + [Use Case] + [Product Type] — Hinglish SEO optimized, max 100 chars",
  "category": "Meesho taxonomy category",
  "brand": "Generic",
  "sku": "CAT-COLOR-SIZE-001",
  "attributes": {
    "fabric": "realistic material guess",
    "color": "primary color",
    "pattern": "printed/plain/cartoon/etc",
    "net_quantity": "Pack of 1",
    "product_type": "exact product type"
  },
  "variants": [
    { "variant_name": "Pink", "sku": "SKU-PNK-01", "price": 0 }
  ],
  "pricing": {
    "base_price": <basePrice>,
    "selling_price": <basePrice * 3>,
    "mrp": <basePrice * 4>,
    "defective_price": <basePrice * 0.5>
  },
  "shipping": {
    "weight": "350g",
    "shipping_category": "Standard — under 500g = Rs.65 flat"
  },
  "description": {
    "bullets": [
      "✔ Premium Quality Material",
      "✔ Lightweight & Durable",
      "✔ Ideal for School / Travel",
      "✔ Attractive Printed Design",
      "✔ Spacious Storage Compartment"
    ],
    "full": "2-3 short paragraphs"
  },
  "seo": {
    "keywords": ["10 to 15 strong Hindi+English buyer intent keywords"],
    "tags": ["short", "tags", "here"]
  },
  "combo": {
    "is_combo": false,
    "items": []
  }
}

RULES:
- If multiple products visible → is_combo: true, list items
- selling_price = base_price × 2.5 to 4 (use 3x as default)
- mrp = selling_price × 1.5 (round to nearest 9)
- defective_price = base_price × 0.5
- weight: bags 300-500g, clothing 200-400g, jewelry 50-150g
- Never hallucinate specs. Be practical and sellable.`;

function validateAndFix(listing: any, basePrice: number) {
  if (!listing.pricing) listing.pricing = {};
  if (!listing.shipping) listing.shipping = {};

  // Fix pricing logic
  if (!listing.pricing.selling_price || listing.pricing.selling_price < basePrice) {
    listing.pricing.selling_price = Math.round(basePrice * 3);
  }
  if (!listing.pricing.mrp || listing.pricing.mrp < listing.pricing.selling_price) {
    listing.pricing.mrp = Math.round(listing.pricing.selling_price * 1.5 / 10) * 10 - 1;
  }
  listing.pricing.defective_price = Math.round(basePrice * 0.5);
  listing.pricing.base_price = basePrice;

  // Fix weight
  const weightNum = parseInt(listing.shipping?.weight);
  if (!weightNum || weightNum < 100 || weightNum > 5000) {
    listing.shipping.weight = "350g";
    listing.shipping.shipping_category = "Standard — under 500g = Rs.65 flat";
  }

  // Fix combo detection
  if (!listing.combo) listing.combo = { is_combo: false, items: [] };

  // Auto-generate SKU if missing
  if (!listing.sku || listing.sku.length < 3) {
    const cat = (listing.category || 'GEN').slice(0, 3).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    listing.sku = `${cat}-${rand}-001`;
  }

  // Ensure bullets exist
  if (!listing.description) listing.description = {};
  if (!listing.description?.bullets?.length) {
    listing.description.bullets = [
      "✔ Premium Quality",
      "✔ Lightweight & Durable",
      "✔ Ideal for Daily Use",
      "✔ Attractive Design",
      "✔ Great Value for Money"
    ];
  }

  return listing;
}

@Injectable()
export class AiService {
  constructor(private creditsService: CreditsService, private prisma: PrismaService) { }

  async analyzeImage(base64Data: string, mimeType: string, userId: string, basePrice: number, textPrompt?: string) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new InternalServerErrorException('Server missing Gemini Key');

    const prompt = MEESHO_SYSTEM_PROMPT
      .replace('<basePrice>', basePrice.toString())
      .replace('<basePrice * 3>', (Math.round(basePrice * 3)).toString())
      .replace('<basePrice * 4>', (Math.round(basePrice * 4)).toString())
      .replace('<basePrice * 0.5>', (Math.max(1, Math.round(basePrice * 0.5))).toString());

    let parts: any[] = [];
    if (base64Data) {
      parts = [
        { inlineData: { mimeType, data: base64Data } },
        { text: prompt + (textPrompt ? `\n\nAdditional user description: ${textPrompt}` : '') }
      ];
    } else if (textPrompt) {
      parts = [{ text: `Product description: ${textPrompt}\n\n${prompt}` }];
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

      const fixedListing = validateAndFix(parsed, basePrice);

      const deducedRes = await this.creditsService.deductCredit(userId);

      await this.prisma.activityLog.create({
        data: {
          action: 'ai_analyze',
          userId: userId,
          metadata: { success: true, basePrice }
        }
      });

      return { listing: fixedListing, credits_remaining: deducedRes.credits };
    } catch (e) {
      console.error('AI Processing Error:', e);
      throw new InternalServerErrorException(`AI Processing Failed: ${e?.message || 'Unknown'}`);
    }
  }
}
