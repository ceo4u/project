import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { CreditsService } from '../credits/credits.service';
import { PrismaService } from '../../prisma/prisma.service';

const MEESHO_SYSTEM_PROMPT = `You are a Meesho seller growth specialist AI.
Analyze the product and return ONLY this exact JSON — no markdown, no extra text:

{
  "title": "[Color] + [Use Case] + [Product Type] — English ONLY SEO optimized, max 100 chars",
  "category": "Meesho taxonomy category",
  "hsn": "numeric HSN code (e.g. 6109, 3004)",
  "gst": "numeric GST percentage only (e.g. 5, 12, 18)",
  "brand": "Generic",
  "sku": "CAT-COLOR-SIZE-001",
  "attributes": {
    "fabric": "Cotton, Polyester, Silk, etc. (standard English terms only)",
    "color": "primary color",
    "pattern": "Solid, Printed, Striped, etc. (standard English terms only)",
    "net_quantity": "1",
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
    "weight": 350,
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
    "full": "2-3 short paragraphs in strictly English ONLY"
  },
  "seo": {
    "keywords": ["10 to 15 strong English ONLY buyer intent keywords"],
    "tags": ["short", "tags", "here"]
  },
  "combo": {
    "is_combo": false,
    "items": []
  }
}

RULES:
- ALL descriptive text MUST be strictly in English ONLY. Do NOT use Hindi or Hinglish.
- Fields like weight, hsn, and gst MUST be purely numerical (e.g. 18, 350, 6109) with no text, letters, or symbols.
- If multiple products visible → is_combo: true, list items
- selling_price = base_price × 2.5 to 4 (use 3x as default)
- mrp = selling_price × 1.5 (round to nearest 9)
- defective_price = base_price × 0.5
- weight: bags 300-500, clothing 200-400, jewelry 50-150. ONLY output the raw number, do not include 'g'.
- For dropdowns like fabric, pattern, use standard English exact values ONLY. Never hallucinate specs. Be practical and sellable.

LANGUAGE RULES (STRICT — MUST FOLLOW):
- title: English only — for Meesho SEO
- description bullets: English only
- description full: English only
- category: English only — must be exact Meesho category name
- color: English only — single color word (Red, Blue, Pink, etc.)
- material/fabric: English only — use standard terms (Cotton, Polyester, Silk, etc.)
- brand: English only
- sku: English alphanumeric only, no spaces

FIELD FORMAT RULES (STRICT — MUST FOLLOW):
- hsn: numbers only, no letters (e.g. 6109, not "HSN6109")
- weight: number only, no unit suffix (e.g. 350, not "350g" or "350 grams")
- gst: number only, no % symbol (e.g. 12, not "12%")
- price, mrp, defective_price: numbers only, no ₹ symbol
- net_quantity: number only (e.g. 1, not "Pack of 1")`;

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

  // Fix weight — strip any non-numeric chars (e.g. "350g" → 350)
  const rawWeight = String(listing.shipping?.weight || '').replace(/[^0-9]/g, '');
  const weightNum = parseInt(rawWeight) || 0;
  if (!weightNum || weightNum < 100 || weightNum > 5000) {
    listing.shipping.weight = 350;
  } else {
    listing.shipping.weight = weightNum;
  }
  listing.shipping.shipping_category = "Standard — under 500g = Rs.65 flat";

  // Fix HSN — must be numeric only
  if (listing.hsn) {
    listing.hsn = String(listing.hsn).replace(/[^0-9]/g, '');
  }

  // Fix GST — must be numeric only
  if (listing.gst) {
    listing.gst = parseInt(String(listing.gst).replace(/[^0-9]/g, '')) || 12;
  }

  // Fix net_quantity — strip text like "Pack of 1" → "1"
  if (listing.attributes?.net_quantity) {
    const nq = String(listing.attributes.net_quantity).replace(/[^0-9]/g, '');
    listing.attributes.net_quantity = nq || '1';
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
