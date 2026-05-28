import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1';

// Token storage using memory (more secure than localStorage)
let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export const tokenManager = {
  getAccessToken: () => accessToken,
  setAccessToken: (token: string | null) => { accessToken = token; },
  clearTokens: () => { accessToken = null; },
};

// Create axios instance with security defaults
const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  withCredentials: true, // Send cookies (httpOnly refresh token)
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest', // CSRF protection hint
  },
});

// ─── Request Interceptor ─────────────────────────────────────────
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenManager.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor with auto token refresh ─────────────────
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Prevent multiple concurrent refresh requests
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }

      try {
        const newToken = await refreshPromise;
        if (newToken && originalRequest.headers) {
          (originalRequest.headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        }
      } catch {
        // Refresh failed - redirect to login
        tokenManager.clearTokens();
        window.dispatchEvent(new CustomEvent('auth:logout'));
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await axios.post(
      `${BASE_URL}/auth/refresh`,
      {},
      { withCredentials: true }
    );
    const { accessToken: newToken } = response.data.data;
    tokenManager.setAccessToken(newToken);
    return newToken;
  } catch {
    return null;
  }
}

export { apiClient };

// ─── Type-safe API response wrapper ──────────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    requestId: string;
    timestamp: string;
    details?: { field: string; message: string }[];
  };
}
