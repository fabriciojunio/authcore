import { useQuery } from '@tanstack/react-query';
import { Users, Activity, ShieldCheck, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { StatCard, LoadingSpinner } from '@/components/ui';
import { apiClient, ApiResponse } from '@/services/api.client';

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  securityScore: number;
  uptime: number;
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      // In a real app this would be a stats endpoint
      // For demo, we return mock data
      await new Promise((r) => setTimeout(r, 500));
      return { totalUsers: 248, activeUsers: 183, securityScore: 98, uptime: 99.9 };
    },
    enabled: isAdmin,
  });

  const recentActivity = [
    { id: 1, user: 'Alice Johnson', action: 'Logged in', time: '2 min ago', type: 'login' },
    { id: 2, user: 'Bob Smith', action: 'Updated profile', time: '15 min ago', type: 'update' },
    { id: 3, user: 'Carol White', action: 'Password changed', time: '1 hour ago', type: 'security' },
    { id: 4, user: 'David Lee', action: 'Account created', time: '3 hours ago', type: 'create' },
    { id: 5, user: 'Eve Martinez', action: '2FA enabled', time: '5 hours ago', type: 'security' },
  ];

  const activityColor: Record<string, string> = {
    login: 'bg-blue-100 text-blue-600',
    update: 'bg-purple-100 text-purple-600',
    security: 'bg-green-100 text-green-600',
    create: 'bg-orange-100 text-orange-600',
  };

  const activityIcon: Record<string, React.ComponentType<{ className?: string }>> = {
    login: Activity,
    update: Clock,
    security: ShieldCheck,
    create: CheckCircle,
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting}, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Here's what's happening with your account today.
        </p>
      </div>

      {/* Stats grid (admin only) */}
      {isAdmin && (
        <>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Total Users"
                value={stats?.totalUsers ?? 0}
                icon={Users}
                color="blue"
                trend={{ value: 12, label: 'this month' }}
              />
              <StatCard
                label="Active Today"
                value={stats?.activeUsers ?? 0}
                icon={Activity}
                color="green"
                trend={{ value: 5, label: 'vs yesterday' }}
              />
              <StatCard
                label="Security Score"
                value={`${stats?.securityScore ?? 0}%`}
                icon={ShieldCheck}
                color="purple"
              />
              <StatCard
                label="Uptime SLA"
                value={`${stats?.uptime ?? 0}%`}
                icon={TrendingUp}
                color="orange"
              />
            </div>
          )}
        </>
      )}

      {/* Content grid */}
      <div className={`grid gap-6 ${isAdmin ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        {/* Quick actions */}
        <div className="card p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { label: 'Update your profile', href: '/profile', icon: Users, desc: 'Edit name, phone, avatar' },
              { label: 'Change password', href: '/profile?tab=security', icon: ShieldCheck, desc: 'Keep your account secure' },
              { label: 'Enable 2FA', href: '/profile?tab=security', icon: Activity, desc: 'Add extra protection' },
            ].map((action) => (
              <a
                key={action.label}
                href={action.href}
                className="flex items-center gap-4 rounded-lg p-3 text-sm transition-colors hover:bg-gray-50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50">
                  <action.icon className="h-4 w-4 text-primary-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{action.label}</p>
                  <p className="text-xs text-gray-500">{action.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* My account summary */}
        <div className="card p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Account Summary</h2>
          <div className="space-y-4">
            {[
              { label: 'Full name', value: user?.name },
              { label: 'Email', value: user?.email },
              { label: 'Role', value: user?.role },
              { label: 'Status', value: user?.status },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{item.label}</span>
                <span className="text-sm font-medium capitalize text-gray-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity (admin only) */}
        {isAdmin && (
          <div className="card p-6 lg:col-span-1">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Recent Activity</h2>
            <div className="space-y-4">
              {recentActivity.map((item) => {
                const Icon = activityIcon[item.type] ?? Activity;
                return (
                  <div key={item.id} className="flex items-start gap-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${activityColor[item.type]}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.user}</p>
                      <p className="text-xs text-gray-500">{item.action}</p>
                    </div>
                    <span className="whitespace-nowrap text-xs text-gray-400">{item.time}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
