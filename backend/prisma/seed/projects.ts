// Block 3 test data: projects of the roofing company with team assignments and reports (with photos).
import { PrismaClient, ProjectStatus, ReportType } from '@prisma/client';
import { colorFor, tileSvg, writeSeedImage } from './helpers';

const { PLANNING, IN_PROGRESS, ON_HOLD, COMPLETED } = ProjectStatus;
const { DAILY, PROGRESS, DEFECT, ACCEPTANCE, INCIDENT } = ReportType;

interface SeedReport {
  type: ReportType;
  title: string;
  date: string;
  author: string; // last name of the author
  weather?: string;
  workPerformed?: string;
  issues?: string;
  progressPercent?: number;
  photos: number;
}

interface SeedProject {
  number: string;
  name: string;
  status: ProjectStatus;
  customer: string; // contact number
  site: [string, string, string]; // street, zip, city
  start?: string;
  end?: string;
  description?: string;
  members: string[]; // last names
  reports: SeedReport[];
}

const PROJECTS: SeedProject[] = [
  {
    number: 'P-0001', name: 'Dachsanierung MFH Hirschstraße 14', status: IN_PROGRESS, customer: 'K-1001',
    site: ['Hirschstraße 14', '89073', 'Ulm'], start: '2026-09-14', end: '2026-11-20',
    description: 'Komplette Neueindeckung des Satteldachs (320 m²) inkl. neuer Lattung, Unterspannbahn und Dachrinnen. Mieter bleiben im Haus.',
    members: ['Hoffmann', 'Vogel', 'Yilmaz'],
    reports: [
      { type: DAILY, title: 'Tagesbericht: Gerüst steht, Abdeckung Nordseite', date: '2026-09-15', author: 'Hoffmann', weather: 'sonnig, 19 °C', workPerformed: 'Gerüst abgenommen (Firma Wagner). Alte Eindeckung Nordseite abgetragen, Lattung geprüft.', progressPercent: 10, photos: 2 },
      { type: DAILY, title: 'Tagesbericht: Neue Lattung Nordseite', date: '2026-09-22', author: 'Vogel', weather: 'bewölkt, 14 °C', workPerformed: 'Konterlattung und Lattung Nordseite montiert, Unterspannbahn verlegt.', progressPercent: 35, photos: 3 },
      { type: DEFECT, title: 'Mangel: Sparren im Traufbereich verfault', date: '2026-09-24', author: 'Hoffmann', weather: 'Regen, 12 °C', workPerformed: 'Arbeiten Traufe Ost unterbrochen.', issues: 'Zwei Sparrenfüße im Traufbereich Ost durch Feuchtigkeit geschädigt. Zimmerei hinzuziehen, Nachtragsangebot nötig.', progressPercent: 40, photos: 2 },
      { type: PROGRESS, title: 'Baufortschritt Oktober', date: '2026-10-09', author: 'Schmidt', weather: 'sonnig, 16 °C', workPerformed: 'Nordseite komplett eingedeckt, Südseite zu 50 % abgedeckt. Sparrenreparatur durch Zimmerei Huber erledigt.', progressPercent: 65, photos: 2 },
    ],
  },
  {
    number: 'P-0002', name: 'Neueindeckung EFH Familie Becker', status: PLANNING, customer: 'K-1002',
    site: ['Lindenweg 3', '89231', 'Neu-Ulm'], start: '2026-11-02', end: '2026-11-13',
    description: 'Einfamilienhaus Bj. 1978, Satteldach 140 m², Tonziegel naturrot. Angebot angenommen, Material bestellt.',
    members: ['Bauer', 'Hoffmann'],
    reports: [],
  },
  {
    number: 'P-0003', name: 'Dachrinnen Grundschule Blaustein', status: COMPLETED, customer: 'K-1003',
    site: ['Schulstraße 5', '89134', 'Blaustein'], start: '2026-08-03', end: '2026-08-14',
    description: 'Austausch sämtlicher Dachrinnen und Fallrohre am Hauptgebäude (ca. 85 m).',
    members: ['Vogel', 'Yilmaz', 'Bauer'],
    reports: [
      { type: DAILY, title: 'Tagesbericht: Rinnenmontage Westseite', date: '2026-08-05', author: 'Yilmaz', weather: 'sonnig, 27 °C', workPerformed: 'Alte Rinnen West demontiert, neue Zink-Halbrundrinnen montiert (30 m).', progressPercent: 35, photos: 2 },
      { type: INCIDENT, title: 'Vorkommnis: Gerüstteil beschädigt', date: '2026-08-07', author: 'Vogel', weather: 'wolkig, 24 °C', issues: 'Beim Abladen wurde ein Gerüstgeländer verbogen. Niemand verletzt. Gerüstbauer informiert, Austausch erfolgt.', photos: 1 },
      { type: ACCEPTANCE, title: 'Abnahmeprotokoll Dachrinnen', date: '2026-08-14', author: 'Schmidt', weather: 'sonnig, 25 °C', workPerformed: 'Gemeinsame Begehung mit Hausmeister und Bauamt. Keine Beanstandungen.', progressPercent: 100, photos: 2 },
    ],
  },
  {
    number: 'P-0004', name: 'Dachfenster Halle Zimmerei Huber', status: ON_HOLD, customer: 'K-1004',
    site: ['Holzgasse 2', '89264', 'Weißenhorn'], start: '2026-10-19',
    description: 'Einbau von 6 Dachfenstern in Werkhalle. Pausiert, bis die Fenster geliefert werden (Lieferzeit 4 Wochen).',
    members: ['Yilmaz'],
    reports: [],
  },
  {
    number: 'P-0005', name: 'Flachdachreparatur Garagen Wohnbau Ulm', status: COMPLETED, customer: 'K-1001',
    site: ['Mühlenweg 8', '89079', 'Ulm'], start: '2026-06-08', end: '2026-06-12',
    description: 'Abdichtung Garagenhof, Bitumenbahnen erneuert.',
    members: ['Hoffmann', 'Bauer'],
    reports: [
      { type: ACCEPTANCE, title: 'Abnahme Flachdachreparatur', date: '2026-06-12', author: 'Hoffmann', weather: 'heiter, 22 °C', workPerformed: 'Abnahme durch Hausverwaltung, Mängelfrei.', progressPercent: 100, photos: 1 },
    ],
  },
];

