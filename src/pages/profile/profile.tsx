import { useState } from 'react';
import Taro, { useDidShow } from '@tarojs/taro';
import { View, Text, Switch, Picker, Textarea } from '@tarojs/components';
import { useTranslation } from 'react-i18next';
import { dataApi } from '@/lib/api';
import type { ColorMode, SupportedLocale } from '@/lib/types';
import { useAppStore, type AppTheme } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import './profile.scss';

const COLOR_MODES: { value: ColorMode; labelKey: string }[] = [
  { value: 'light', labelKey: 'profile.colorModeLight' },
  { value: 'dark', labelKey: 'profile.colorModeDark' },
  { value: 'system', labelKey: 'profile.colorModeSystem' },
];

const THEMES: { value: AppTheme; labelKey: string; swatch: string }[] = [
  { value: 'light', labelKey: 'profile.themeNames.light', swatch: '#f5f6f7' },
  { value: 'blue', labelKey: 'profile.themeNames.blue', swatch: '#1a73e8' },
  { value: 'green', labelKey: 'profile.themeNames.green', swatch: '#2e7d32' },
  { value: 'purple', labelKey: 'profile.themeNames.purple', swatch: '#7c3aed' },
  { value: 'macos', labelKey: 'profile.themeNames.macos', swatch: '#0a84ff' },
];

const LOCALES: SupportedLocale[] = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP'];

