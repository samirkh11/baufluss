import { Body, Controller, Delete, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { DashboardService } from './dashboard.service';
import { SaveDashboardLayoutDto } from './dto/dashboard.dto';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  // The user's own widget arrangement (items: null = never customized, use the role default).
  @Get('layout')
  getLayout(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getLayout(user.id);
  }

  @Put('layout')
  saveLayout(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaveDashboardLayoutDto) {
    return this.service.saveLayout(user.id, dto.items);
  }

  @Delete('layout')
  resetLayout(@CurrentUser() user: AuthenticatedUser) {
    return this.service.resetLayout(user.id);
  }

  // Aggregated figures for the office widgets (money, quotes, orders).
  @Get('office')
  @Roles(CompanyRole.OWNER, CompanyRole.ADMIN)
  office(@CurrentUser() user: AuthenticatedUser) {
    return this.service.office(user.companyId);
  }
}
