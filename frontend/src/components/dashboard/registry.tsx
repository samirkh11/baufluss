import { ComponentType } from 'react';
import { DashboardItem } from '../../api/dashboard';
import { ProjectsWidget, ReportsWidget, TimerWidget, WeekHoursWidget } from './generalWidgets';
import {
  DunningWidget,
  IncomingWidget,
  LiquidityWidget,
  OpenItemsWidget,
  QuotesWidget,
  TimeApprovalsWidget,
  UnbilledWidget,
} from './officeWidgets';

export interface WidgetDefinition {
  id: string; // stored in the layout; never rename
  title: string;
  officeOnly: boolean;
  component: ComponentType;
  // default size in grid units (12 columns, 1 row = 60 px)
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

// Registry of all dashboard widgets. To add one: write the component, register it here.
export const WIDGETS: WidgetDefinition[] = [
  { id: 'timer', title: 'Stoppuhr', officeOnly: false, component: TimerWidget, w: 4, h: 5, minW: 3, minH: 4 },
  { id: 'week-hours', title: 'Meine Stunden', officeOnly: false, component: WeekHoursWidget, w: 2, h: 3, minW: 2, minH: 2 },
  { id: 'projects', title: 'Projekte', officeOnly: false, component: ProjectsWidget, w: 6, h: 6, minW: 3, minH: 3 },
  { id: 'reports', title: 'Letzte Berichte', officeOnly: false, component: ReportsWidget, w: 4, h: 5, minW: 3, minH: 3 },
  { id: 'open-items', title: 'Offene Posten', officeOnly: true, component: OpenItemsWidget, w: 4, h: 5, minW: 3, minH: 3 },
  { id: 'dunning', title: 'Mahnvorschlag', officeOnly: true, component: DunningWidget, w: 2, h: 3, minW: 2, minH: 2 },
  { id: 'incoming', title: 'Eingangsrechnungen', officeOnly: true, component: IncomingWidget, w: 4, h: 5, minW: 3, minH: 3 },
  { id: 'liquidity', title: 'Liquidität', officeOnly: true, component: LiquidityWidget, w: 4, h: 6, minW: 3, minH: 4 },
  { id: 'quotes', title: 'Angebote', officeOnly: true, component: QuotesWidget, w: 4, h: 4, minW: 3, minH: 3 },
  { id: 'unbilled', title: 'Aufträge nicht abgerechnet', officeOnly: true, component: UnbilledWidget, w: 4, h: 5, minW: 3, minH: 3 },
  { id: 'time-approvals', title: 'Zeiten zur Freigabe', officeOnly: true, component: TimeApprovalsWidget, w: 4, h: 4, minW: 3, minH: 3 },
];

export const widgetsFor = (isOffice: boolean) => WIDGETS.filter((widget) => isOffice || !widget.officeOnly);

// Default arrangements (x, y, w, h in grid units) for users who never customized the dashboard.
const DEFAULT_OFFICE: DashboardItem[] = [
  { id: 'open-items', x: 0, y: 0, w: 4, h: 6 },
  { id: 'liquidity', x: 4, y: 0, w: 4, h: 6 },
  { id: 'incoming', x: 8, y: 0, w: 4, h: 6 },
  { id: 'dunning', x: 0, y: 6, w: 3, h: 4 },
  { id: 'quotes', x: 3, y: 6, w: 5, h: 4 },
  { id: 'unbilled', x: 8, y: 6, w: 4, h: 5 },
  { id: 'projects', x: 0, y: 10, w: 8, h: 6 },
  { id: 'time-approvals', x: 8, y: 11, w: 4, h: 5 },
  { id: 'timer', x: 0, y: 16, w: 4, h: 5 },
];
const DEFAULT_MEMBER: DashboardItem[] = [
  { id: 'timer', x: 0, y: 0, w: 5, h: 5 },
  { id: 'week-hours', x: 5, y: 0, w: 3, h: 3 },
  { id: 'projects', x: 0, y: 5, w: 7, h: 6 },
  { id: 'reports', x: 7, y: 5, w: 5, h: 6 },
];

export const defaultLayout = (isOffice: boolean): DashboardItem[] => (isOffice ? DEFAULT_OFFICE : DEFAULT_MEMBER).map((item) => ({ ...item }));