export async function seedProjects(
  prisma: PrismaClient,
  companyId: string,
  userIds: Record<string, string>,
  contactIds: Record<string, string>,
): Promise<void> {
  let reportCounter = 0;

  for (const project of PROJECTS) {
    const created = await prisma.project.create({
      data: {
        companyId,
        number: project.number,
        name: project.name,
        status: project.status,
        description: project.description,
        customerId: contactIds[project.customer],
        siteStreet: project.site[0],
        siteZipCode: project.site[1],
        siteCity: project.site[2],
        startDate: project.start ? new Date(project.start) : undefined,
        endDate: project.end ? new Date(project.end) : undefined,
        managerId: userIds['Schmidt'],
        members: { create: project.members.map((lastName) => ({ userId: userIds[lastName] })) },
      },
    });

    for (const report of project.reports) {
      reportCounter++;
      const number = `BE-${String(reportCounter).padStart(4, '0')}`;
      const author = await prisma.user.findUniqueOrThrow({ where: { id: userIds[report.author] } });
      const createdReport = await prisma.report.create({
        data: {
          companyId,
          projectId: created.id,
          number,
          type: report.type,
          title: report.title,
          reportDate: new Date(report.date),
          authorId: author.id,
          authorName: `${author.firstName} ${author.lastName}`,
          weather: report.weather,
          workPerformed: report.workPerformed,
          issues: report.issues,
          progressPercent: report.progressPercent,
        },
      });
      for (let index = 0; index < report.photos; index++) {
        const path = writeSeedImage('reports', `seed-${number.toLowerCase()}-${index + 1}.svg`, tileSvg(`${number} · Foto ${index + 1}`, colorFor(number + index)));
        await prisma.reportPhoto.create({ data: { reportId: createdReport.id, path, sortOrder: index } });
      }
    }
  }

  // The seed assigns numbers directly, so move the sequences past them for newly created records.
  await prisma.numberSequence.updateMany({ where: { companyId, documentType: 'PROJECT' }, data: { nextNumber: PROJECTS.length + 1 } });
  await prisma.numberSequence.updateMany({ where: { companyId, documentType: 'REPORT' }, data: { nextNumber: reportCounter + 1 } });
}
