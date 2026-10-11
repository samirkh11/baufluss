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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { LOGO_EXTENSIONS, imageUploadOptions, publicUploadPath } from '../common/storage/uploads';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

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
  @UseInterceptors(FileInterceptor('file', imageUploadOptions('logos', LOGO_EXTENSIONS)))
  uploadLogo(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Keine Datei empfangen.');
    }
    return this.companiesService.setLogo(user.companyId, publicUploadPath('logos', file.filename));
  }
}
