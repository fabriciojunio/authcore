import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { apiClient, tokenManager, ApiResponse } from '../services/api.client';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'user';
  status: string;
  avatarUrl?: string;
  createdAt: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (email: string, password: string, totp?: string) => Promise<void>;
  register: (name: string, email: string, password: string, confirmPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchCurrentUser: () => Promise<void>;
  clearError: () => void;
}

type AuthStore = AuthState & AuthActions;

const isDevelopment = import.meta.env.DEV;

export const useAuthStore = create<AuthStore>()(
  devtools(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email, password, totp) => {
        set({ isLoading: true, error: null });
        try {
          const res = await apiClient.post<ApiResponse<{
            user: User;
            accessToken: string;
            expiresIn: number;
          }>>('/auth/login', { email, password, totp });

          const { user, accessToken } = res.data.data;
          tokenManager.setAccessToken(accessToken);
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (error: unknown) {
          const message = extractErrorMessage(error);
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      register: async (name, email, password, confirmPassword) => {
        set({ isLoading: true, error: null });
        try {
          await apiClient.post('/auth/register', { name, email, password, confirmPassword });
          set({ isLoading: false });
        } catch (error: unknown) {
          const message = extractErrorMessage(error);
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          await apiClient.post('/auth/logout');
        } finally {
          tokenManager.clearTokens();
          set({ user: null, isAuthenticated: false, isLoading: false, error: null });
        }
      },

      fetchCurrentUser: async () => {
        const { isAuthenticated } = get();
        if (!tokenManager.getAccessToken() && !isAuthenticated) return;

        try {
          const res = await apiClient.get<ApiResponse<{ user: User }>>('/auth/me');
          set({ user: res.data.data.user, isAuthenticated: true });
        } catch {
          tokenManager.clearTokens();
          set({ user: null, isAuthenticated: false });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-store',
      enabled: isDevelopment,
    }
  )
);

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { error?: { message?: string } } } }).response;
    return response?.data?.error?.message ?? 'An error occurred';
  }
  return 'An unexpected error occurred';
}

// Listen for forced logout events (token refresh failed)
window.addEventListener('auth:logout', () => {
  tokenManager.clearTokens();
  useAuthStore.setState({ user: null, isAuthenticated: false });
});
