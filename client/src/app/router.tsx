import { createBrowserRouter } from 'react-router-dom';
import { RequireStaff } from '@/features/auth/auth';
import { PublicLayout } from '@/layouts/PublicLayout';
import { StaffLayout } from '@/layouts/StaffLayout';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { CheckoutPage } from '@/pages/shop/CheckoutPage';
import { OrderStatusPage } from '@/pages/shop/OrderStatusPage';
import { ShopPage } from '@/pages/shop/ShopPage';
import { AccountPage } from '@/pages/staff/AccountPage';
import { AuditPage } from '@/pages/staff/AuditPage';
import { DashboardPage } from '@/pages/staff/DashboardPage';
import { LoginPage } from '@/pages/staff/LoginPage';
import { OrdersPage } from '@/pages/staff/OrdersPage';
import { PosPage } from '@/pages/staff/PosPage';
import { ProductsPage } from '@/pages/staff/ProductsPage';
import { ReceiptPage } from '@/pages/staff/ReceiptPage';
import { ReceiptsPage } from '@/pages/staff/ReceiptsPage';
import { ReportsPage } from '@/pages/staff/ReportsPage';
import { SettingsPage } from '@/pages/staff/SettingsPage';
import { SetupPage } from '@/pages/staff/SetupPage';
import { StockPage } from '@/pages/staff/StockPage';
import { UsersPage } from '@/pages/staff/UsersPage';

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <ShopPage /> },
      { path: '/checkout', element: <CheckoutPage /> },
      { path: '/orders/:orderNo', element: <OrderStatusPage /> },
    ],
  },
  { path: '/staff/login', element: <LoginPage /> },
  { path: '/staff/setup', element: <SetupPage /> },
  {
    path: '/staff',
    element: (
      <RequireStaff>
        <StaffLayout />
      </RequireStaff>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'pos', element: <PosPage /> },
      { path: 'orders', element: <OrdersPage /> },
      { path: 'receipts', element: <ReceiptsPage /> },
      { path: 'receipts/:receiptNo', element: <ReceiptPage /> },
      { path: 'account', element: <AccountPage /> },
      { path: 'products', element: <RequireStaff roles={['manager']}><ProductsPage /></RequireStaff> },
      { path: 'stock', element: <RequireStaff roles={['manager']}><StockPage /></RequireStaff> },
      { path: 'reports', element: <RequireStaff roles={['manager']}><ReportsPage /></RequireStaff> },
      { path: 'users', element: <RequireStaff roles={['admin']}><UsersPage /></RequireStaff> },
      { path: 'settings', element: <RequireStaff roles={['admin']}><SettingsPage /></RequireStaff> },
      { path: 'audit', element: <RequireStaff roles={['admin']}><AuditPage /></RequireStaff> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
