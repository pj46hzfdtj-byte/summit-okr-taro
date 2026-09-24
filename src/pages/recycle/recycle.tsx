import { useCallback, useState } from 'react';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { View, Text } from '@tarojs/components';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { recycleApi } from '@/lib/api';
import type { RecycleItem, RecycleEntityType } from '@/lib/types';
import { useAppStore } from '@/stores/app';
import './recycle.scss';

const TYPE_LABEL_KEY: Record<RecycleEntityType, string> = {
  objective: 'recycle.typeObjective',
  key_result: 'recycle.typeKeyResult',
  task: 'recycle.typeTask',
};

const TYPE_TAG_CLASS: Record<RecycleEntityType, string> = {
  objective: '',
  key_result: ' summit-tag--success',
  task: ' summit-tag--warning',
};

export default function RecyclePage() {
  const { t } = useTranslation();
  const { theme, isDark } = useAppStore();

  const [items, setItems] = useState<RecycleItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await recycleApi.list());
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    load();
  });

  usePullDownRefresh(() => {
    const stop = () => Taro.stopPullDownRefresh();
    load().then(stop, stop);
  });

  const handleRestore = async (item: RecycleItem) => {
    try {
      await recycleApi.restore(item.entityType, item.id);
      Taro.showToast({ title: t('recycle.restoreSuccess'), icon: 'success' });
      await load();
    } catch {
      // http 层已 toast
    }
  };

  const handleDestroy = (item: RecycleItem) => {
    Taro.showModal({
      title: '危险操作',
      content: t('recycle.destroyConfirm', { name: item.title }),
      confirmText: t('recycle.destroy'),
      confirmColor: '#ef4444',
      success: async (res) => {
        if (res.confirm) {
          try {
            await recycleApi.destroy(item.entityType, item.id);
            Taro.showToast({ title: t('recycle.destroySuccess'), icon: 'success' });
            await load();
          } catch {
            // ignore
          }
        }
      },
    });
  };

  const handleEmpty = () => {
    Taro.showModal({
      title: '危险操作',
      content: t('recycle.emptyConfirm'),
      confirmText: t('recycle.empty'),
      confirmColor: '#ef4444',
      success: async (res) => {
        if (res.confirm) {
          try {
            const r = await recycleApi.empty();
            Taro.showToast({ title: t('recycle.emptySuccess', { count: r.count }), icon: 'success' });
            await load();
          } catch {
            // ignore
          }
        }
      },
    });
  };

  return (
    <View className={`summit-page ${isDark ? 'summit-dark' : ''} ${theme !== 'light' ? 'theme-' + theme : ''}`}>
      <View className="recycle-container">
        <View className="recycle-header">
          <Text className="recycle-header__title">{t('recycle.title')}</Text>
          {items.length > 0 && (
            <View className="recycle-header__btn" onClick={handleEmpty}>
              <Text>{t('recycle.empty')}</Text>
            </View>
          )}
        </View>

        <View className="summit-card recycle-hint-card">
          <Text className="recycle-hint-text">💡 {t('recycle.hint')}</Text>
        </View>

        {loading && !items.length ? (
          <View className="recycle-loading">
            <Text>{t('common.loading')}</Text>
          </View>
        ) : !items.length ? (
          <View className="summit-empty">
            <Text className="summit-empty__icon">🗑️</Text>
            <Text>{t('recycle.emptyState')}</Text>
          </View>
        ) : (
          <View className="summit-card">
            {items.map((item) => (
              <View key={item.entityType + ':' + item.id} className="recycle-item">
                <View className="recycle-item__tags">
                  <Text className={`summit-tag${TYPE_TAG_CLASS[item.entityType]}`}>
                    {t(TYPE_LABEL_KEY[item.entityType])}
                  </Text>
                  <Text className="summit-muted recycle-small">
                    {dayjs(item.deletedAt).format('YYYY-MM-DD HH:mm')}
                  </Text>
                </View>
                <Text className="recycle-item__title">{item.title}</Text>
                {item.meta ? <Text className="summit-muted recycle-small recycle-item__meta">{item.meta}</Text> : null}
                <View className="recycle-item__actions">
                  <Text className="recycle-action-btn" onClick={() => handleRestore(item)}>
                    {t('recycle.restore')}
                  </Text>
                  <Text className="recycle-action-btn recycle-action-btn--danger" onClick={() => handleDestroy(item)}>
                    {t('recycle.destroy')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
