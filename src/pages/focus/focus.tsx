import { useCallback, useState } from 'react';
import { View, Text, Input, Picker, Switch } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { focusCycleApi, objectiveApi } from '@/lib/api';
import type { FocusCycle, Objective } from '@/lib/types';
import { useAppStore } from '@/stores/app';
import './focus.scss';

export default function FocusPage() {
  const { t } = useTranslation();
  const isDark = useAppStore((s) => s.isDark);
  const theme = useAppStore((s) => s.theme);

  const [cycle, setCycle] = useState<FocusCycle | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCycle = useCallback(async () => {
    setLoading(true);
    try {
      setCycle(await focusCycleApi.getActive());
    } catch {
      setCycle(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    loadCycle();
  });

  usePullDownRefresh(async () => {
    await loadCycle();
    Taro.stopPullDownRefresh();
  });

  // ============ 派生数据 ============
  const daysRemaining = cycle ? dayjs(cycle.endAt).diff(dayjs(), 'day') : 0;

  const cycleProgress = (() => {
    if (!cycle) return 0;
    const total = dayjs(cycle.endAt).diff(dayjs(cycle.startAt), 'day');
    const elapsed = dayjs().diff(dayjs(cycle.startAt), 'day');
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
  })();

  const score = Math.max(0, Math.min(100, cycle?.cycleScore ?? 0));

  // ============ 权重步进 ============
  const handleWeightChange = async (objectiveId: string, next: number) => {
    if (!cycle) return;
    const cur = cycle.objectives.find((o) => o.objectiveId === objectiveId)?.weight ?? 1;
    const weight = Math.max(1, Math.min(10, next));
    if (weight === cur) return;
    try {
      await focusCycleApi.updateWeight(cycle.id, objectiveId, weight);
      await loadCycle();
      Taro.showToast({ title: '权重已更新', icon: 'success' });
    } catch {
      // ignore
    }
  };

  // ============ 创建周期 ============
  const [createVisible, setCreateVisible] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [availableObjectives, setAvailableObjectives] = useState<Objective[]>([]);
  const [createName, setCreateName] = useState('');
  const [createIds, setCreateIds] = useState<string[]>([]);
  const [createWeights, setCreateWeights] = useState<Record<string, number>>({});
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [createStart, setCreateStart] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [createEnd, setCreateEnd] = useState(() => dayjs().add(3, 'month').format('YYYY-MM-DD'));

  const openCreateDialog = async () => {
    try {
      const res = await objectiveApi.list({ status: 'in_progress', page: 1, pageSize: 200 });
      setAvailableObjectives(res.list);
    } catch {
      setAvailableObjectives([]);
    }
    setCreateName('');
    setCreateIds([]);
    setCreateWeights({});
    setUseCustomTime(false);
    setCreateVisible(true);
  };

  const toggleObjective = (id: string) => {
    if (createIds.includes(id)) {
      setCreateIds(createIds.filter((x) => x !== id));
    } else {
      setCreateIds([...createIds, id]);
      setCreateWeights((prev) => (prev[id] != null ? prev : { ...prev, [id]: 1 }));
    }
  };

  const objectiveTitle = (id: string): string =>
    availableObjectives.find((o) => o.id === id)?.title ?? id;

  const handleCreate = async () => {
    if (!createName.trim() || !createIds.length) {
      Taro.showToast({ title: '请填写名称并选择目标', icon: 'none' });
      return;
    }
    const weights: Record<string, number> = {};
    createIds.forEach((id) => (weights[id] = createWeights[id] ?? 1));
    const dto: Parameters<typeof focusCycleApi.create>[0] = {
      name: createName.trim(),
      objectiveIds: createIds,
      weights,
    };
    if (useCustomTime) {
      if (dayjs(createEnd).valueOf() <= dayjs(createStart).valueOf()) {
        Taro.showToast({ title: '结束时间需晚于开始时间', icon: 'none' });
        return;
      }
      dto.startAt = dayjs(createStart).startOf('day').toISOString();
      dto.endAt = dayjs(createEnd).endOf('day').toISOString();
    }
    setCreateLoading(true);
    try {
      await focusCycleApi.create(dto);
      Taro.showToast({ title: '专注周期创建成功', icon: 'success' });
      setCreateVisible(false);
      await loadCycle();
    } catch {
      // ignore
    } finally {
      setCreateLoading(false);
    }
  };

  // ============ 编辑周期 ============
  const [editVisible, setEditVisible] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  const openEditDialog = () => {
    if (!cycle) return;
    setEditName(cycle.name);
    setEditStart(dayjs(cycle.startAt).format('YYYY-MM-DD'));
    setEditEnd(dayjs(cycle.endAt).format('YYYY-MM-DD'));
    setEditVisible(true);
  };

  const handleUpdate = async () => {
    if (!cycle) return;
    if (!editName.trim()) {
      Taro.showToast({ title: '请填写周期名称', icon: 'none' });
      return;
    }
    if (dayjs(editEnd).valueOf() <= dayjs(editStart).valueOf()) {
      Taro.showToast({ title: '结束时间需晚于开始时间', icon: 'none' });
      return;
    }
    setEditLoading(true);
    try {
      await focusCycleApi.update(cycle.id, {
        name: editName.trim(),
        startAt: dayjs(editStart).startOf('day').toISOString(),
        endAt: dayjs(editEnd).endOf('day').toISOString(),
      });
      Taro.showToast({ title: '周期已更新', icon: 'success' });
      setEditVisible(false);
      await loadCycle();
    } catch {
      // ignore
    } finally {
      setEditLoading(false);
    }
  };

  // ============ 结束周期 ============
  const handleEnd = async () => {
    if (!cycle) return;
    const res = await Taro.showModal({
      title: t('common.notice'),
      content: `确定结束专注周期「${cycle.name}」吗？`,
    });
    if (!res.confirm) return;
    await focusCycleApi.endCycle(cycle.id);
    Taro.showToast({ title: '已结束', icon: 'success' });
    await loadCycle();
  };

  // ============ 渲染 ============
  return (
    <View className={`summit-page ${isDark ? 'summit-dark' : ''} ${theme !== 'light' ? 'theme-' + theme : ''}`}>
      <View className="page-container">
        <View className="f-header">
          <Text className="f-heading">{t('focus.title')}</Text>
          {cycle ? (
            <View className="row">
              <Text className="mini-btn" onClick={openEditDialog}>{t('common.edit')}</Text>
              <Text className="mini-btn mini-btn--danger" onClick={handleEnd}>结束周期</Text>
            </View>
          ) : (
            !loading && (
              <Text className="mini-btn mini-btn--primary" onClick={openCreateDialog}>{t('focus.create')}</Text>
            )
          )}
        </View>

        {loading && (
          <View className="summit-empty"><Text>{t('common.loading')}</Text></View>
        )}

        {!loading && !cycle && (
          <View className="summit-empty">
            <Text className="empty-icon">🎯</Text>
            <Text>{t('focus.empty')}</Text>
            <View className="summit-btn create-btn" onClick={openCreateDialog}>立即创建</View>
          </View>
        )}

        {!loading && cycle && (
          <View>
            {/* 活跃周期卡片 */}
            <View className="summit-card">
              <View className="f-cycle-top">
                <View className="f-cycle-info">
                  <Text className="cycle-name">{cycle.name}</Text>
                  <View className="row cycle-period">
                    <Text>{dayjs(cycle.startAt).format('MM/DD')}</Text>
                    <Text className="summit-muted"> → </Text>
                    <Text>{dayjs(cycle.endAt).format('MM/DD')}</Text>
                    <Text className={`cycle-days ${daysRemaining <= 7 ? 'is-urgent' : ''}`}>
                      剩余 {daysRemaining} 天
                    </Text>
                  </View>
                </View>
                <View
                  className="score-ring"
                  style={{ background: `conic-gradient(var(--primary) ${score * 3.6}deg, var(--border) 0deg)` }}
                >
                  <View className="score-ring-inner">
                    <Text className="score-value">{score}</Text>
                    <Text className="score-label">{t('focus.cycleScore')}</Text>
                  </View>
                </View>
              </View>

              <View className="f-progress-block">
                <View className="f-progress-head">
                  <Text className="summit-muted text-small">时间进度</Text>
                  <Text className="summit-muted text-small">{cycleProgress}% 时间已过</Text>
                </View>
                <View className="summit-progress">
                  <View className="summit-progress__bar" style={{ width: `${cycleProgress}%` }} />
                </View>
                <View className="f-progress-head f-progress-head--mt">
                  <Text className="summit-muted text-small">{t('gantt.progress')}</Text>
                  <Text className="summit-muted text-small">{score}/100</Text>
                </View>
                <View className="summit-progress">
                  <View className="summit-progress__bar" style={{ width: `${score}%`, background: 'var(--success)' }} />
                </View>
              </View>
            </View>

            {/* 目标与权重 */}
            <View className="summit-card">
              <View className="summit-section-title">目标与权重</View>
              {cycle.objectives.map((oco) => {
                const pct = Math.round((oco.objective?.currentProgress ?? 0) * 100);
                return (
                  <View key={oco.objectiveId} className="obj-row">
                    <View className="row obj-name-row">
                      <View
                        className="status-dot"
                        style={{ background: oco.objective?.color ?? 'var(--primary)' }}
                      />
                      <Text className="obj-name">{oco.objective?.title ?? '未知目标'}</Text>
                      <Text className="obj-percent">{pct}%</Text>
                    </View>
                    <View className="row obj-bottom-row">
                      <View className="summit-progress obj-progress">
                        <View
                          className="summit-progress__bar"
                          style={{
                            width: `${pct}%`,
                            background: oco.objective?.isLagging ? 'var(--warning)' : 'var(--success)',
                          }}
                        />
                      </View>
                      <View className="stepper">
                        <Text
                          className="stepper-btn"
                          onClick={() => handleWeightChange(oco.objectiveId, oco.weight - 1)}
                        >
                          −
                        </Text>
                        <Text className="stepper-value">{oco.weight}</Text>
                        <Text
                          className="stepper-btn"
                          onClick={() => handleWeightChange(oco.objectiveId, oco.weight + 1)}
                        >
                          ＋
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
              {!cycle.objectives.length && (
                <Text className="summit-muted text-small">该周期暂未关联目标</Text>
              )}
            </View>
          </View>
        )}
      </View>

      {/* 创建周期弹层 */}
      {createVisible && (
        <View className="summit-overlay" onClick={() => setCreateVisible(false)}>
          <View className="sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="sheet-title">{t('focus.create')}</Text>
            <View className="form-item">
              <Text className="form-label">周期名称 *</Text>
              <Input
                className="field-input"
                value={createName}
                placeholder="如：2026 Q1 专注周期"
                onInput={(e) => setCreateName(e.detail.value)}
              />
            </View>
            <View className="form-item">
              <Text className="form-label">选择目标 *</Text>
              {!availableObjectives.length && (
                <Text className="summit-muted text-small">没有进行中的目标可加入</Text>
              )}
              {availableObjectives.map((obj) => {
                const checked = createIds.includes(obj.id);
                return (
                  <View key={obj.id} className="check-row" onClick={() => toggleObjective(obj.id)}>
                    <View className={`checkbox ${checked ? 'is-checked' : ''}`}>{checked && <Text>✓</Text>}</View>
                    <Text className="check-label">{obj.title}</Text>
                  </View>
                );
              })}
            </View>
            {createIds.length > 0 && (
              <View className="form-item">
                <Text className="form-label">目标权重</Text>
                {createIds.map((id) => (
                  <View key={id} className="weight-row">
                    <Text className="weight-name">{objectiveTitle(id)}</Text>
                    <View className="stepper">
                      <Text
                        className="stepper-btn"
                        onClick={() =>
                          setCreateWeights((prev) => ({ ...prev, [id]: Math.max(1, (prev[id] ?? 1) - 1) }))
                        }
                      >
                        −
                      </Text>
                      <Text className="stepper-value">{createWeights[id] ?? 1}</Text>
                      <Text
                        className="stepper-btn"
                        onClick={() =>
                          setCreateWeights((prev) => ({ ...prev, [id]: Math.min(10, (prev[id] ?? 1) + 1) }))
                        }
                      >
                        ＋
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
            <View className="form-item switch-row">
              <Text className="form-label switch-label">自定义起止时间</Text>
              <Switch checked={useCustomTime} onChange={(e) => setUseCustomTime(e.detail.value)} color="#409eff" />
            </View>
            <Text className="summit-muted text-small switch-hint">关闭则自动按目标计划时间计算</Text>
            {useCustomTime && (
              <View>
                <View className="form-item">
                  <Text className="form-label">开始时间</Text>
                  <Picker mode="date" value={createStart} onChange={(e) => setCreateStart(e.detail.value)}>
                    <View className="field-picker">
                      <Text>{createStart}</Text>
                      <Text className="summit-muted">📅</Text>
                    </View>
                  </Picker>
                </View>
                <View className="form-item">
                  <Text className="form-label">结束时间</Text>
                  <Picker mode="date" value={createEnd} onChange={(e) => setCreateEnd(e.detail.value)}>
                    <View className="field-picker">
                      <Text>{createEnd}</Text>
                      <Text className="summit-muted">📅</Text>
                    </View>
                  </Picker>
                </View>
              </View>
            )}
            <View className="row sheet-actions">
              <View className="summit-btn summit-btn--ghost flex-1" onClick={() => setCreateVisible(false)}>{t('common.cancel')}</View>
              <View className={`summit-btn flex-1 ${createLoading ? 'is-disabled' : ''}`} onClick={handleCreate}>
                {createLoading ? t('common.loading') : t('common.create')}
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 编辑周期弹层 */}
      {editVisible && (
        <View className="summit-overlay" onClick={() => setEditVisible(false)}>
          <View className="sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="sheet-title">编辑专注周期</Text>
            <View className="form-item">
              <Text className="form-label">周期名称 *</Text>
              <Input
                className="field-input"
                value={editName}
                placeholder="如：2026 Q1 专注周期"
                onInput={(e) => setEditName(e.detail.value)}
              />
            </View>
            <View className="form-item">
              <Text className="form-label">开始时间</Text>
              <Picker mode="date" value={editStart} onChange={(e) => setEditStart(e.detail.value)}>
                <View className="field-picker">
                  <Text>{editStart}</Text>
                  <Text className="summit-muted">📅</Text>
                </View>
              </Picker>
            </View>
            <View className="form-item">
              <Text className="form-label">结束时间</Text>
              <Picker mode="date" value={editEnd} onChange={(e) => setEditEnd(e.detail.value)}>
                <View className="field-picker">
                  <Text>{editEnd}</Text>
                  <Text className="summit-muted">📅</Text>
                </View>
              </Picker>
            </View>
            <View className="row sheet-actions">
              <View className="summit-btn summit-btn--ghost flex-1" onClick={() => setEditVisible(false)}>{t('common.cancel')}</View>
              <View className={`summit-btn flex-1 ${editLoading ? 'is-disabled' : ''}`} onClick={handleUpdate}>
                {editLoading ? t('common.loading') : t('common.save')}
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
