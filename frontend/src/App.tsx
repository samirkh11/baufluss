import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppLayout } from './layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterCompanyPage } from './pages/RegisterCompanyPage';
import { AdminLayout } from './admin/AdminLayout';
import { AdminLoginPage } from './admin/AdminLoginPage';
import { PageFallback } from './components/PageFallback';
import { lazyPage } from './utils/lazyPage';

// Pages are split into separate chunks and loaded on first visit; login and the shells stay in the
// main bundle so the first screen renders without an extra round trip.
const DashboardPage = lazyPage(() => import('./pages/DashboardPage'), 'DashboardPage');
const CompanyProfilePage = lazyPage(() => import('./pages/CompanyProfilePage'), 'CompanyProfilePage');
const UsersPage = lazyPage(() => import('./pages/UsersPage'), 'UsersPage');
const ContactsPage = lazyPage(() => import('./pages/ContactsPage'), 'ContactsPage');
const CatalogPage = lazyPage(() => import('./pages/CatalogPage'), 'CatalogPage');
const ProjectsPage = lazyPage(() => import('./pages/ProjectsPage'), 'ProjectsPage');
const ProjectDetailPage = lazyPage(() => import('./pages/ProjectDetailPage'), 'ProjectDetailPage');
const ReportsPage = lazyPage(() => import('./pages/ReportsPage'), 'ReportsPage');
const QuotesPage = lazyPage(() => import('./pages/QuotesPage'), 'QuotesPage');
const OrdersPage = lazyPage(() => import('./pages/OrdersPage'), 'OrdersPage');
const IncomingInvoicesPage = lazyPage(() => import('./pages/IncomingInvoicesPage'), 'IncomingInvoicesPage');
const InvoicesPage = lazyPage(() => import('./pages/InvoicesPage'), 'InvoicesPage');
const TimePage = lazyPage(() => import('./pages/TimePage'), 'TimePage');
const DocumentEditorPage = lazyPage(() => import('./pages/DocumentEditorPage'), 'DocumentEditorPage');

const AdminDashboardPage = lazyPage(() => import('./admin/AdminDashboardPage'), 'AdminDashboardPage');
const AdminCompaniesPage = lazyPage(() => import('./admin/AdminCompaniesPage'), 'AdminCompaniesPage');
const AdminPlansPage = lazyPage(() => import('./admin/AdminPlansPage'), 'AdminPlansPage');
const AdminInvoicesPage = lazyPage(() => import('./admin/AdminInvoicesPage'), 'AdminInvoicesPage');
const AdminLogPage = lazyPage(() => import('./admin/AdminLogPage'), 'AdminLogPage');
const AdminSystemPage = lazyPage(() => import('./admin/AdminSystemPage'), 'AdminSystemPage');

export function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterCompanyPage />} />

        {/* Operator back office: separate login and token, independent of the customer app */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="companies" element={<AdminCompaniesPage />} />
          <Route path="invoices" element={<AdminInvoicesPage />} />
          <Route path="plans" element={<AdminPlansPage />} />
          <Route path="log" element={<AdminLogPage />} />
          <Route path="system" element={<AdminSystemPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/quotes" element={<QuotesPage />} />
            <Route path="/quotes/:id" element={<DocumentEditorPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/:id" element={<DocumentEditorPage />} />
            <Route path="/incoming-invoices" element={<IncomingInvoicesPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/invoices/:id" element={<DocumentEditorPage />} />
            <Route path="/credit-notes/:id" element={<DocumentEditorPage />} />
            <Route path="/time" element={<TimePage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/company" element={<CompanyProfilePage />} />
            <Route path="/users" element={<UsersPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
