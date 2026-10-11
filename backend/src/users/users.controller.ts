import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { deleteUploadedFile, imageUploadOptions, publicUploadPath } from '../common/storage/uploads';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findAll(user.companyId);
  }

  @Post()
  @Roles(CompanyRole.OWNER, CompanyRole.ADMIN)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.usersService.create(user.companyId, dto);
  }

  @Patch(':id')
  @Roles(CompanyRole.OWNER, CompanyRole.ADMIN)
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(CompanyRole.OWNER, CompanyRole.ADMIN)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.remove(user, id);
  }

  // Profile picture: managed by OWNER/ADMIN for anyone, or by a user for themselves.
  @Post(':id/image')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions('users')))
  async setImage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Keine Datei empfangen.');
    }
    const imagePath = publicUploadPath('users', file.filename);
    if (!this.mayManageImage(user, id)) {
      await deleteUploadedFile(imagePath);
      throw new ForbiddenException();
    }
    return this.usersService.setImage(user.companyId, id, imagePath);
  }

  @Delete(':id/image')
  removeImage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (!this.mayManageImage(user, id)) {
      throw new ForbiddenException();
    }
    return this.usersService.removeImage(user.companyId, id);
  }

  private mayManageImage(user: AuthenticatedUser, targetUserId: string): boolean {
    return user.id === targetUserId || user.role === CompanyRole.OWNER || user.role === CompanyRole.ADMIN;
  }
}
