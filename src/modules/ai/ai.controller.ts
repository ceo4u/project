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

    // Process image base64 if it has a prefix
    let base64Data = body.image;
    if (base64Data && base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1];
    }

    const listing = await this.aiService.analyzeImage(
      base64Data,
      body.mimeType || 'image/jpeg',
      req.user.id,
      body.basePrice || 199,
      body.textPrompt
    );

    return {
      success: true,
      listing,
      credits_remaining: req.user.credits - 1
    };
  }
}