export default function ProfilePage() {
  const { t } = useTranslation();
  const { theme, isDark, colorMode, locale, compactMode, setColorMode, setTheme, setLocale, setCompactMode } =
    useAppStore();
  const { user, isAuthenticated, logout } = useAuthStore();

  const [exporting, setExporting] = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importJson, setImportJson] = useState('');

  // Tab 页鉴权守卫：未登录跳转登录页
  useDidShow(() => {
    if (!isAuthenticated) {
      Taro.reLaunch({ url: '/pages/auth/login' });
    }
  });

  if (!isAuthenticated) return null;

  const localeLabels = LOCALES.map((l) => t(`profile.localeNames.${l}`));
  const localeIndex = Math.max(0, LOCALES.indexOf(locale));

  const navItems = [
    { icon: '🔭', label: t('nav.visions'), url: '/pages/visions/visions' },
    { icon: '⏳', label: t('nav.focus'), url: '/pages/focus/focus' },
    { icon: '📝', label: t('nav.reviews'), url: '/pages/reviews/reviews' },
    { icon: '📊', label: t('nav.gantt'), url: '/pages/gantt/gantt' },
    { icon: '🗑️', label: t('nav.recycle'), url: '/pages/recycle/recycle' },
    { icon: '💡', label: t('nav.help'), url: '/pages/help/help' },
  ];

  const goPage = (url: string) => {
    Taro.navigateTo({ url });
  };

  // ============ 数据导出（剪贴板） ============
  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await dataApi.export();
      const text = JSON.stringify(data);
      await Taro.setClipboardData({ data: text });
      Taro.showToast({ title: '已复制到剪贴板', icon: 'success' });
    } catch {
      // http 层已 toast
    } finally {
      setExporting(false);
    }
  };

  // ============ 数据导入（粘贴 JSON + 冲突策略） ============
  const doImport = async (conflict: 'skip' | 'overwrite') => {
    setImporting(true);
    try {
      const data = JSON.parse(importJson);
      const result: any = await dataApi.import(data, conflict);
      Taro.showToast({
        title: `导入成功：目标 ${result?.results?.objectives?.created ?? 0} / 跳过 ${result?.results?.objectives?.skipped ?? 0}`,
        icon: 'none',
      });
      setImportVisible(false);
      setImportJson('');
    } catch (e: any) {
      if (e instanceof SyntaxError || String(e?.message || '').includes('JSON')) {
        Taro.showToast({ title: 'JSON 解析失败', icon: 'none' });
      }
      // 其余错误 http 层已 toast
    } finally {
      setImporting(false);
    }
  };

  const handleImport = () => {
    if (!importJson.trim()) {
      Taro.showToast({ title: '请粘贴 JSON 内容', icon: 'none' });
      return;
    }
    Taro.showModal({
      title: '冲突处理',
      content: '导入时遇到已存在的数据如何处理？',
      confirmText: t('common.overwrite'),
      cancelText: t('common.skip'),
      success: (res) => {
        if (res.confirm) {
          doImport('overwrite');
        } else if (res.cancel) {
          doImport('skip');
        }
      },
    });
  };

  // ============ 退出登录 ============
  const handleLogout = () => {
    Taro.showModal({
      title: t('common.notice'),
      content: t('common.confirmLogout'),
      confirmText: t('common.logout'),
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          logout();
          Taro.reLaunch({ url: '/pages/auth/login' });
        }
      },
    });
  };

  return (
    <View className={`summit-page ${isDark ? 'summit-dark' : ''} ${theme !== 'light' ? 'theme-' + theme : ''}`}>
      <View className="profile-container">
        {/* 用户信息 */}
        <View className="summit-card profile-user">
          <View className="profile-avatar">{(user?.username || 'U').slice(0, 1).toUpperCase()}</View>
          <View className="profile-user__info">
            <Text className="profile-user__name">{user?.username}</Text>
            <Text className="profile-user__email">{user?.email}</Text>
          </View>
        </View>

        {/* 外观 */}
        <View className="summit-card">
          <Text className="profile-card-title">{t('profile.appearance')}</Text>

          <View className="profile-form-item">
            <Text className="profile-form-label">模式</Text>
            <View className="profile-seg">
              {COLOR_MODES.map((m) => (
                <View
                  key={m.value}
                  className={`profile-seg__item${colorMode === m.value ? ' profile-seg__item--active' : ''}`}
                  onClick={() => setColorMode(m.value)}
                >
                  <Text>{t(m.labelKey)}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="profile-form-item">
            <Text className="profile-form-label">{t('profile.theme')}</Text>
            <View className="profile-themes">
              {THEMES.map((th) => (
                <View
                  key={th.value}
                  className={`profile-theme${theme === th.value ? ' profile-theme--active' : ''}`}
                  onClick={() => setTheme(th.value)}
                >
                  <View className="profile-theme__swatch" style={{ background: th.swatch }}>
                    {theme === th.value && <Text className="profile-theme__check">✓</Text>}
                  </View>
                  <Text className="profile-theme__label">{t(th.labelKey)}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="profile-form-item">
            <Text className="profile-form-label">{t('profile.locale')}</Text>
            <Picker
              mode="selector"
              range={localeLabels}
              value={localeIndex}
              onChange={(e) => setLocale(LOCALES[Number(e.detail.value)] ?? 'zh-CN')}
            >
              <View className="profile-picker">
                <Text className="profile-picker__text">{localeLabels[localeIndex]}</Text>
                <Text className="profile-picker__arrow">›</Text>
              </View>
            </Picker>
          </View>

          <View className="profile-form-item profile-form-item--row">
            <Text className="profile-form-label profile-form-label--inline">{t('profile.compactMode')}</Text>
            <Switch checked={compactMode} color="#409eff" onChange={(e) => setCompactMode(!!e.detail.value)} />
          </View>
        </View>

        {/* 功能入口 */}
        <View className="summit-card profile-nav-list">
          {navItems.map((item) => (
            <View key={item.url} className="profile-nav-item" onClick={() => goPage(item.url)}>
              <Text className="profile-nav-item__icon">{item.icon}</Text>
              <Text className="profile-nav-item__text">{item.label}</Text>
              <Text className="profile-nav-item__arrow">›</Text>
            </View>
          ))}
        </View>

        {/* 数据管理 */}
        <View className="summit-card">
          <Text className="profile-card-title">{t('profile.dataManagement')}</Text>
          <View className="profile-data-btns">
            <View className={`summit-btn summit-btn--ghost profile-data-btn${exporting ? ' summit-btn--disabled' : ''}`} onClick={handleExport}>
              <Text>{exporting ? t('common.loading') : t('profile.exportData')}</Text>
            </View>
            <View className="summit-btn profile-data-btn" onClick={() => setImportVisible(true)}>
              <Text>{t('profile.importData')}</Text>
            </View>
          </View>
          <Text className="profile-data-hint">{t('profile.exportHint')}</Text>
        </View>

        {/* 退出登录 */}
        <View className="profile-logout" onClick={handleLogout}>
          <Text>{t('common.logout')}</Text>
        </View>
      </View>

      {/* 导入弹层 */}
      {importVisible && (
        <View className="summit-overlay" onClick={() => setImportVisible(false)}>
          <View className="summit-sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="summit-sheet__title">{t('profile.importData')}</Text>
            <Textarea
              className="profile-import-textarea"
              value={importJson}
              maxlength={-1}
              placeholder="粘贴导出的 JSON 内容"
              onInput={(e) => setImportJson(e.detail.value)}
            />
            <Text className="profile-data-hint">导入时如遇同名数据，可选择跳过或覆盖已存在的记录。</Text>
            <View className="summit-sheet__btns">
              <View className="summit-btn summit-btn--ghost summit-sheet__btn" onClick={() => setImportVisible(false)}>
                <Text>{t('common.cancel')}</Text>
              </View>
              <View className={`summit-btn summit-sheet__btn${importing ? ' summit-btn--disabled' : ''}`} onClick={handleImport}>
                <Text>{importing ? t('common.loading') : t('common.confirm')}</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
