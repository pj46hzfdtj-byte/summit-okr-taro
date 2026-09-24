import Taro from '@tarojs/taro';
import type { ApiResponse } from './types';
import { useAuthStore } from '@/stores/auth';

// H5 dev 走 devServer 代理（/api），小程序/RN 需绝对地址
const BASE_URL = process.env.TARO_ENV === 'h5' ? '/api' : 'http://localhost:3001/api';

export interface RequestConfig {
  params?: Record<string, string | number | boolean | undefined>;
  silent?: boolean; // 失败时不弹 toast
}

function buildUrl(url: string, params?: RequestConfig['params']): string {
  const full = `${BASE_URL}${url}`;
  if (!params) return full;
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `${full}${full.includes('?') ? '&' : '?'}${qs}` : full;
}

function showError(msg: string) {
  Taro.showToast({ title: msg, icon: 'none', duration: 2500 });
}

// ============ 401 自动刷新 ============
let isRefreshing = false;
let pendingQueue: Array<(token: string | null) => void> = [];

function forceRelogin() {
  pendingQueue.forEach((cb) => cb(null));
  pendingQueue = [];
  isRefreshing = false;
  useAuthStore.getState().logout();
  const pages = Taro.getCurrentPages();
  const current = pages[pages.length - 1]?.route ?? '';
  if (!current.includes('auth/login')) {
    Taro.reLaunch({ url: '/pages/auth/login' });
  }
}

interface RawResult {
  statusCode: number;
  data: ApiResponse | unknown;
}

async function rawRequest(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
  config?: RequestConfig,
  retried = false,
): Promise<unknown> {
  const token = useAuthStore.getState().accessToken;
  const header: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) header.Authorization = `Bearer ${token}`;

  let res: RawResult;
  try {
    res = (await Taro.request({
      url: buildUrl(url, config?.params),
      method,
      data: body as undefined,
      header,
      timeout: 15000,
    })) as unknown as RawResult;
  } catch (e) {
    if (!config?.silent) showError('网络错误，请检查后端服务');
    throw e;
  }

  // 401：refresh 续期
  if (res.statusCode === 401) {
    if (url.includes('/auth/refresh')) {
      forceRelogin();
      throw new Error('unauthorized');
    }
    const auth = useAuthStore.getState();
    if (!auth.refreshToken) {
      forceRelogin();
      throw new Error('unauthorized');
    }
    if (isRefreshing && !retried) {
      return new Promise((resolve, reject) => {
        pendingQueue.push((newToken) => {
          if (!newToken) {
            reject(new Error('unauthorized'));
            return;
          }
          resolve(rawRequest(method, url, body, config, true));
        });
      });
    }
    isRefreshing = true;
    try {
      const newTokens = await auth.refresh();
      pendingQueue.forEach((cb) => cb(newTokens.accessToken));
      pendingQueue = [];
      return await rawRequest(method, url, body, config, true);
    } catch (e) {
      forceRelogin();
      showError('登录已过期，请重新登录');
      throw e;
    } finally {
      isRefreshing = false;
    }
  }

  const payload = res.data as ApiResponse;
  if (payload && typeof payload === 'object' && 'code' in payload) {
    if (payload.code === 0) return payload.data;
    if (!config?.silent) showError(payload.message || '请求失败');
    throw new Error(payload.message);
  }
  if (res.statusCode >= 400) {
    const msg = (payload as { message?: string })?.message || `请求失败 (${res.statusCode})`;
    if (!config?.silent) showError(msg);
    throw new Error(msg);
  }
  return payload;
}

/** 类型化请求包装：已解包 ApiResponse.data */
export const http = {
  get: <T>(url: string, config?: RequestConfig) => rawRequest('GET', url, undefined, config) as Promise<T>,
  post: <T>(url: string, body?: unknown, config?: RequestConfig) =>
    rawRequest('POST', url, body, config) as Promise<T>,
  put: <T>(url: string, body?: unknown, config?: RequestConfig) => rawRequest('PUT', url, body, config) as Promise<T>,
  patch: <T>(url: string, body?: unknown, config?: RequestConfig) =>
    rawRequest('PATCH', url, body, config) as Promise<T>,
  delete: <T = unknown>(url: string, config?: RequestConfig) =>
    rawRequest('DELETE', url, undefined, config) as Promise<T>,
};

export default http;
