import { useCallback, useState } from 'react';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { View, Text, Textarea, Input, Switch } from '@tarojs/components';
import { useTranslation } from 'react-i18next';
import { visionApi } from '@/lib/api';
import type { Vision, VisionStatus } from '@/lib/types';
import { useAppStore } from '@/stores/app';
import './visions.scss';

const STATUS_TAG_CLASS: Record<VisionStatus, string> = {
  upcoming: '',
  in_progress: ' summit-tag--warning',
  achieved: ' summit-tag--success',
  expired: ' summit-tag--danger',
};

function ageText(v: Vision): string {
  if (v.startAge != null && v.endAge != null) return `${v.startAge}-${v.endAge} 岁`;
  if (v.startAge != null) return `${v.startAge}+ 岁`;
  if (v.endAge != null) return `~${v.endAge} 岁`;
  return '';
}

function progressColor(p: number): string {
  if (p >= 0.7) return 'var(--success)';
  if (p >= 0.4) return 'var(--warning)';
  return 'var(--danger)';
}

interface VisionForm {
  content: string;
  useAge: boolean;
  startAge: string;
  endAge: string;
}

const EMPTY_FORM: VisionForm = { content: '', useAge: false, startAge: '20', endAge: '30' };

export default function VisionsPage() {
  const { t } = useTranslation();
  const { theme, isDark } = useAppStore();

  const [visions, setVisions] = useState<Vision[]>([]);
  const [loading, setLoading] = useState(false);

  const [dialogVisible, setDialogVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VisionForm>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVisions(await visionApi.list());
    } catch {
      setVisions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    // 对应 vue 的 onMounted + onShow：每次显示（含首次）刷新列表
    load();
  });

  usePullDownRefresh(() => {
    const stop = () => Taro.stopPullDownRefresh();
    load().then(stop, stop);
  });

  const statusLabel = (s: VisionStatus) =>
    ({
      upcoming: t('vision.statusUpcoming'),
      in_progress: t('vision.statusInProgress'),
      achieved: t('vision.statusAchieved'),
      expired: t('vision.statusExpired'),
    })[s] ?? s;

  const objStatusLabel = (s: string) => {
    const key = `objective.status.${s}`;
    const label = t(key);
    return label === key ? s : label;
  };

  const goObjective = (id: string) => {
    Taro.navigateTo({ url: '/pages/goals/objective-detail?id=' + id });
  };

  // ============ 标记达成 / 重置 ============
  const markAchieved = async (v: Vision) => {
    try {
      await visionApi.markAchieved(v.id);
      Taro.showToast({ title: '已标记达成', icon: 'success' });
      await load();
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '操作失败', icon: 'none' });
    }
  };

  const resetStatus = async (v: Vision) => {
    try {
      await visionApi.resetStatus(v.id);
      Taro.showToast({ title: '状态已重置', icon: 'success' });
      await load();
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '操作失败', icon: 'none' });
    }
  };

  // ============ 新建 / 编辑 ============
  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogVisible(true);
  };

  const openEdit = (v: Vision) => {
    setEditingId(v.id);
    setForm({
      content: v.content,
      useAge: v.startAge != null || v.endAge != null,
      startAge: String(v.startAge ?? 20),
      endAge: String(v.endAge ?? 30),
    });
    setDialogVisible(true);
  };

  const handleSave = async () => {
    if (!form.content.trim()) {
      Taro.showToast({ title: '请输入愿景内容', icon: 'none' });
      return;
    }
    const dto: { content: string; startAge?: number; endAge?: number } = {
      content: form.content.trim(),
    };
    if (form.useAge) {
      const start = Number(form.startAge);
      const end = Number(form.endAge);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < 0 || start > 150 || end > 150) {
        Taro.showToast({ title: '年龄需为 0-150 的数字', icon: 'none' });
        return;
      }
      if (end <= start) {
        Taro.showToast({ title: '结束年龄必须大于起始年龄', icon: 'none' });
        return;
      }
      dto.startAge = Math.floor(start);
      dto.endAge = Math.floor(end);
    }
    setSaving(true);
    try {
      if (editingId) {
        await visionApi.update(editingId, dto);
        Taro.showToast({ title: '修改成功', icon: 'success' });
      } else {
        await visionApi.create(dto);
        Taro.showToast({ title: '创建成功', icon: 'success' });
      }
      setDialogVisible(false);
      await load();
    } catch {
      // http 层已 toast
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (v: Vision) => {
    Taro.showModal({
      title: t('vision.deleteConfirmTitle'),
      content: t('vision.deleteConfirm'),
      confirmText: t('common.delete'),
      confirmColor: '#ef4444',
      success: async (res) => {
        if (res.confirm) {
          try {
            await visionApi.remove(v.id);
            Taro.showToast({ title: t('vision.deleted'), icon: 'success' });
            await load();
          } catch {
            // http 层已 toast
          }
        }
      },
    });
  };

  return (
    <View className={`summit-page ${isDark ? 'summit-dark' : ''} ${theme !== 'light' ? 'theme-' + theme : ''}`}>
      <View className="visions-container">
        <View className="visions-header">
          <Text className="visions-header__title">{t('vision.title')}</Text>
          <View className="visions-header__btn" onClick={openCreate}>
            <Text>＋ {t('vision.title')}</Text>
          </View>
        </View>

        {loading && !visions.length ? (
          <View className="visions-loading">
            <Text>{t('common.loading')}</Text>
          </View>
        ) : !visions.length ? (
          <View className="summit-empty">
            <Text className="summit-empty__icon">🔭</Text>
            <Text>{t('vision.empty')}</Text>
            <View className="summit-empty__btn" onClick={openCreate}>
              <Text>{t('common.create')}</Text>
            </View>
          </View>
        ) : (
          visions.map((v) => {
            const pct = Math.round((v.progress ?? 0) * 100);
            return (
              <View key={v.id} className="summit-card">
                <View className="visions-tags">
                  <Text className={`summit-tag${STATUS_TAG_CLASS[v.status]}`}>{statusLabel(v.status)}</Text>
                  {ageText(v) ? <Text className="summit-tag">{ageText(v)}</Text> : null}
                </View>

                <Text className="visions-content">{v.content}</Text>

                {v.objectives?.length ? (
                  <View className="visions-progress-block">
                    <View className="visions-progress-head">
                      <Text className="summit-muted visions-small">{t('vision.linkedObjectives')}</Text>
                      <Text className="visions-progress-pct">{pct}%</Text>
                    </View>
                    <View className="summit-progress">
                      <View
                        className="summit-progress__bar"
                        style={{ width: `${pct}%`, background: progressColor(v.progress ?? 0) }}
                      />
                    </View>
                    {v.objectives.map((obj) => (
                      <View key={obj.id} className="visions-obj-row" onClick={() => goObjective(obj.id)}>
                        <View className="visions-obj-dot" style={{ background: obj.color }} />
                        <Text className="visions-obj-title">{obj.title}</Text>
                        <Text className="summit-tag">{objStatusLabel(obj.status)}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text className="visions-no-obj">{t('vision.noLinkedObjectives')}</Text>
                )}

                <View className="visions-actions">
                  {v.status !== 'achieved' ? (
                    <View className="visions-action visions-action--success" onClick={() => markAchieved(v)}>
                      <Text>{t('vision.markAchieved')}</Text>
                    </View>
                  ) : (
                    <View className="visions-action" onClick={() => resetStatus(v)}>
                      <Text>{t('vision.resetStatus')}</Text>
                    </View>
                  )}
                  <View className="visions-action" onClick={() => openEdit(v)}>
                    <Text>{t('common.edit')}</Text>
                  </View>
                  <View className="visions-action visions-action--danger" onClick={() => handleDelete(v)}>
                    <Text>{t('common.delete')}</Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* 新建/编辑弹层 */}
      {dialogVisible && (
        <View className="summit-overlay" onClick={() => setDialogVisible(false)}>
          <View className="summit-sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="summit-sheet__title">{editingId ? '编辑愿景' : '新建愿景'}</Text>

            <View className="visions-form-item">
              <Text className="visions-form-label">愿景内容 *</Text>
              <Textarea
                className="visions-form-textarea"
                value={form.content}
                maxlength={500}
                placeholder="例如：成为一名技术专家 / 环游世界 / 创办一家公司"
                onInput={(e) => setForm((f) => ({ ...f, content: e.detail.value }))}
              />
            </View>

            <View className="visions-form-item visions-form-item--row">
              <Text className="visions-form-label visions-form-label--inline">年龄段（可选）</Text>
              <Switch
                checked={form.useAge}
                color="#409eff"
                onChange={(e) => setForm((f) => ({ ...f, useAge: e.detail.value }))}
              />
            </View>

            {form.useAge && (
              <View className="visions-age-row">
                <View className="visions-form-item visions-age-item">
                  <Text className="visions-form-label">起始年龄</Text>
                  <Input
                    className="visions-form-input"
                    type="number"
                    value={form.startAge}
                    onInput={(e) => setForm((f) => ({ ...f, startAge: e.detail.value }))}
                  />
                </View>
                <View className="visions-form-item visions-age-item">
                  <Text className="visions-form-label">结束年龄</Text>
                  <Input
                    className="visions-form-input"
                    type="number"
                    value={form.endAge}
                    onInput={(e) => setForm((f) => ({ ...f, endAge: e.detail.value }))}
                  />
                </View>
              </View>
            )}

            <View className="summit-sheet__btns">
              <View className="summit-btn summit-btn--ghost summit-sheet__btn" onClick={() => setDialogVisible(false)}>
                <Text>{t('common.cancel')}</Text>
              </View>
              <View className={`summit-btn summit-sheet__btn${saving ? ' summit-btn--disabled' : ''}`} onClick={handleSave}>
                <Text>{saving ? t('common.loading') : t('common.save')}</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
