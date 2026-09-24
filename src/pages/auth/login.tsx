import { useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import './login.scss';

const TAB_PATHS = [
  '/pages/summary/summary',
  '/pages/goals/goals',
  '/pages/tasks/tasks',
  '/pages/profile/profile',
];

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const isDark = useAppStore((s) => s.isDark);
  const theme = useAppStore((s) => s.theme);
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState('demo@summitokr.com');
  const [password, setPassword] = useState('password123');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (loading) return;
    if (!email || !password) {
      Taro.showToast({ title: t('auth.fillAll'), icon: 'none' });
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      Taro.showToast({ title: t('auth.loginSuccess'), icon: 'success' });
      const raw = router.params?.redirect ? decodeURIComponent(router.params.redirect) : '';
      const target = raw || '/pages/summary/summary';
      const tab = TAB_PATHS.find((p) => target.includes(p));
      if (tab) {
        Taro.switchTab({ url: tab });
      } else {
        Taro.reLaunch({ url: target });
      }
    } catch {
      // http 层已 toast
    } finally {
      setLoading(false);
    }
  }

  function goRegister() {
    Taro.navigateTo({ url: '/pages/auth/register' });
  }

  return (
    <View className={`summit-page auth-page ${isDark ? 'summit-dark' : ''} ${theme !== 'light' ? 'theme-' + theme : ''}`}>
      {/* Aurora 光斑背景 */}
      <View className="blob blob-1" />
      <View className="blob blob-2" />
      <View className="blob blob-3" />
      <View className="blob blob-4" />

      <View className="auth-body">
        {/* 品牌区 */}
        <View className="brand">
          <View className="brand-badge">
            <Text className="brand-glyph">⚑</Text>
          </View>
          <Text className="brand-name">{t('auth.loginTitle')}</Text>
          <Text className="brand-slogan">{t('auth.slogan')}</Text>
        </View>

        {/* 玻璃表单卡片 */}
        <View className="auth-card">
          <View className="field">
            <Text className="field-label">{t('auth.email')}</Text>
            <Input
              className="field-input"
              type="text"
              value={email}
              onInput={(e) => setEmail(e.detail.value)}
              placeholder="请输入邮箱"
            />
          </View>
          <View className="field">
            <Text className="field-label">{t('auth.password')}</Text>
            <View className="field-row">
              <Input
                className="field-input flex-1"
                value={password}
                onInput={(e) => setPassword(e.detail.value)}
                password={!showPwd}
                placeholder={t('auth.passwordRequired')}
                onConfirm={handleLogin}
              />
              <Text className="field-eye" onClick={() => setShowPwd(!showPwd)}>
                {showPwd ? '隐藏' : '显示'}
              </Text>
            </View>
          </View>

          <View className={`auth-btn ${loading ? 'auth-btn--loading' : ''}`} onClick={handleLogin}>
            {loading ? <View className="auth-spinner" /> : <Text className="auth-btn-text">{t('auth.login')}</Text>}
          </View>
        </View>

        <View className="auth-footer">
          <Text className="footer-hint">{t('auth.noAccount')}</Text>
          <Text className="footer-link" onClick={goRegister}>
            {t('auth.registerNow')}
          </Text>
        </View>

        <View className="login-tip">{t('auth.demoAccount')}</View>
      </View>
    </View>
  );
}
