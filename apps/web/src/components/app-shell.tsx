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
  Boxes,
  ReceiptText,
  ScrollText,
  BadgeCheck,
  Star,
  BarChart3,
  Sparkles,
  CheckSquare,
  Settings,
  Users,
  Sun,
  Tags,
  UserRound,
  X,
} from 'lucide-react';
import { Button, Skeleton } from '@/components/ui';
import { ConfirmButton } from '@/components/confirm-button';
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
  { prefix: '/materials', permission: 'material:read' },
  { prefix: '/categories', permission: 'category:write' },
  { prefix: '/settings', permission: 'dashboard:read' },
  { prefix: '/users', permission: 'user:read' },
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
  { href: '/materials', label: 'Danh mục vật tư', icon: Boxes, permission: 'material:read' },
  { href: '/suppliers', label: 'Nhà cung cấp', icon: Building2, permission: 'supplier:read' },
  { href: '/contracts', label: 'Hợp đồng', icon: ScrollText, permission: 'contract:read' },
  { href: '/certificates', label: 'Chứng chỉ', icon: BadgeCheck, permission: 'certificate:read' },
  { href: '/supplier-performance', label: 'Đánh giá NCC', icon: Star, permission: 'supplier:read' },
  { href: '/reports', label: 'Báo cáo', icon: BarChart3, permission: 'report:read' },
  { href: '/ai/quotation-reader', label: 'Đọc báo giá PDF', icon: Sparkles, permission: 'ai:use' },
  { href: '/categories', label: 'Danh mục & Form', icon: Tags, permission: 'category:write' },
  { href: '/users', label: 'Người dùng', icon: Users, permission: 'user:write' },
  { href: '/settings', label: 'Thiết lập', icon: Settings, permission: 'setting:write' },
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
          // Thanh bên đứng yên, chỉ phần danh sách bên trong cuộn — nội dung
          // chính cuộn độc lập nên logo và tài khoản luôn nhìn thấy.
          'fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-border bg-card transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <Link
            href={isSupplier ? '/supplier/rfqs' : '/dashboard'}
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              P
            </span>
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

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3">
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? // Nền nhạt kèm vạch dọc, dịu hơn khối màu đặc mà vẫn thấy rõ đang ở đâu.
                      'bg-primary/10 text-primary before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-primary dark:text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-card/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/70">
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
            <ProfileMenu
              user={user}
              onLogout={async () => {
                await logout();
                router.replace('/login');
              }}
            />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          {/* Giới hạn bề ngang: bảng nhiều cột vẫn cuộn ngang trong khung riêng,
              còn dòng chữ thì không kéo dài hết màn hình rộng. */}
          <div className="mx-auto w-full max-w-[1400px]">
            {routeAllowed ? children : <Skeleton className="h-64 w-full" />}
          </div>
        </main>
      </div>
    </div>
  );
}

/** Ảnh đại diện chữ cái + menu tài khoản, luôn nằm góc phải trên cùng. */
function ProfileMenu({
  user,
  onLogout,
}: {
  user: { fullName: string; email: string; roles: string[]; supplier?: { companyName: string } | null };
  onLogout: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  const initials = user.fullName
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Tài khoản của tôi"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-accent"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {initials || '?'}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-medium sm:block">
          {user.fullName}
        </span>
      </button>

      {open ? (
        <>
          <button
            aria-label="Đóng menu tài khoản"
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
            <div className="border-b border-border px-4 py-3">
              <p className="truncate text-sm font-medium">{user.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {user.supplier?.companyName ?? user.roles.join(', ')}
              </p>
            </div>
            <Link
              href="/account"
              className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-accent"
              onClick={() => setOpen(false)}
            >
              <UserRound className="h-4 w-4" />
              Tài khoản của tôi
            </Link>
            <div className="border-t border-border p-2">
              <ConfirmButton
                variant="outline"
                size="sm"
                className="w-full"
                confirmLabel="Đăng xuất?"
                confirmActionLabel="Thoát"
                onConfirm={onLogout}
              >
                <LogOut className="h-4 w-4" />
                Đăng xuất
              </ConfirmButton>
            </div>
          </div>
        </>
      ) : null}
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
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold text-white">
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
                    <p className="mt-1 text-xs text-muted-foreground">
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
