import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { imageUploadOptions, publicUploadPath } from '../common/storage/uploads';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // All reports of the company; filter by project, type, author or free text.
  @Get('reports')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListReportsQueryDto) {
    return this.reportsService.findAll(user.companyId, query);
  }

  @Get('reports/:id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.reportsService.findOne(user.companyId, id);
  }

  @Post('projects/:projectId/reports')
  create(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Body() dto: CreateReportDto) {
    return this.reportsService.create(user, projectId, dto);
  }

  @Patch('reports/:id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateReportDto) {
    return this.reportsService.update(user, id, dto);
  }

  @Delete('reports/:id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.reportsService.remove(user, id);
  }

  @Post('reports/:id/photos')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions('reports')))
  addPhoto(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Keine Datei empfangen.');
    }
    return this.reportsService.addPhoto(user, id, publicUploadPath('reports', file.filename));
  }

  @Delete('reports/:id/photos/:photoId')
  removePhoto(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('photoId') photoId: string) {
    return this.reportsService.removePhoto(user, id, photoId);
  }
}
