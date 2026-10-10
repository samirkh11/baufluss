import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

const ALLOWED_LOGO_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];

@ApiTags('companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/me')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  findOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.companiesService.findOwn(user.companyId);
  }

  @Patch()
  updateOwn(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.updateOwn(user.companyId, dto);
  }

  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/logos',
        filename: (_req, file, callback) => {
          const extension = extname(file.originalname).toLowerCase();
          callback(null, `${randomUUID()}${extension}`);
        },
      }),
      fileFilter: (_req, file, callback) => {
        const extension = extname(file.originalname).toLowerCase();
        if (!ALLOWED_LOGO_EXTENSIONS.includes(extension)) {
          callback(new BadRequestException('Nicht unterstütztes Bildformat.'), false);
          return;
        }
        callback(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  uploadLogo(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Keine Datei empfangen.');
    }
    return this.companiesService.setLogo(user.companyId, `/uploads/logos/${file.filename}`);
  }
}
