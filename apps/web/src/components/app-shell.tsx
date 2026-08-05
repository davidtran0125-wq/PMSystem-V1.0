'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import {
  Bell,
  Building2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  ReceiptText,
  ScrollText,
  BadgeCheck,
  Star,
  BarChart3,
  Sparkles,
  CheckSquare,
  Sun,
  Tags,
  X,
} from 'lucide-react';
import { Button, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import type { Notification, Paginated } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  supplierOnly?: boolean;
}

/**
 * Route-level access rules. Navigating to a page the account cannot use would
 * otherwise mount it and fire requests the API rejects, so the guard redirects
 * to the caller's own landing page instead.
 */
const ROUTE_RULES: { prefix: string; permission?: string; supplierOnly?: boolean }[] = [
  { prefix: '/dashboard', permission: 'dashboard:read' },
  { prefix: '/purchase-requests', permission: 'purchase_request:read' },
  { prefix: '/rfqs', permission: 'rfq:write' },
  { prefix: '/purchase-orders', permission: 'purchase_order:read' },
  { prefix: '/approvals', permission: 'purchase_request:review' },
  { prefix: '/contracts', permission: 'contract:read' },
  { prefix: '/certificates', permission: 'certificate:read' },
  { prefix: '/supplier-performance', permission: 'supplier:read' },
  { prefix: '/reports', permission: 'report:read' },
  { prefix: '/ai', permission: 'ai:use' },
  { prefix: '/suppliers', permission: 'supplier:read' },
  { prefix: '/categories', permission: 'category:write' },
  { prefix: '/supplier', supplierOnly: true },
];

function landingPath(isSupplier: boolean, permissions: string[]) {
  if (isSupplier) return '/supplier/rfqs';
  if (permissions.includes('dashboard:read')) return '/dashboard';
  return '/purchase-requests';
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard, permission: 'dashboard:read' },
  { href: '/purchase-requests', label: 'Yêu cầu mua hàng', icon: ClipboardList, permission: 'purchase_request:read' },
  { href: '/approvals', label: 'Chờ tôi duyệt', icon: CheckSquare, permission: 'purchase_request:review' },
  { href: '/rfqs', label: 'RFQ & Báo giá', icon: FileText, permission: 'rfq:write' },
  { href: '/purchase-orders', label: 'Đơn hàng', icon: ReceiptText, permission: 'purchase_order:read' },
  { href: '/suppliers', label: 'Nhà cung cấp', icon: Building2, permission: 'supplier:read' },
  { href: '/contracts', label: 'Hợp đồng', icon: ScrollText, permission: 'contract:read' },
  { href: '/certificates', label: 'Chứng chỉ', icon: BadgeCheck, permission: 'certificate:read' },
  { href: '/supplier-performance', label: 'Đánh giá NCC', icon: Star, permission: 'supplier:read' },
  { href: '/reports', label: 'Báo cáo', icon: BarChart3, permission: 'report:read' },
  { href: '/ai/quotation-reader', label: 'Đọc báo giá PDF', icon: Sparkles, permission: 'ai:use' },
  { href: '/categories', label: 'Danh mục & Form', icon: Tags, permission: 'category:write' },
  { href: '/supplier/rfqs', label: 'Yêu cầu báo giá', icon: FileText, supplierOnly: true },
  { href: '/supplier/quotations', label: 'Báo giá của tôi', icon: Package, supplierOnly: true },
  { href: '/supplier/purchase-orders', label: 'Đơn hàng', icon: ReceiptText, supplierOnly: true },
  { href: '/supplier/profile', label: 'Hồ sơ công ty', icon: Building2, supplierOnly: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, status, loadSession, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (status === 'idle') void loadSession();
  }, [status, loadSession]);

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const isSupplierAccount = Boolean(user?.supplier);

  const rule = ROUTE_RULES.find((r) => pathname.startsWith(r.prefix));
  const routeAllowed =
    !rule ||
    !user ||
    (rule.supplierOnly
      ? isSupplierAccount
      : !isSupplierAccount &&
        (!rule.permission || user.permissions.includes(rule.permission)));

  useEffect(() => {
    if (status !== 'authenticated' || !user || routeAllowed) return;
    router.replace(landingPath(isSupplierAccount, user.permissions));
  }, [status, user, routeAllowed, router, isSupplierAccount]);

  if (status !== 'authenticated' || !user) {
    return (
      <div className="space-y-4 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const isSupplier = isSupplierAccount;
  const items = NAV.filter((item) =>
    isSupplier
      ? item.supplierOnly
      : !item.supplierOnly &&
        (!item.permission || user.permissions.includes(item.permission)),
  );

  return (
    <div className="flex min-h-screen">
      {sidebarOpen ? (
        <button
          aria-label="Đóng menu"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-card transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <Link href={isSupplier ? '/supplier/rfqs' : '/dashboard'} className="font-semibold">
            PMS
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Đóng menu"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="mb-2 px-1">
            <p className="truncate text-sm font-medium">{user.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user.supplier?.companyName ?? user.roles.join(', ')}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={async () => {
              await logout();
              router.replace('/login');
            }}
          >
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Mở menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex flex-1 items-center justify-end gap-2">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          {routeAllowed ? children : <Skeleton className="h-64 w-full" />}
        </main>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Đổi giao diện sáng/tối"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {mounted && resolvedTheme === 'dark' ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Notification> & { unread: number }>(
        '/notifications',
        { params: { pageSize: 10 } },
      );
      return data;
    },
    refetchInterval: 60_000,
  });

  const unread = data?.unread ?? 0;
  // The email copy of each event is stored alongside the in-app one; showing
  // both would duplicate every row in this list.
  const items = (data?.data ?? []).filter((n) => n.channel === 'IN_APP');

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Thông báo"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </Button>

      {open ? (
        <>
          <button
            aria-label="Đóng thông báo"
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="text-sm font-medium">Thông báo</span>
              {unread > 0 ? (
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={async () => {
                    await api.patch('/notifications/read-all');
                    void refetch();
                  }}
                >
                  Đánh dấu đã đọc
                </button>
              ) : null}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Chưa có thông báo
                </p>
              ) : (
                items.map((n) => (
                  <Link
                    key={n.id}
                    href={n.link ?? '#'}
                    onClick={async () => {
                      setOpen(false);
                      if (!n.readAt) {
                        await api.patch(`/notifications/${n.id}/read`);
                        void refetch();
                      }
                    }}
                    className={cn(
                      'block border-b border-border px-4 py-3 last:border-0 hover:bg-accent',
                      !n.readAt && 'bg-accent/50',
                    )}
                  >
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {n.body}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDateTime(n.createdAt)}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
