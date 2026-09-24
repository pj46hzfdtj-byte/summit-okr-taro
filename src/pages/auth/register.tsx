import { useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import './register.scss';

export default function RegisterPage() {
  const { t } = useTranslation();
  const isDark = useAppStore((s) => s.isDark);
  const theme = useAppStore((s) => s.theme);
  const register = useAuthStore((s) => s.register);

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  function validate(): string | null {
    if (!email) return '请输入邮箱';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '邮箱格式不正确';
    if (!username) return t('auth.username');
    if (username.length < 3 || username.length > 30) return '用户名长度 3-30 字符';
    if (!password) return t('auth.passwordRequired');
    if (password.length < 6 || password.length > 50) return t('auth.passwordRule');
    if (confirmPassword !== password) return t('auth.passwordMismatch');
    return null;
  }

  async function handleRegister() {
    if (loading) return;
    const err = validate();
    if (err) {
      Taro.showToast({ title: err, icon: 'none' });
      return;
    }
    setLoading(true);
    try {
      await register(email, username, password);
      Taro.showToast({ title: t('auth.registerSuccess'), icon: 'success' });
      Taro.switchTab({ url: '/pages/summary/summary' });
    } catch {
      // http 层已 toast
    } finally {
      setLoading(false);
    }
  }

  function goLogin() {
    Taro.navigateBack();
  }

  return (
    <View className={`summit-page auth-page ${isDark ? 'summit-dark' : ''} ${theme !== 'light' ? 'theme-' + theme : ''}`}>
      <View className="blob blob-1" />
      <View className="blob blob-2" />
      <View className="blob blob-3" />
      <View className="blob blob-4" />

      <View className="auth-body">
        <View className="brand">
          <View className="brand-badge">
            <Text className="brand-glyph">⚑</Text>
          </View>
          <Text className="brand-name">创建账号</Text>
          <Text className="brand-slogan">开始你的 OKR 之旅</Text>
        </View>

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
            <Text className="field-label">{t('auth.username')}</Text>
            <Input
              className="field-input"
              type="text"
              value={username}
              onInput={(e) => setUsername(e.detail.value)}
              placeholder="3-30 字符"
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
                placeholder="6-50 字符"
              />
              <Text className="field-eye" onClick={() => setShowPwd(!showPwd)}>
                {showPwd ? '隐藏' : '显示'}
              </Text>
            </View>
          </View>
          <View className="field">
            <Text className="field-label">{t('auth.confirmPassword')}</Text>
            <Input
              className="field-input"
              value={confirmPassword}
              onInput={(e) => setConfirmPassword(e.detail.value)}
              password={!showPwd}
              placeholder="再次输入密码"
              onConfirm={handleRegister}
            />
          </View>

          <View className={`auth-btn ${loading ? 'auth-btn--loading' : ''}`} onClick={handleRegister}>
            {loading ? <View className="auth-spinner" /> : <Text className="auth-btn-text">{t('auth.register')}</Text>}
          </View>
        </View>

        <View className="auth-footer">
          <Text className="footer-hint">{t('auth.hasAccount')}</Text>
          <Text className="footer-link" onClick={goLogin}>
            {t('auth.loginNow')}
          </Text>
        </View>
      </View>
    </View>
  );
}
