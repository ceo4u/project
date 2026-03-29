import { Controller, Post, UseGuards, Body, Req, BadRequestException } from '@nestjs/common';
import { AiService } from './ai.service';
import { ExtensionAuthGuard } from '../../common/guards/extension-auth.guard';
import { CreditGuard } from '../../common/guards/credit.guard';

@Controller('ai')
@UseGuards(ExtensionAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) { }

  @Post('analyze')
  @UseGuards(CreditGuard)
  async analyzeImage(@Body() body: any, @Req() req: any) {
    if (!body.image && !body.textPrompt) {
      throw new BadRequestException('Image or text prompt required');
    }

    let base64Data = body.image;
    if (base64Data && base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1];
    }

    const { listing: fullListing, credits_remaining } = await this.aiService.analyzeImage(
      base64Data,
      body.mimeType || 'image/jpeg',
      req.user.id,
      body.basePrice || 199,
      body.textPrompt,
      body.scannedFields
    );

    // HSN/GST derivation logic
    const deriveHSN = (category: string) => {
      const map: Record<string, string> = {
        'bags': '420292', 'backpack': '420292',
        'clothing': '620000', 'kids': '611120',
        'jewelry': '711719', 'footwear': '640299',
        'toys': '950300', 'home': '630000'
      };
      const key = Object.keys(map).find(k => category?.toLowerCase().includes(k));
      return key ? map[key] : '420292';
    };

    const deriveGST = (category: string) => {
      const gstMap: Record<string, number> = {
        'bags': 12, 'clothing': 5, 'jewelry': 3,
        'footwear': 12, 'toys': 12, 'home': 12
      };
      const key = Object.keys(gstMap).find(k => category?.toLowerCase().includes(k));
      return key ? gstMap[key] : 12;
    };

    // Build description string
    let description = '';
    if (fullListing.description?.bullets && Array.isArray(fullListing.description.bullets)) {
      description = fullListing.description.bullets.join('\n');
      if (fullListing.description.full) {
        description += '\n\n' + fullListing.description.full;
      }
    } else if (typeof fullListing.description === 'string') {
      description = fullListing.description;
    }

    // Return the specific shape expected by the extension popup.js
    return {
      success: true,
      listing: {
        title: fullListing.title,
        description,
        category: fullListing.category,
        hsn: fullListing.hsn || deriveHSN(fullListing.category),
        gst: fullListing.gst || deriveGST(fullListing.category),
        sku: fullListing.sku,
        weight: parseInt(fullListing.shipping?.weight) || 350,
        price: fullListing.pricing?.selling_price,
        mrp: fullListing.pricing?.mrp,
        defective_price: fullListing.pricing?.defective_price,
        length: 20,
        breadth: 15,
        height: 5,
        stock: 100,
        pack_of: fullListing.attributes?.net_quantity?.replace(/\D/g, '') || 1,
        color: fullListing.attributes?.color,
        keywords: fullListing.seo?.keywords || [],
        tags: fullListing.seo?.tags || [],
        brand: fullListing.brand || 'Generic',
        full_listing: fullListing
      },
      credits_remaining
    };
  }
}
