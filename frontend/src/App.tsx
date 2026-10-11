import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppLayout } from './layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterCompanyPage } from './pages/RegisterCompanyPage';
import { DashboardPage } from './pages/DashboardPage';
import { CompanyProfilePage } from './pages/CompanyProfilePage';
import { UsersPage } from './pages/UsersPage';
import { ContactsPage } from './pages/ContactsPage';
import { CatalogPage } from './pages/CatalogPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ReportsPage } from './pages/ReportsPage';
import { QuotesPage } from './pages/QuotesPage';
import { OrdersPage } from './pages/OrdersPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { TimePage } from './pages/TimePage';
import { DocumentEditorPage } from './pages/DocumentEditorPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterCompanyPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/quotes" element={<QuotesPage />} />
          <Route path="/quotes/:id" element={<DocumentEditorPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:id" element={<DocumentEditorPage />} />
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
  );
}
