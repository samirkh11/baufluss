import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CompanyRole, DocumentStatus, DocumentType, DocumentItemKind, Prisma, TimeEntryStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { PrismaService } from '../common/prisma/prisma.service';
import { ApproveTimeEntriesDto, ListTimeEntriesQueryDto, TimePeriodQueryDto } from './dto/time-entry-queries.dto';
import { CreateTimeEntryDto, StartTimerDto, StopTimerDto, UpdateTimeEntryDto } from './dto/time-entry.dto';
import { computeDuration, formatTime, localNow, overlaps, parseTime, TimeEntryError } from './time-utils';

const ENTRY_INCLUDE = {
  project: { select: { id: true, number: true, name: true } },
  user: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.TimeEntryInclude;

type EntryWithRelations = Prisma.TimeEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;

const isOffice = (actor: AuthenticatedUser) => actor.role === CompanyRole.OWNER || actor.role === CompanyRole.ADMIN;
const toDate = (value: string) => new Date(value.slice(0, 10));
const day = (value: string) => value.slice(0, 10);

// API shape: times as "HH:MM" strings and a flag for the running stopwatch.
function toResponse(entry: EntryWithRelations) {
  const { startMinute, endMinute, ...rest } = entry;
  return {
    ...rest,
    startTime: formatTime(startMinute),
    endTime: formatTime(endMinute),
    isRunning: startMinute !== null && endMinute === null,
  };
}

@Injectable()
export class TimeEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- reading

  async findAll(actor: AuthenticatedUser, query: ListTimeEntriesQueryDto) {
    const where = this.visibleWhere(actor, query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.timeEntry.findMany({
        where,
        include: ENTRY_INCLUDE,
        orderBy: [{ date: 'desc' }, { startMinute: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.timeEntry.count({ where }),
    ]);
    return { items: items.map(toResponse), total, page: query.page, pageSize: query.pageSize };
  }

  async findRunning(actor: AuthenticatedUser) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { companyId: actor.companyId, userId: actor.id, startMinute: { not: null }, endMinute: null },
      include: ENTRY_INCLUDE,
    });
    return entry ? toResponse(entry) : null;
  }

  // Hours per project and per employee for a period. OWNER/ADMIN also get costs (internal hourly
  // rate) and the planned hours from the project's orders/quotes; employees only see their own times.
  async summary(actor: AuthenticatedUser, query: TimePeriodQueryDto) {
    const office = isOffice(actor);
    const where = this.visibleWhere(actor, query);
    const groups = await this.prisma.timeEntry.groupBy({
      by: ['projectId', 'userId'],
      where,
      _sum: { durationMinutes: true },
    });

    const userIds = [...new Set(groups.map((group) => group.userId))];
    const projectIds = [...new Set(groups.map((group) => group.projectId).filter((id): id is string => !!id))];
    const [users, projects] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, hourlyRate: true },
      }),
      this.prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, number: true, name: true } }),
    ]);
    const userById = new Map(users.map((user) => [user.id, user]));
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const planned = office ? await this.plannedHours(actor.companyId, projectIds) : new Map<string, number>();

    const costOf = (userId: string, minutes: number) => {
      const rate = userById.get(userId)?.hourlyRate;
      return rate ? Math.round((minutes / 60) * rate.toNumber() * 100) / 100 : 0;
    };
    const publicUser = (userId: string) => {
      const user = userById.get(userId)!;
      return { id: user.id, firstName: user.firstName, lastName: user.lastName };
    };

    const byProjectMap = new Map<string, { projectId: string | null; minutes: number; cost: number; users: Map<string, number> }>();
    const byUserMap = new Map<string, number>();
    for (const group of groups) {
      const minutes = group._sum.durationMinutes ?? 0;
      const key = group.projectId ?? 'internal';
      const entry = byProjectMap.get(key) ?? { projectId: group.projectId, minutes: 0, cost: 0, users: new Map() };
      entry.minutes += minutes;
      entry.cost += costOf(group.userId, minutes);
      entry.users.set(group.userId, (entry.users.get(group.userId) ?? 0) + minutes);
      byProjectMap.set(key, entry);
      byUserMap.set(group.userId, (byUserMap.get(group.userId) ?? 0) + minutes);
    }

    const byProject = [...byProjectMap.values()]
      .map((entry) => ({
        projectId: entry.projectId,
        project: entry.projectId ? (projectById.get(entry.projectId) ?? null) : null,
        minutes: entry.minutes,
        ...(office ? { cost: Math.round(entry.cost * 100) / 100, plannedHours: entry.projectId ? (planned.get(entry.projectId) ?? null) : null } : {}),
        byUser: [...entry.users.entries()]
          .map(([userId, minutes]) => ({ userId, user: publicUser(userId), minutes, ...(office ? { cost: costOf(userId, minutes) } : {}) }))
          .sort((a, b) => b.minutes - a.minutes),
      }))
      .sort((a, b) => b.minutes - a.minutes);

    const byUser = [...byUserMap.entries()]
      .map(([userId, minutes]) => ({ userId, user: publicUser(userId), minutes, ...(office ? { cost: costOf(userId, minutes) } : {}) }))
      .sort((a, b) => b.minutes - a.minutes);

    const totalMinutes = byUser.reduce((sum, entry) => sum + entry.minutes, 0);
    return {
      from: query.from.slice(0, 10),
      to: query.to.slice(0, 10),
      totalMinutes,
      ...(office ? { totalCost: Math.round(byProject.reduce((sum, entry) => sum + (entry.cost ?? 0), 0) * 100) / 100 } : {}),
      byProject,
      byUser,
    };
  }

  // CSV for payroll / accounting (OWNER/ADMIN). Semicolon-separated with BOM so German Excel opens it.
  async exportCsv(actor: AuthenticatedUser, query: TimePeriodQueryDto): Promise<string> {
    const entries = await this.prisma.timeEntry.findMany({
      where: this.visibleWhere(actor, query),
      include: ENTRY_INCLUDE,
      orderBy: [{ date: 'asc' }, { userId: 'asc' }, { startMinute: 'asc' }],
      take: 20000,
    });
    const cell = (value: string | number | null) => {
      const text = value === null ? '' : String(value);
      return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const header = ['Datum', 'Mitarbeiter', 'Projekt-Nr.', 'Projekt', 'Von', 'Bis', 'Pause (Min.)', 'Dauer (Std.)', 'Tätigkeit', 'Notiz', 'Status'];
    const rows = entries.map((entry) =>
      [
        entry.date.toISOString().slice(0, 10).split('-').reverse().join('.'),
        `${entry.user.firstName} ${entry.user.lastName}`,
        entry.project?.number ?? '',
        entry.project?.name ?? 'Intern',
        formatTime(entry.startMinute) ?? '',
        formatTime(entry.endMinute) ?? '',
        entry.breakMinutes,
        (entry.durationMinutes / 60).toFixed(2).replace('.', ','),
        entry.activity ?? '',
        entry.note ?? '',
        entry.status === TimeEntryStatus.APPROVED ? 'freigegeben' : 'offen',
      ]
        .map(cell)
        .join(';'),
    );
    return '﻿' + [header.join(';'), ...rows].join('\r\n') + '\r\n';
  }

  // ---------------------------------------------------------------- writing

  async create(actor: AuthenticatedUser, dto: CreateTimeEntryDto) {
    const userId = await this.resolveTargetUser(actor, dto.userId);
    this.assertNotFuture(dto.date);
    await this.assertProject(actor.companyId, dto.projectId);

    const start = this.minuteOf(dto.startTime);
    const end = this.minuteOf(dto.endTime);
    const breakMinutes = start !== null && end !== null ? (dto.breakMinutes ?? 0) : 0;
    const durationMinutes = this.duration({ startMinute: start, endMinute: end, breakMinutes, durationMinutes: dto.durationMinutes ?? null });

    await this.assertNotLocked(actor, userId, dto.date);
    await this.assertNoOverlap(userId, dto.date, start, end);

    const entry = await this.prisma.timeEntry.create({
      data: {
        companyId: actor.companyId,
        userId,
        projectId: dto.projectId,
        date: toDate(dto.date),
        startMinute: start,
        endMinute: end,
        breakMinutes,
        durationMinutes,
        activity: dto.activity,
        note: dto.note,
      },
      include: ENTRY_INCLUDE,
    });
    return toResponse(entry);
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateTimeEntryDto) {
    const entry = await this.findOwnedOrOffice(actor, id);
    if (entry.startMinute !== null && entry.endMinute === null) {
      throw new BadRequestException('Die Zeiterfassung läuft noch. Bitte zuerst stoppen.');
    }
    this.assertEditable(actor, entry);

    const date = dto.date ? day(dto.date) : entry.date.toISOString().slice(0, 10);
    this.assertNotFuture(date);
    if (dto.projectId) {
      await this.assertProject(actor.companyId, dto.projectId);
    }

    // Merge the changes into the stored values, then validate the result as a whole.
    const start = dto.startTime !== undefined ? this.minuteOf(dto.startTime) : entry.startMinute;
    const end = dto.endTime !== undefined ? this.minuteOf(dto.endTime) : entry.endMinute;
    const rangeGiven = start !== null && end !== null;
    const breakMinutes = rangeGiven ? (dto.breakMinutes ?? entry.breakMinutes) : 0;
    const durationMinutes = this.duration({
      startMinute: start,
      endMinute: end,
      breakMinutes,
      durationMinutes: dto.durationMinutes ?? (rangeGiven ? null : entry.durationMinutes),
    });

    await this.assertNotLocked(actor, entry.userId, date, entry.date.toISOString().slice(0, 10));
    await this.assertNoOverlap(entry.userId, date, start, end, id);

    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: {
        projectId: dto.projectId,
        date: toDate(date),
        startMinute: start,
        endMinute: end,
        breakMinutes,
        durationMinutes,
        activity: dto.activity,
        note: dto.note,
      },
      include: ENTRY_INCLUDE,
    });
    return toResponse(updated);
  }

  async remove(actor: AuthenticatedUser, id: string) {
    const entry = await this.findOwnedOrOffice(actor, id);
    this.assertEditable(actor, entry);
    await this.prisma.timeEntry.delete({ where: { id } });
  }

  // Stopwatch: starts an entry "now" (server time in the company time zone, so the device clock
  // doesn't matter). Only one running entry per employee.
  async start(actor: AuthenticatedUser, dto: StartTimerDto) {
    if (await this.findRunning(actor)) {
      throw new ConflictException('Es läuft bereits eine Zeiterfassung. Bitte zuerst stoppen.');
    }
    await this.assertProject(actor.companyId, dto.projectId);
    const now = localNow();
    await this.assertNotLocked(actor, actor.id, now.date);
    await this.assertNoOverlap(actor.id, now.date, now.minute, null);

    const entry = await this.prisma.timeEntry.create({
      data: {
        companyId: actor.companyId,
        userId: actor.id,
        projectId: dto.projectId,
        date: toDate(now.date),
        startMinute: now.minute,
        activity: dto.activity,
      },
      include: ENTRY_INCLUDE,
    });
    return toResponse(entry);
  }

  async stop(actor: AuthenticatedUser, id: string, dto: StopTimerDto) {
    const entry = await this.findOwnedOrOffice(actor, id);
    if (entry.startMinute === null || entry.endMinute !== null) {
      throw new BadRequestException('Diese Zeiterfassung läuft nicht.');
    }
    const now = localNow();
    const startedToday = entry.date.toISOString().slice(0, 10) === now.date;
    // A stopwatch left running overnight is closed at 23:59 of its day; the employee corrects it.
    let end = startedToday ? now.minute : 1439;
    if (end <= entry.startMinute) {
      end = Math.min(entry.startMinute + 1, 1439);
    }
    const breakMinutes = Math.min(dto.breakMinutes ?? 0, Math.max(0, end - entry.startMinute - 1));
    const durationMinutes = this.duration({ startMinute: entry.startMinute, endMinute: end, breakMinutes, durationMinutes: null });

    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: {
        endMinute: end,
        breakMinutes,
        durationMinutes,
        note: startedToday ? entry.note : [entry.note, 'Stoppuhr über Mitternacht gelaufen – bitte Ende prüfen.'].filter(Boolean).join(' '),
      },
      include: ENTRY_INCLUDE,
    });
    return toResponse(updated);
  }

  // Releases finished entries of a period (e.g. a month) for payroll. Released entries can no
  // longer be changed by the employee; running stopwatches are never released.
  async approve(actor: AuthenticatedUser, dto: ApproveTimeEntriesDto) {
    const result = await this.prisma.timeEntry.updateMany({
      where: this.periodWhere(actor.companyId, dto, { status: TimeEntryStatus.OPEN, NOT: { startMinute: { not: null }, endMinute: null } }),
      data: { status: TimeEntryStatus.APPROVED, approvedAt: new Date(), approvedById: actor.id },
    });
    return { count: result.count };
  }

  async reopen(actor: AuthenticatedUser, dto: ApproveTimeEntriesDto) {
    const result = await this.prisma.timeEntry.updateMany({
      where: this.periodWhere(actor.companyId, dto, { status: TimeEntryStatus.APPROVED }),
      data: { status: TimeEntryStatus.OPEN, approvedAt: null, approvedById: null },
    });
    return { count: result.count };
  }

  // ---------------------------------------------------------------- helpers

  // Employees only ever see their own entries; OWNER/ADMIN may filter by employee.
  private visibleWhere(
    actor: AuthenticatedUser,
    filter: { from?: string; to?: string; userId?: string; projectId?: string; q?: string },
  ): Prisma.TimeEntryWhereInput {
    return {
      companyId: actor.companyId,
      userId: isOffice(actor) ? filter.userId : actor.id,
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.from || filter.to
        ? { date: { ...(filter.from ? { gte: toDate(filter.from) } : {}), ...(filter.to ? { lte: toDate(filter.to) } : {}) } }
        : {}),
      ...(filter.q ? { OR: [{ activity: { contains: filter.q, mode: 'insensitive' } }, { note: { contains: filter.q, mode: 'insensitive' } }] } : {}),
    };
  }

  private periodWhere(companyId: string, dto: ApproveTimeEntriesDto, extra: Prisma.TimeEntryWhereInput): Prisma.TimeEntryWhereInput {
    return { companyId, userId: dto.userId, date: { gte: toDate(dto.from), lte: toDate(dto.to) }, ...extra };
  }

  private async findOwnedOrOffice(actor: AuthenticatedUser, id: string) {
    const entry = await this.prisma.timeEntry.findFirst({ where: { id, companyId: actor.companyId } });
    if (!entry) {
      throw new NotFoundException();
    }
    if (!isOffice(actor) && entry.userId !== actor.id) {
      // Don't reveal that the entry exists.
      throw new NotFoundException();
    }
    return entry;
  }

  private assertEditable(actor: AuthenticatedUser, entry: { status: TimeEntryStatus }) {
    if (entry.status === TimeEntryStatus.APPROVED && !isOffice(actor)) {
      throw new ForbiddenException('Dieser Eintrag ist freigegeben und gesperrt. Bitte das Büro kontaktieren.');
    }
  }

  private async resolveTargetUser(actor: AuthenticatedUser, userId?: string): Promise<string> {
    if (!userId || userId === actor.id) {
      return actor.id;
    }
    if (!isOffice(actor)) {
      throw new ForbiddenException('Zeiten für andere Mitarbeiter darf nur das Büro erfassen.');
    }
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId: actor.companyId } });
    if (!user) {
      throw new BadRequestException('Mitarbeiter nicht gefunden.');
    }
    return user.id;
  }

  private async assertProject(companyId: string, projectId?: string) {
    if (projectId && !(await this.prisma.project.findFirst({ where: { id: projectId, companyId } }))) {
      throw new BadRequestException('Projekt nicht gefunden.');
    }
  }

  // Working time is recorded for the past and today, not in advance.
  private assertNotFuture(date: string) {
    if (day(date) > localNow().date) {
      throw new BadRequestException('Zeiten in der Zukunft können nicht erfasst werden.');
    }
  }

  // Once the office released entries, the employee cannot add or change entries on or before the
  // last released day (otherwise released hours could silently change).
  private async assertNotLocked(actor: AuthenticatedUser, userId: string, date: string, previousDate?: string) {
    if (isOffice(actor)) {
      return;
    }
    const earliest = [day(date), previousDate ? day(previousDate) : undefined].filter((value): value is string => !!value).sort()[0];
    const locked = await this.prisma.timeEntry.count({
      where: { userId, status: TimeEntryStatus.APPROVED, date: { gte: toDate(earliest) } },
    });
    if (locked > 0) {
      throw new ForbiddenException('Dieser Zeitraum ist freigegeben und gesperrt. Bitte das Büro kontaktieren.');
    }
  }

  private async assertNoOverlap(userId: string, date: string, start: number | null, end: number | null, excludeId?: string) {
    if (start === null) {
      return;
    }
    const others = await this.prisma.timeEntry.findMany({
      where: { userId, date: toDate(date), startMinute: { not: null }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { startMinute: true, endMinute: true },
    });
    if (others.some((other) => overlaps({ start, end }, { start: other.startMinute!, end: other.endMinute }))) {
      throw new ConflictException('Die Zeit überschneidet sich mit einem anderen Eintrag.');
    }
  }

  private minuteOf(time: string | null | undefined): number | null {
    if (time === undefined || time === null || time === '') {
      return null;
    }
    const minute = parseTime(time);
    if (minute === null) {
      throw new BadRequestException(`Ungültige Uhrzeit: ${time}`);
    }
    return minute;
  }

  private duration(spec: Parameters<typeof computeDuration>[0]): number {
    try {
      return computeDuration(spec);
    } catch (error) {
      if (error instanceof TimeEntryError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  // Planned hours of a project: positions with unit "h" in its orders; without orders, in its
  // accepted quotes. Optional positions are ignored.
  private async plannedHours(companyId: string, projectIds: string[]): Promise<Map<string, number>> {
    const documents = await this.prisma.document.findMany({
      where: {
        companyId,
        projectId: { in: projectIds },
        OR: [
          { type: DocumentType.ORDER, status: DocumentStatus.SENT },
          { type: DocumentType.QUOTE, status: DocumentStatus.ACCEPTED },
        ],
      },
      select: {
        projectId: true,
        type: true,
        items: { where: { kind: DocumentItemKind.POSITION, isOptional: false, unit: 'h' }, select: { quantity: true } },
      },
    });
    const sums = new Map<string, { order: number; quote: number; hasOrder: boolean }>();
    for (const document of documents) {
      const entry = sums.get(document.projectId) ?? { order: 0, quote: 0, hasOrder: false };
      const hours = document.items.reduce((sum, item) => sum + item.quantity.toNumber(), 0);
      if (document.type === DocumentType.ORDER) {
        entry.order += hours;
        entry.hasOrder = true;
      } else {
        entry.quote += hours;
      }
      sums.set(document.projectId, entry);
    }
    return new Map([...sums.entries()].map(([projectId, entry]) => [projectId, entry.hasOrder ? entry.order : entry.quote]).filter(([, hours]) => (hours as number) > 0) as [string, number][]);
  }
}
