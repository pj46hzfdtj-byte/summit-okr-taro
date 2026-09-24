import Taro from '@tarojs/taro';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './locales/zh-CN';
import zhTW from './locales/zh-TW';
import enUS from './locales/en-US';
import jaJP from './locales/ja-JP';
import type { SupportedLocale } from '@/lib/types';

export const SUPPORTED_LOCALES: SupportedLocale[] = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP'];

/** 默认语言：上次选择 → 系统语言探测 → zh-CN */
function getDefaultLocale(): SupportedLocale {
  try {
    const raw = Taro.getStorageSync('summitokr.app');
    if (raw) {
      const parsed = JSON.parse(raw as string);
      if (parsed.state?.locale && SUPPORTED_LOCALES.includes(parsed.state.locale)) {
        return parsed.state.locale;
      }
    }
  } catch {
    // ignore
  }
  let lang = 'zh-CN';
  try {
    lang = process.env.TARO_ENV === 'h5' ? navigator.language : Taro.getSystemInfoSync().language ?? 'zh-CN';
  } catch {
    // ignore
  }
  if (lang.startsWith('zh-TW') || lang.startsWith('zh-Hant')) return 'zh-TW';
  if (lang.startsWith('en')) return 'en-US';
  if (lang.startsWith('ja')) return 'ja-JP';
  return 'zh-CN';
}

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'zh-TW': { translation: zhTW },
    'en-US': { translation: enUS },
    'ja-JP': { translation: jaJP },
  },
  lng: getDefaultLocale(),
  fallbackLng: 'en-US',
  interpolation: { escapeValue: false },
});

export default i18n;
