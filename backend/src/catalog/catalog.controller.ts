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
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { imageUploadOptions, publicUploadPath } from '../common/storage/uploads';
import { CatalogService } from './catalog.service';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto';
import { ListCatalogItemsQueryDto } from './dto/list-catalog-items-query.dto';

@ApiTags('catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('catalog-items')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListCatalogItemsQueryDto) {
    return this.catalogService.findAll(user.companyId, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.catalogService.findOne(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCatalogItemDto) {
    return this.catalogService.create(user.companyId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateCatalogItemDto) {
    return this.catalogService.update(user.companyId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.catalogService.remove(user.companyId, id);
  }

  // Several pictures per item: each request uploads one file and appends it.
  @Post(':id/images')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions('catalog')))
  addImage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Keine Datei empfangen.');
    }
    return this.catalogService.addImage(user.companyId, id, publicUploadPath('catalog', file.filename));
  }

  @Delete(':id/images/:imageId')
  removeImage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('imageId') imageId: string) {
    return this.catalogService.removeImage(user.companyId, id, imageId);
  }
}
