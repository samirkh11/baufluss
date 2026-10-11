// Block 10 test data: three weeks of working time of the roofing crew, assigned to the projects.
// Entries up to 30 Sep 2026 are released (APPROVED) by the boss, later ones are still open.
import { PrismaClient, TimeEntryStatus } from '@prisma/client';

interface Row {
  userId: string;
  projectId: string | null;
  date: string;
  startMinute: number | null;
  endMinute: number | null;
  breakMinutes: number;
  durationMinutes: number;
  activity: string;
}

const hm = (hours: number, minutes = 0) => hours * 60 + minutes;

// All Monday-Friday dates between two ISO dates (inclusive).
function weekdays(from: string, to: string): string[] {
  const result: string[] = [];
  for (let date = new Date(from); date <= new Date(to); date = new Date(date.getTime() + 24 * 60 * 60 * 1000)) {
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      result.push(date.toISOString().slice(0, 10));
    }
  }
  return result;
}

const ACTIVITIES_P1 = [
  'Gerüst begleitet, Nordseite abgedeckt',
  'Konterlattung und Lattung Nordseite montiert',
  'Unterspannbahn verlegt',
  'Ziegel eingedeckt',
  'Dachrinne und Fallrohre vorbereitet',
  'Traufe Ost: Sparren freigelegt',
];

export async function seedTimeEntries(prisma: PrismaClient, companyId: string, userIds: Record<string, string>): Promise<void> {
  const projects = await prisma.project.findMany({ where: { companyId }, select: { id: true, number: true } });
  const projectId = (number: string) => projects.find((project) => project.number === number)!.id;
  const rows: Row[] = [];

  // A full working day 07:00-16:00 with one hour break (8 h net); Fridays end at 12:00 (5 h).
  const crewDay = (user: string, project: string | null, date: string, activity: string) => {
    const friday = new Date(date).getUTCDay() === 5;
    rows.push({
      userId: userIds[user],
      projectId: project ? projectId(project) : null,
      date,
      startMinute: hm(7),
      endMinute: friday ? hm(12) : hm(16),
      breakMinutes: friday ? 0 : 60,
      durationMinutes: friday ? 300 : 480,
      activity,
    });
  };
  // A manually entered duration without start/end.
  const manual = (user: string, project: string | null, date: string, minutes: number, activity: string) =>
    rows.push({ userId: userIds[user], projectId: project ? projectId(project) : null, date, startMinute: null, endMinute: null, breakMinutes: 0, durationMinutes: minutes, activity });

  // P-0001 Dachsanierung MFH: three roofers, four weeks
  weekdays('2026-09-14', '2026-10-09').forEach((date, index) => {
    for (const user of ['Hoffmann', 'Vogel', 'Yilmaz']) {
      crewDay(user, 'P-0001', date, ACTIVITIES_P1[(index + user.length) % ACTIVITIES_P1.length]);
    }
  });
  // The boss supervises on Mondays (manual entries), the office clerk works internally.
  weekdays('2026-09-14', '2026-10-09')
    .filter((date) => new Date(date).getUTCDay() === 1)
    .forEach((date) => manual('Schmidt', 'P-0001', date, 120, 'Bauleitung, Aufmaß, Abstimmung mit Hausverwaltung'));
  weekdays('2026-09-28', '2026-10-09').forEach((date) => manual('Keller', null, date, 240, 'Büro: Angebote, Rechnungen, Bestellungen'));

  // P-0003 Dachrinnen Grundschule (August) and P-0005 Flachdach (June)
  weekdays('2026-08-03', '2026-08-14').forEach((date) => {
    for (const user of ['Vogel', 'Yilmaz', 'Bauer']) crewDay(user, 'P-0003', date, 'Dachrinnen demontiert und montiert');
  });
  weekdays('2026-06-08', '2026-06-12').forEach((date) => {
    for (const user of ['Hoffmann', 'Bauer']) crewDay(user, 'P-0005', date, 'Flachdach abgedichtet, Bitumenbahnen verlegt');
  });

  // Preparation of the planned Becker job and internal work
  manual('Bauer', 'P-0002', '2026-10-05', 120, 'Aufmaß und Materialkontrolle');
  manual('Hoffmann', 'P-0002', '2026-10-08', 180, 'Ziegel bestellt, Anlieferung geplant');
  rows.push({ userId: userIds['Bauer'], projectId: null, date: '2026-10-02', startMinute: hm(7), endMinute: hm(11), breakMinutes: 0, durationMinutes: 240, activity: 'Werkstatt: Material sortiert, Fahrzeug gewartet' });

  const approvedUntil = '2026-09-30';
  await prisma.timeEntry.createMany({
    data: rows.map((row) => ({
      ...row,
      companyId,
      date: new Date(row.date),
      ...(row.date <= approvedUntil
        ? { status: TimeEntryStatus.APPROVED, approvedAt: new Date(`${approvedUntil}T18:00:00Z`), approvedById: userIds['Schmidt'] }
        : {}),
    })),
  });
}
