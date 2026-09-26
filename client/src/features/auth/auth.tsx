import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role } from '@shared/schemas';
import type { SessionUser, SetupStatus } from '@shared/types';
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { api, ApiRequestError } from '@/lib/api';
import { Spinner } from '@/components/ui';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<SessionUser>('/api/auth/me');
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

export function useSetupStatus() {
  return useQuery({ queryKey: ['setup'], queryFn: () => api.get<SetupStatus>('/api/auth/setup') });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  });
}

export const can = (user: SessionUser | null | undefined, ...roles: Role[]) => !!user && (user.role === 'admin' || roles.includes(user.role));

/** Renders children only for signed-in staff with one of the roles (admin always passes). */
export function RequireStaff({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const me = useMe();
  const setup = useSetupStatus();
  const location = useLocation();
  if (me.isLoading || setup.isLoading) return <Spinner />;
  if (setup.data?.needsSetup) return <Navigate to="/staff/setup" replace />;
  if (!me.data) return <Navigate to={`/staff/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (roles && !can(me.data, ...roles)) return <Navigate to="/staff" replace />;
  return <>{children}</>;
}
