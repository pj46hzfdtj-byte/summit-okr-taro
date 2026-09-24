import Taro from '@tarojs/taro';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import i18n from '@/i18n';
import type { ColorMode, SupportedLocale, ThemeName } from '@/lib/types';

export type AppTheme = Exclude<ThemeName, 'dark'>;

interface AppState {
  theme: AppTheme;
  locale: SupportedLocale;
  compactMode: boolean;
  colorMode: ColorMode;
  isDark: boolean;
  setTheme: (t: ThemeName) => void;
  setColorMode: (m: ColorMode) => void;
  setLocale: (l: SupportedLocale) => void;
  setCompactMode: (enabled: boolean) => void;
  /** 应用启动时同步（持久化还原后不会触发 setter 副作用） */
  applyToRuntime: () => void;
}

const taroStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    const v = Taro.getStorageSync(name);
    return v ? (v as string) : null;
  },
  setItem: (name: string, value: string) => Taro.setStorageSync(name, value),
  removeItem: (name: string) => Taro.removeStorageSync(name),
}));

function systemPrefersDark(): boolean {
  try {
    // H5: matchMedia；小程序: getAppBaseInfo().theme（微信 8.0.16+）
    if (process.env.TARO_ENV === 'h5') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    const info = Taro.getAppBaseInfo();
    return (info as { theme?: string }).theme === 'dark';
  } catch {
    return false;
  }
}

function computeIsDark(colorMode: ColorMode) {
  return colorMode === 'dark' || (colorMode === 'system' && systemPrefersDark());
}

/** H5 下同步 <html> 类名（小程序由页面根节点 class 驱动） */
function applyHtmlClasses(theme: AppTheme, isDark: boolean, compact: boolean) {
  if (process.env.TARO_ENV !== 'h5' || typeof document === 'undefined') return;
  const el = document.documentElement;
  el.classList.remove('theme-blue', 'theme-green', 'theme-purple', 'theme-macos');
  if (theme !== 'light') el.classList.add(`theme-${theme}`);
  el.classList.toggle('dark', isDark);
  el.classList.toggle('compact-mode', compact);
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      locale: 'zh-CN',
      compactMode: false,
      colorMode: 'system',
      isDark: false,

      setTheme: (t) => {
        // 兼容历史 dark 主题：转为浅色配色 + 夜间外观
        if (t === 'dark') {
          set({ theme: 'light', colorMode: 'dark' });
        } else {
          set({ theme: t });
        }
        const dark = computeIsDark(get().colorMode);
        set({ isDark: dark });
        applyHtmlClasses(get().theme, dark, get().compactMode);
      },

      setColorMode: (m) => {
        const dark = computeIsDark(m);
        set({ colorMode: m, isDark: dark });
        applyHtmlClasses(get().theme, dark, get().compactMode);
      },

      setLocale: (l) => {
        set({ locale: l });
        i18n.changeLanguage(l);
      },

      setCompactMode: (enabled) => {
        set({ compactMode: enabled });
        applyHtmlClasses(get().theme, get().isDark, enabled);
      },

      applyToRuntime: () => {
        const s = get();
        const dark = computeIsDark(s.colorMode);
        set({ isDark: dark });
        applyHtmlClasses(s.theme, dark, s.compactMode);
        i18n.changeLanguage(s.locale);
      },
    }),
    {
      name: 'summitokr.app',
      storage: taroStorage,
      partialize: (s) => ({
        theme: s.theme,
        locale: s.locale,
        compactMode: s.compactMode,
        colorMode: s.colorMode,
      }),
    },
  ),
);
