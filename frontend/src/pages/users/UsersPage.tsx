import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Search, Filter, MoreVertical, UserPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiClient, ApiResponse } from '@/services/api.client';
import { useAuthStore } from '@/store/auth.store';
import { Avatar, Badge, EmptyState, LoadingSpinner } from '@/components/ui';

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'user';
  status: string;
  createdAt: string;
  lastLoginAt?: string;
}

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

const ROLE_BADGE: Record<string, 'blue' | 'green' | 'gray'> = {
  admin: 'blue',
  manager: 'green',
  user: 'gray',
};

const STATUS_BADGE: Record<string, 'green' | 'red' | 'yellow' | 'gray'> = {
  active: 'green',
  inactive: 'gray',
  suspended: 'red',
  pending_verification: 'yellow',
};

export function UsersPage() {
  const user = useAuthStore((s) => s.user);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  if (user?.role === 'user') {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <EmptyState
          icon={Users}
          title="Access Restricted"
          description="You don't have permission to view this page."
        />
      </div>
    );
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['users', page, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      });
      const res = await apiClient.get<ApiResponse<UserItem[]> & { meta: PaginationMeta }>(
        `/users?${params}`
      );
      return res.data;
    },
    placeholderData: (prev) => prev,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const formatDate = (date: string) =>
    new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(date));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="mt-1 text-sm text-gray-500">
            {data?.meta?.total ?? 0} total users
          </p>
        </div>
        <button className="btn-primary self-start">
          <UserPlus className="h-4 w-4" />
          Invite user
        </button>
      </div>

      {/* Search & filters */}
      <div className="card p-4">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or email..."
              className="input pl-9"
            />
          </div>
          <button type="submit" className="btn-secondary">
            <Filter className="h-4 w-4" />
            Search
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-500">
            Failed to load users. Please try again.
          </div>
        ) : !data?.data?.length ? (
          <EmptyState icon={Users} title="No users found" description="Try adjusting your search." />
        ) : (
          <>
            {/* Desktop table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      User
                    </th>
                    <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Role
                    </th>
                    <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Status
                    </th>
                    <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Joined
                    </th>
                    <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Last login
                    </th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data.map((u) => (
                    <tr key={u.id} className="group hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} size="sm" />
                          <div>
                            <p className="font-medium text-gray-900">{u.name}</p>
                            <p className="text-xs text-gray-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge label={u.role} variant={ROLE_BADGE[u.role] ?? 'gray'} />
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          label={u.status.replace('_', ' ')}
                          variant={STATUS_BADGE[u.status] ?? 'gray'}
                        />
                      </td>
                      <td className="px-6 py-4 text-gray-500">{formatDate(u.createdAt)}</td>
                      <td className="px-6 py-4 text-gray-500">
                        {u.lastLoginAt ? formatDate(u.lastLoginAt) : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <button className="rounded-lg p-1.5 text-gray-400 opacity-0 hover:bg-gray-100 hover:text-gray-700 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data.meta && data.meta.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
                <p className="text-sm text-gray-500">
                  Showing {(data.meta.page - 1) * data.meta.limit + 1}–
                  {Math.min(data.meta.page * data.meta.limit, data.meta.total)} of{' '}
                  {data.meta.total} results
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => p - 1)}
                    disabled={!data.meta.hasPrev}
                    className="btn-ghost p-2 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: data.meta.totalPages }, (_, i) => i + 1)
                    .filter((p) => Math.abs(p - data.meta.page) <= 2)
                    .map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`h-8 w-8 rounded-lg text-sm font-medium transition-colors ${
                          p === data.meta.page
                            ? 'bg-primary-600 text-white'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!data.meta.hasNext}
                    className="btn-ghost p-2 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
