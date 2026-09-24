import { useCallback, useState } from 'react';
import Taro, { useDidShow } from '@tarojs/taro';
import { View, Text, Input, Textarea } from '@tarojs/components';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { feedbackApi, type Feedback } from '@/lib/api';
import { useAppStore } from '@/stores/app';
import './help.scss';

type FeedbackType = 'bug' | 'suggestion' | 'other';

const FEEDBACK_TYPES: { value: FeedbackType; labelKey: string }[] = [
  { value: 'suggestion', labelKey: 'help.types.suggestion' },
  { value: 'bug', labelKey: 'help.types.bug' },
  { value: 'other', labelKey: 'help.types.other' },
];

const TYPE_TAG_CLASS: Record<string, string> = {
  bug: ' summit-tag--danger',
  suggestion: '',
  other: '',
};

export default function HelpPage() {
  const { t } = useTranslation();
  const { theme, isDark } = useAppStore();

  // ============ FAQ 手风琴 ============
  const [activeFaq, setActiveFaq] = useState<number>(0);

  const faqs = Array.from({ length: 8 }, (_, i) => ({
    q: t(`help.faq${i + 1}Q`),
    a: t(`help.faq${i + 1}A`),
  }));

  // ============ 反馈表单 ============
  const [type, setType] = useState<FeedbackType>('suggestion');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<Feedback[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await feedbackApi.list());
    } catch {
      // ignore
    }
  }, []);

  useDidShow(() => {
    loadHistory();
  });

  const handleSubmit = async () => {
    if (content.trim().length < 10) {
      Taro.showToast({ title: t('help.submitEmpty'), icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      await feedbackApi.create({
        type,
        content: content.trim(),
        contact: contact.trim() || undefined,
      });
      Taro.showToast({ title: t('help.submitSuccess'), icon: 'success' });
      setContent('');
      setContact('');
      await loadHistory();
    } catch {
      Taro.showToast({ title: t('common.failed'), icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  const typeLabel = (v: string) => {
    const key = v === 'bug' ? 'help.types.bug' : v === 'suggestion' ? 'help.types.suggestion' : 'help.types.other';
    return t(key);
  };

  return (
    <View className={`summit-page ${isDark ? 'summit-dark' : ''} ${theme !== 'light' ? 'theme-' + theme : ''}`}>
      <View className="help-container">
        <View className="help-header">
          <Text className="help-header__title">{t('help.title')}</Text>
          <Text className="help-header__subtitle">{t('help.subtitle')}</Text>
        </View>

        {/* 关于本项目 */}
        <View className="summit-card">
          <Text className="help-card-title">💡 {t('help.aboutTitle')}</Text>
          <Text className="help-about-intro">{t('help.aboutIntro')}</Text>
          <View className="help-stats">
            <View className="help-stat">
              <Text className="help-stat__num">10+</Text>
              <Text className="help-stat__label">{t('help.statModules')}</Text>
            </View>
            <View className="help-stat">
              <Text className="help-stat__num">50+</Text>
              <Text className="help-stat__label">{t('help.statApis')}</Text>
            </View>
            <View className="help-stat">
              <Text className="help-stat__num">4</Text>
              <Text className="help-stat__label">{t('help.statLanguages')}</Text>
            </View>
            <View className="help-stat">
              <Text className="help-stat__num">AI</Text>
              <Text className="help-stat__label">{t('help.statAI')}</Text>
            </View>
          </View>
          <View className="help-flow">
            {[1, 2, 3, 4, 5].map((i) => (
              <View key={i} className="help-flow__group">
                <Text className="help-flow__step">{t(`help.flow${i}`)}</Text>
                {i < 5 && <Text className="help-flow__arrow">→</Text>}
              </View>
            ))}
          </View>
        </View>

        {/* 快速上手 */}
        <View className="summit-card">
          <Text className="help-card-title">🚀 {t('help.quickStart')}</Text>
          {Array.from({ length: 8 }, (_, i) => (
            <View key={i} className="help-qs-item">
              <Text className="help-qs-num">{i + 1}</Text>
              <Text className="help-qs-text">{t(`help.qs${i + 1}`)}</Text>
            </View>
          ))}
        </View>

        {/* 功能总览 */}
        <View className="summit-card">
          <Text className="help-card-title">🧩 {t('help.features')}</Text>
          {Array.from({ length: 10 }, (_, i) => {
            const n = i + 1;
            return (
              <View key={n} className="help-feature-item">
                <Text className="help-feature-name">{t(`help.f${n}.name`)}</Text>
                <Text className="help-feature-desc">{t(`help.f${n}.desc`)}</Text>
              </View>
            );
          })}
        </View>

        {/* 常见问题（手风琴） */}
        <View className="summit-card">
          <Text className="help-card-title">❓ {t('help.faq')}</Text>
          {faqs.map((faq, i) => (
            <View key={i} className="help-faq-item">
              <View
                className="help-faq-q"
                onClick={() => setActiveFaq(activeFaq === i ? -1 : i)}
              >
                <Text className="help-faq-q__text">{faq.q}</Text>
                <Text className={`help-faq-q__arrow${activeFaq === i ? ' help-faq-q__arrow--open' : ''}`}>⌄</Text>
              </View>
              {activeFaq === i && <Text className="help-faq-a">{faq.a}</Text>}
            </View>
          ))}
        </View>

        {/* 意见反馈 */}
        <View className="summit-card">
          <Text className="help-card-title">📮 {t('help.feedback')}</Text>
          <View className="help-form-item">
            <Text className="help-form-label">{t('help.feedbackType')}</Text>
            <View className="help-type-row">
              {FEEDBACK_TYPES.map((opt) => (
                <View
                  key={opt.value}
                  className={`help-type-btn${type === opt.value ? ' help-type-btn--active' : ''}`}
                  onClick={() => setType(opt.value)}
                >
                  <Text>{t(opt.labelKey)}</Text>
                </View>
              ))}
            </View>
          </View>
          <View className="help-form-item">
            <Text className="help-form-label">{t('help.content')}（不少于 10 字）</Text>
            <Textarea
              className="help-form-textarea"
              value={content}
              maxlength={1000}
              placeholder={t('help.contentPlaceholder')}
              onInput={(e) => setContent(e.detail.value)}
            />
          </View>
          <View className="help-form-item">
            <Text className="help-form-label">{t('help.contact')}（可选）</Text>
            <Input
              className="help-form-input"
              value={contact}
              placeholder={t('help.contactPlaceholder')}
              onInput={(e) => setContact(e.detail.value)}
            />
          </View>
          <View className={`summit-btn${submitting ? ' summit-btn--disabled' : ''}`} onClick={handleSubmit}>
            <Text>{submitting ? t('common.loading') : t('help.submit')}</Text>
          </View>
        </View>

        {/* 我的反馈 */}
        {history.length > 0 && (
          <View className="summit-card">
            <Text className="help-card-title">🗂 {t('help.feedbackHistory')} ({history.length})</Text>
            {history.map((item) => (
              <View key={item.id} className="help-fb-item">
                <View className="help-fb-meta">
                  <Text className={`summit-tag${TYPE_TAG_CLASS[item.type] ?? ''}`}>{typeLabel(item.type)}</Text>
                  <Text className={`summit-tag${item.status === 'resolved' ? ' summit-tag--success' : ''}`}>
                    {item.status === 'resolved' ? '已处理' : '待处理'}
                  </Text>
                  <Text className="summit-muted help-fb-time">
                    {dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')}
                  </Text>
                </View>
                <Text className="help-fb-content">{item.content}</Text>
                {item.contact ? (
                  <Text className="summit-muted help-fb-contact">联系方式：{item.contact}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
