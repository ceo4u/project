import { Controller, Post, UseGuards, UseInterceptors, UploadedFile, Req, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiService } from './ai.service';
import { ExtensionAuthGuard } from '../../common/guards/extension-auth.guard';
import { CreditGuard } from '../../common/guards/credit.guard';

@Controller('ai')
@UseGuards(ExtensionAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('analyze-image')
  @UseGuards(CreditGuard)
  @UseInterceptors(FileInterceptor('image'))
  async analyzeImage(@UploadedFile() file: any, @Req() req: any) {
    if (!file) throw new BadRequestException('Image required');
    return await this.aiService.analyzeImage(file.buffer, file.mimetype, req.user.id);
  }
}
