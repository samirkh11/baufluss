import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyRole } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { ApproveTimeEntriesDto, ListTimeEntriesQueryDto, TimePeriodQueryDto } from './dto/time-entry-queries.dto';
import { CreateTimeEntryDto, StartTimerDto, StopTimerDto, UpdateTimeEntryDto } from './dto/time-entry.dto';
import { TimeEntriesService } from './time-entries.service';

// Every employee records and sees their own working time; OWNER/ADMIN see and manage everyone's.
// (The service enforces who sees what, the role guard only protects the office-only routes.)
@ApiTags('time-entries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('time-entries')
export class TimeEntriesController {
  constructor(private readonly timeEntriesService: TimeEntriesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListTimeEntriesQueryDto) {
    return this.timeEntriesService.findAll(user, query);
  }

  // The caller's running stopwatch, or null.
  @Get('running')
  findRunning(@CurrentUser() user: AuthenticatedUser) {
    return this.timeEntriesService.findRunning(user);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser, @Query() query: TimePeriodQueryDto) {
    return this.timeEntriesService.summary(user, query);
  }

  @Get('export')
  @Roles(CompanyRole.OWNER, CompanyRole.ADMIN)
  async exportCsv(@CurrentUser() user: AuthenticatedUser, @Query() query: TimePeriodQueryDto, @Res() res: Response) {
    const csv = await this.timeEntriesService.exportCsv(user, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Zeiten_${query.from.slice(0, 10)}_${query.to.slice(0, 10)}.csv"`);
    res.send(csv);
  }

  @Post('start')
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartTimerDto) {
    return this.timeEntriesService.start(user, dto);
  }

  @Post('approve')
  @Roles(CompanyRole.OWNER, CompanyRole.ADMIN)
  approve(@CurrentUser() user: AuthenticatedUser, @Body() dto: ApproveTimeEntriesDto) {
    return this.timeEntriesService.approve(user, dto);
  }

  @Post('reopen')
  @Roles(CompanyRole.OWNER, CompanyRole.ADMIN)
  reopen(@CurrentUser() user: AuthenticatedUser, @Body() dto: ApproveTimeEntriesDto) {
    return this.timeEntriesService.reopen(user, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTimeEntryDto) {
    return this.timeEntriesService.create(user, dto);
  }

  @Post(':id/stop')
  stop(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: StopTimerDto) {
    return this.timeEntriesService.stop(user, id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateTimeEntryDto) {
    return this.timeEntriesService.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.timeEntriesService.remove(user, id);
  }
}
