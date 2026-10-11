import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CompanyRole } from '@prisma/client';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  ListIncomingInvoicesQueryDto,
  PayIncomingInvoiceDto,
  RejectIncomingInvoiceDto,
  UpdateIncomingInvoiceDto,
} from './dto/incoming-invoice.dto';
import { absoluteInvoicePath, MAX_INVOICE_FILE_BYTES } from './incoming-invoice-storage';
import { IncomingInvoicesService } from './incoming-invoices.service';

// Incoming invoices (Eingangsrechnungen) are handled by the office only.
@ApiTags('incoming-invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(CompanyRole.OWNER, CompanyRole.ADMIN)
@Controller('incoming-invoices')
export class IncomingInvoicesController {
  constructor(private readonly service: IncomingInvoicesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListIncomingInvoicesQueryDto) {
    return this.service.findAll(user.companyId, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findOne(user.companyId, id);
  }

  // Upload the original (PDF, image, XRechnung XML); the data is captured with PATCH afterwards.
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_INVOICE_FILE_BYTES } }))
  upload(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Keine Datei empfangen.');
    }
    return this.service.createFromUpload(user, file);
  }

  @Post()
  createManual(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateIncomingInvoiceDto) {
    return this.service.createManual(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateIncomingInvoiceDto) {
    return this.service.update(user.companyId, id, dto);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.approve(user, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RejectIncomingInvoiceDto) {
    return this.service.reject(user.companyId, id, dto.reason);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  reopen(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.reopen(user.companyId, id);
  }

  @Post(':id/pay')
  @HttpCode(200)
  pay(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: PayIncomingInvoiceDto) {
    return this.service.markPaid(user.companyId, id, dto.paidAt);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.remove(user.companyId, id);
  }

  // The original file, streamed through the API so the tenant check applies.
  @Get(':id/file')
  async file(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() res: Response) {
    const file = await this.service.getFile(user.companyId, id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(absoluteInvoicePath(file.path));
  }
}
