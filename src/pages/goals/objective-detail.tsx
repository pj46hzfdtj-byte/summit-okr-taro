import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Input, Textarea, Switch, Picker } from '@tarojs/components';
import Taro, { useRouter, usePullDownRefresh } from '@tarojs/taro';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { objectiveApi, keyResultApi, recordApi, memoApi, reviewApi } from '@/lib/api';
import type {
  Objective,
  KeyResult,
  Memo,
  Review,
  CalculationType,
  KrConfidence,
  RecordTrendPoint,
} from '@/lib/types';
import { CalculationTypeLabel } from '@/lib/types';
import { useAppStore } from '@/stores/app';
import './objective-detail.scss';

const COLOR_PRESETS = ['#409eff', '#1E40AF', '#2e7d32', '#7c3aed', '#e6a23c', '#f56c6c', '#0f9960', '#646a73'];

const CALC_KEYS = Object.keys(CalculationTypeLabel) as CalculationType[];
const CALC_LABELS = CALC_KEYS.map((k) => (CalculationTypeLabel as Record<string, string>)[k]);

const CONFIDENCE_META: Record<KrConfidence, { label: string; color: string }> = {
  on_track: { label: '🟢 正常', color: '#0f9960' },
  at_risk: { label: '🟡 有风险', color: '#d97706' },
  off_track: { label: '🔴 已偏离', color: '#dc2626' },
};

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function computeProgress(kr: KeyResult): number {
  if (kr.targetValue === kr.initialValue) return 0;
  const ratio = (kr.currentValue - kr.initialValue) / (kr.targetValue - kr.initialValue);
  return Math.max(0, Math.min(1, ratio));
}

interface ObjEditForm {
  title: string;
  color: string;
  usePlanTime: boolean;
  startDate: string;
  endDate: string;
  motivations: string[];
  feasibilities: string[];
}

interface KrForm {
  title: string;
  emoji: string;
  initialValue: number;
  targetValue: number;
  calculationType: CalculationType;
  customFormula: string;
  weight: number;
  minRecordCount: number;
  confidence: KrConfidence;
}

const emptyKrForm = (): KrForm => ({
  title: '',
  emoji: '🌟',
  initialValue: 0,
  targetValue: 100,
  calculationType: 'sum',
  customFormula: '',
  weight: 100,
  minRecordCount: 0,
  confidence: 'on_track',
});

export default function ObjectiveDetailPage() {
  const { t } = useTranslation();
  const isDark = useAppStore((s) => s.isDark);
  const theme = useAppStore((s) => s.theme);
  const { params } = useRouter();
  const objectiveId = params.id ?? '';

  const [objective, setObjective] = useState<Objective | null>(null);
  const [keyResults, setKeyResults] = useState<KeyResult[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [krMemos, setKrMemos] = useState<Record<string, Memo[]>>({});
  const [metaTab, setMetaTab] = useState<'motivations' | 'feasibilities' | 'memos'>('motivations');

  const statusTagClass = useMemo(() => {
    const s = objective?.status;
    if (s === 'completed') return 'summit-tag summit-tag--success';
    if (s === 'in_progress' || s === 'pending_review') return 'summit-tag summit-tag--warning';
    return 'summit-tag';
  }, [objective?.status]);

  const objectiveEditable = !!objective && objective.status !== 'completed';

  const loadData = useCallback(async () => {
    if (!objectiveId) return;
    try {
      const data = await objectiveApi.getById(objectiveId);
      setObjective(data);
      setKeyResults(data.keyResults ?? []);
    } catch {
      // http 层已 toast
    }
    try {
      setReviews(await reviewApi.listByObjective(objectiveId));
    } catch {
      setReviews([]);
    }
  }, [objectiveId]);

  const loadMemos = useCallback(async () => {
    if (!objectiveId) return;
    try {
      setMemos(await memoApi.list('objective', objectiveId));
    } catch {
      setMemos([]);
    }
  }, [objectiveId]);

  useEffect(() => {
    loadData();
    loadMemos();
  }, [loadData, loadMemos]);

  usePullDownRefresh(() => {
    const stop = () => Taro.stopPullDownRefresh();
    Promise.all([loadData(), loadMemos()]).then(stop, stop);
  });

  const goAiAssistant = useCallback(() => {
    Taro.navigateTo({ url: '/pages/ai/ai-assistant?tab=plan-tasks&objectiveId=' + objectiveId });
  }, [objectiveId]);

  // ============ 目标编辑弹层 ============
  const [objEditVisible, setObjEditVisible] = useState(false);
  const [objEditLoading, setObjEditLoading] = useState(false);
  const [objEditForm, setObjEditForm] = useState<ObjEditForm>({
    title: '',
    color: '#409EFF',
    usePlanTime: false,
    startDate: '',
    endDate: '',
    motivations: [],
    feasibilities: [],
  });
  const [newMotivation, setNewMotivation] = useState('');
  const [newFeasibility, setNewFeasibility] = useState('');

  const openObjEdit = useCallback(() => {
    if (!objective) return;
    setObjEditForm({
      title: objective.title,
      color: objective.color ?? '#409EFF',
      usePlanTime: !!objective.startAt,
      startDate: objective.startAt ? dayjs(objective.startAt).format('YYYY-MM-DD') : '',
      endDate: objective.endAt ? dayjs(objective.endAt).format('YYYY-MM-DD') : '',
      motivations: [...(objective.motivations ?? [])],
      feasibilities: [...(objective.feasibilities ?? [])],
    });
    setNewMotivation('');
    setNewFeasibility('');
    setObjEditVisible(true);
  }, [objective]);

  const addTag = useCallback((field: 'motivations' | 'feasibilities', raw: string) => {
    const v = raw.trim();
    if (!v) return;
    setObjEditForm((prev) => {
      if (prev[field].includes(v)) return prev;
      return { ...prev, [field]: [...prev[field], v] };
    });
  }, []);

  const removeTag = useCallback((field: 'motivations' | 'feasibilities', i: number) => {
    setObjEditForm((prev) => ({ ...prev, [field]: prev[field].filter((_, idx) => idx !== i) }));
  }, []);

  const handleUpdateObjective = useCallback(async () => {
    if (!objEditForm.title.trim()) {
      Taro.showToast({ title: '请输入目标标题', icon: 'none' });
      return;
    }
    if (objEditForm.usePlanTime && objEditForm.startDate && objEditForm.endDate) {
      if (objEditForm.endDate < objEditForm.startDate) {
        Taro.showToast({ title: '结束时间需晚于开始时间', icon: 'none' });
        return;
      }
    }
    setObjEditLoading(true);
    try {
      await objectiveApi.update(objectiveId, {
        title: objEditForm.title.trim(),
        color: objEditForm.color,
        startAt: objEditForm.usePlanTime && objEditForm.startDate
          ? new Date(`${objEditForm.startDate}T00:00:00`).toISOString()
          : null,
        endAt: objEditForm.usePlanTime && objEditForm.endDate
          ? new Date(`${objEditForm.endDate}T23:59:59`).toISOString()
          : null,
        motivations: objEditForm.motivations,
        feasibilities: objEditForm.feasibilities,
      });
      Taro.showToast({ title: '目标已更新', icon: 'success' });
      setObjEditVisible(false);
      await loadData();
    } finally {
      setObjEditLoading(false);
    }
  }, [objEditForm, objectiveId, loadData]);

  // ============ KR 创建 / 编辑弹层 ============
  const [krDialogVisible, setKrDialogVisible] = useState(false);
  const [krSaving, setKrSaving] = useState(false);
  const [krEditId, setKrEditId] = useState<string | null>(null);
  const [krForm, setKrForm] = useState<KrForm>(emptyKrForm());
  const calcIndex = Math.max(0, CALC_KEYS.indexOf(krForm.calculationType));

  const openKrDialog = useCallback(() => {
    setKrEditId(null);
    setKrForm(emptyKrForm());
    setKrDialogVisible(true);
  }, []);

  const openKrEditDialog = useCallback((kr: KeyResult) => {
    setKrEditId(kr.id);
    setKrForm({
      title: kr.title,
      emoji: kr.emoji,
      initialValue: kr.initialValue,
      targetValue: kr.targetValue,
      calculationType: kr.calculationType,
      customFormula: kr.customFormula ?? '',
      weight: kr.weight,
      minRecordCount: kr.minRecordCount,
      confidence: kr.confidence ?? 'on_track',
    });
    setKrDialogVisible(true);
  }, []);

  const handleSubmitKr = useCallback(async () => {
    if (!krForm.title.trim()) {
      Taro.showToast({ title: '请输入 KR 标题', icon: 'none' });
      return;
    }
    setKrSaving(true);
    try {
      if (krEditId) {
        await keyResultApi.update(krEditId, {
          title: krForm.title.trim(),
          emoji: krForm.emoji,
          initialValue: krForm.initialValue,
          targetValue: krForm.targetValue,
          calculationType: krForm.calculationType,
          customFormula: krForm.calculationType === 'custom' ? krForm.customFormula : null,
          weight: krForm.weight,
          minRecordCount: krForm.minRecordCount,
          confidence: krForm.confidence,
        });
        Taro.showToast({ title: 'KR 已更新', icon: 'success' });
      } else {
        await keyResultApi.create({
          objectiveId,
          title: krForm.title.trim(),
          emoji: krForm.emoji,
          initialValue: krForm.initialValue,
          targetValue: krForm.targetValue,
          calculationType: krForm.calculationType,
          customFormula: krForm.calculationType === 'custom' ? krForm.customFormula : undefined,
          weight: krForm.weight,
          minRecordCount: krForm.minRecordCount,
        });
        Taro.showToast({ title: 'KR 创建成功', icon: 'success' });
      }
      setKrDialogVisible(false);
      await loadData();
    } finally {
      setKrSaving(false);
    }
  }, [krForm, krEditId, objectiveId, loadData]);

  const handleDeleteKr = useCallback(
    (kr: KeyResult) => {
      Taro.showModal({
        title: t('common.notice'),
        content: `确定删除 KR「${kr.title}」吗？`,
        success: async (res) => {
          if (res.confirm) {
            await keyResultApi.remove(kr.id);
            Taro.showToast({ title: '删除成功', icon: 'success' });
            await loadData();
          }
        },
      });
    },
    [t, loadData],
  );

  const cycleConfidence = useCallback(async (kr: KeyResult) => {
    const order: KrConfidence[] = ['on_track', 'at_risk', 'off_track'];
    const next = order[(order.indexOf(kr.confidence ?? 'on_track') + 1) % order.length];
    try {
      await keyResultApi.update(kr.id, { confidence: next });
      setKeyResults((prev) => prev.map((k) => (k.id === kr.id ? { ...k, confidence: next } : k)));
    } catch {
      // http 层已 toast
    }
  }, []);

  // ============ 记录弹层 ============
  const [recordDialogVisible, setRecordDialogVisible] = useState(false);
  const [recordSaving, setRecordSaving] = useState(false);
  const [selectedKr, setSelectedKr] = useState<KeyResult | null>(null);
  const [recordValue, setRecordValue] = useState(0);
  const [recordNote, setRecordNote] = useState('');

  const openRecordDialog = useCallback((kr: KeyResult) => {
    setSelectedKr(kr);
    setRecordValue(kr.currentValue);
    setRecordNote('');
    setRecordDialogVisible(true);
  }, []);

  const handleAddRecord = useCallback(async () => {
    if (!selectedKr) return;
    setRecordSaving(true);
    try {
      await recordApi.create({
        keyResultId: selectedKr.id,
        value: recordValue,
        note: recordNote.trim() || undefined,
      });
      Taro.showToast({ title: '记录添加成功', icon: 'success' });
      setRecordDialogVisible(false);
      await loadData();
    } finally {
      setRecordSaving(false);
    }
  }, [selectedKr, recordValue, recordNote, loadData]);

  // ============ 趋势 / 记录列表弹层 ============
  const [trendVisible, setTrendVisible] = useState(false);
  const [trendKr, setTrendKr] = useState<KeyResult | null>(null);
  const [trendPoints, setTrendPoints] = useState<RecordTrendPoint[]>([]);
  const trendMax = useMemo(
    () => Math.max(1, ...trendPoints.map((p) => Math.abs(p.cumulativeValue))),
    [trendPoints],
  );

  const showTrend = useCallback(async (kr: KeyResult) => {
    setTrendKr(kr);
    setTrendPoints([]);
    setTrendVisible(true);
    try {
      setTrendPoints(await recordApi.getTrend(kr.id));
    } catch {
      setTrendPoints([]);
    }
  }, []);

  // ============ 备忘弹层（objective / KR 共用） ============
  const [memoDialogVisible, setMemoDialogVisible] = useState(false);
  const [memoContent, setMemoContent] = useState('');
  const [memoKrTarget, setMemoKrTarget] = useState<KeyResult | null>(null);

  const loadKrMemos = useCallback(async (krId: string) => {
    try {
      const list = await memoApi.list('key_result', krId);
      setKrMemos((prev) => ({ ...prev, [krId]: list ?? [] }));
    } catch {
      setKrMemos((prev) => ({ ...prev, [krId]: [] }));
    }
  }, []);

  const openMemoDialog = useCallback(() => {
    setMemoKrTarget(null);
    setMemoContent('');
    setMemoDialogVisible(true);
  }, []);

  const openKrMemoDialog = useCallback(
    (kr: KeyResult) => {
      setMemoKrTarget(kr);
      setMemoContent('');
      if (!krMemos[kr.id]) loadKrMemos(kr.id);
      setMemoDialogVisible(true);
    },
    [krMemos, loadKrMemos],
  );

  const closeMemoDialog = useCallback(() => {
    setMemoDialogVisible(false);
    setMemoKrTarget(null);
  }, []);

  const handleCreateMemo = useCallback(async () => {
    if (!memoContent.trim()) {
      Taro.showToast({ title: '请输入备忘内容', icon: 'none' });
      return;
    }
    if (memoKrTarget) {
      await memoApi.create({
        ownerType: 'key_result',
        ownerId: memoKrTarget.id,
        content: memoContent.trim(),
      });
      await loadKrMemos(memoKrTarget.id);
    } else {
      await memoApi.create({
        ownerType: 'objective',
        ownerId: objectiveId,
        content: memoContent.trim(),
      });
      await loadMemos();
    }
    Taro.showToast({ title: '备忘已添加', icon: 'success' });
    setMemoContent('');
  }, [memoContent, memoKrTarget, objectiveId, loadKrMemos, loadMemos]);

  const confirmDeleteMemo = useCallback(
    (m: Memo, target: KeyResult | null) => {
      Taro.showModal({
        title: t('common.notice'),
        content: '确定删除该备忘？',
        success: async (res) => {
          if (res.confirm) {
            await memoApi.remove(m.id);
            if (target) await loadKrMemos(target.id);
            else await loadMemos();
          }
        },
      });
    },
    [t, loadKrMemos, loadMemos],
  );

  const progressPct = Math.round((objective?.currentProgress ?? 0) * 100);
  const expectedPct = Math.round((objective?.expectedProgress ?? 0) * 100);

  return (
    <View className={`summit-page detail-page ${isDark ? 'summit-dark' : ''} ${theme !== 'light' ? 'theme-' + theme : ''}`}>
      {objective ? (
        <View className="detail-container">
          {/* 头部信息卡 */}
          <View className="summit-card">
            <View className="detail-tag-row">
              <Text className={statusTagClass}>{t(`objective.status.${objective.status}`)}</Text>
              {objective.isLagging ? <Text className="summit-tag summit-tag--danger">滞后</Text> : null}
            </View>
            <View className="detail-title-row">
              <View className="obj-ring">
                <View
                  className="obj-ring__fill"
                  style={{
                    background: `conic-gradient(${objective.color || 'var(--primary)'} ${progressPct * 3.6}deg, var(--bg) 0deg)`,
                  }}
                />
                <View className="obj-ring__inner">
                  <Text className="obj-ring__value">{progressPct}<Text className="obj-ring__unit">%</Text></Text>
                </View>
              </View>
              <View className="color-dot" style={{ background: objective.color }} />
              <Text className="detail-obj-title">{objective.title}</Text>
            </View>

            <View className="meta-grid">
              <View className="meta-item">
                <Text className="meta-label">{t('objective.goalGroup')}</Text>
                <Text className="meta-value">{objective.goalGroup?.name ?? '-'}</Text>
              </View>
              <View className="meta-item">
                <Text className="meta-label">{t('objective.krCount')}</Text>
                <Text className="meta-value">{keyResults.length}</Text>
              </View>
              <View className="meta-item">
                <Text className="meta-label">{t('objective.startAt')}</Text>
                <Text className="meta-value">
                  {objective.startAt ? dayjs(objective.startAt).format('YYYY-MM-DD HH:mm') : '-'}
                </Text>
              </View>
              <View className="meta-item">
                <Text className="meta-label">{t('objective.endAt')}</Text>
                <Text className="meta-value">
                  {objective.endAt ? dayjs(objective.endAt).format('YYYY-MM-DD HH:mm') : '-'}
                </Text>
              </View>
            </View>

            <View className="progress-block">
              <View className="progress-head">
                <Text className="summit-muted progress-label">{t('objective.currentProgress')}</Text>
                <Text className={`progress-pct ${objective.isLagging ? 'is-lagging' : ''}`}>{progressPct}%</Text>
              </View>
              <View className="summit-progress">
                <View
                  className="summit-progress__bar"
                  style={{
                    width: `${progressPct}%`,
                    background: objective.isLagging ? 'var(--warning)' : 'var(--primary)',
                  }}
                />
              </View>
              <View className="progress-foot">
                <Text className="summit-muted progress-label">
                  {t('objective.expectedProgress')} {expectedPct}%
                </Text>
                <Text className="summit-muted progress-label">70 分健康线：完成度 ≥ 预期即健康</Text>
              </View>
            </View>

            <View className="detail-actions">
              {objectiveEditable ? (
                <View className="summit-btn summit-btn--ghost detail-btn" onClick={openObjEdit}>
                  <Text>{t('common.edit')}{t('goal.createObjective')}</Text>
                </View>
              ) : null}
              <View className="summit-btn summit-btn--ghost detail-btn" onClick={goAiAssistant}>
                <Text>🤖 {t('nav.ai')}</Text>
              </View>
            </View>
          </View>

          {/* 动机 / 可行性 / 备忘 */}
          <View className="summit-card">
            <View className="tab-row">
              {(['motivations', 'feasibilities', 'memos'] as const).map((k) => (
                <View
                  key={k}
                  className={`tab-item ${metaTab === k ? 'active' : ''}`}
                  onClick={() => setMetaTab(k)}
                >
                  <Text>
                    {k === 'motivations'
                      ? `${t('objective.motivations')} (${objective.motivations?.length ?? 0})`
                      : k === 'feasibilities'
                        ? `${t('objective.feasibility')} (${objective.feasibilities?.length ?? 0})`
                        : `备忘 (${memos.length})`}
                  </Text>
                </View>
              ))}
            </View>

            {metaTab === 'motivations' ? (
              objective.motivations?.length ? (
                <View className="bullet-list">
                  {objective.motivations.map((m, i) => (
                    <Text key={i} className="bullet-item">• {m}</Text>
                  ))}
                </View>
              ) : (
                <Text className="empty-hint">暂无动机</Text>
              )
            ) : null}

            {metaTab === 'feasibilities' ? (
              objective.feasibilities?.length ? (
                <View className="bullet-list">
                  {objective.feasibilities.map((f, i) => (
                    <Text key={i} className="bullet-item">• {f}</Text>
                  ))}
                </View>
              ) : (
                <Text className="empty-hint">暂无可行性</Text>
              )
            ) : null}

            {metaTab === 'memos' ? (
              <View>
                {memos.map((m) => (
                  <View key={m.id} className="memo-item">
                    <Text className="memo-content">{m.content}</Text>
                    <Text className="summit-muted memo-time">{dayjs(m.createdAt).format('MM-DD HH:mm')}</Text>
                    <Text className="memo-del" onClick={() => confirmDeleteMemo(m, null)}>{t('common.delete')}</Text>
                  </View>
                ))}
                {!memos.length ? <Text className="empty-hint">暂无备忘</Text> : null}
                <View className="summit-btn summit-btn--ghost add-memo-btn" onClick={openMemoDialog}>
                  <Text>添加备忘</Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* KR 列表 */}
          <View className="summit-card">
            <View className="card-head">
              <Text className="summit-section-title card-title-text">
                {t('objective.keyResults')} ({keyResults.length})
              </Text>
              {objectiveEditable ? (
                <View className="kr-add-btn" onClick={openKrDialog}>
                  <Text>＋ {t('objective.addKr')}</Text>
                </View>
              ) : null}
            </View>

            {!keyResults.length ? (
              <View className="summit-empty kr-empty">
                <Text className="kr-empty-icon">🎯</Text>
                <View className="kr-empty-text">{t('objective.emptyKr')}</View>
              </View>
            ) : null}

            {keyResults.map((kr) => {
              const pct = Math.round(computeProgress(kr) * 100);
              const conf = CONFIDENCE_META[kr.confidence ?? 'on_track'];
              return (
                <View key={kr.id} className="kr-item">
                  <View className="kr-head">
                    <Text className="kr-emoji">{kr.emoji}</Text>
                    <View className="kr-body">
                      <View className="kr-title-row">
                        <View
                          className="confidence-dot"
                          style={{ background: conf.color }}
                          onClick={() => cycleConfidence(kr)}
                        />
                        <Text className="kr-name">{kr.title}</Text>
                      </View>
                      <View className="kr-meta-row">
                        <Text className="summit-tag">{(CalculationTypeLabel as Record<string, string>)[kr.calculationType]}</Text>
                        <Text className="summit-tag">权重 {kr.weight}</Text>
                        <Text className="summit-muted kr-values">
                          {kr.initialValue} → {kr.currentValue.toFixed(2)} / {kr.targetValue}
                        </Text>
                      </View>
                    </View>
                    <Text className="kr-percent">{pct}%</Text>
                  </View>
                  <View className="summit-progress kr-progress">
                    <View className="summit-progress__bar" style={{ width: `${pct}%` }} />
                  </View>
                  <View className="kr-actions">
                    <Text className="action-btn" onClick={() => openRecordDialog(kr)}>＋ {t('objective.addRecord')}</Text>
                    <Text className="action-btn" onClick={() => showTrend(kr)}>{t('objective.trend')}</Text>
                    <Text className="action-btn" onClick={() => openKrMemoDialog(kr)}>备忘</Text>
                    <Text className="action-btn" onClick={() => openKrEditDialog(kr)}>{t('common.edit')}</Text>
                    <Text className="action-btn danger" onClick={() => handleDeleteKr(kr)}>{t('common.delete')}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* 复盘摘要 */}
          <View className="summit-card">
            <Text className="summit-section-title">{t('review.title')}</Text>
            {!reviews.length ? (
              <Text className="empty-hint">{t('review.empty')}</Text>
            ) : (
              reviews.map((r) => (
                <View key={r.id} className="review-item">
                  <View className="review-head">
                    <Text className="summit-tag summit-tag--warning">
                      {r.type === 'midterm' ? t('review.midterm') : t('review.final')}
                    </Text>
                    <Text className="summit-muted review-version">{t('review.version')} v{r.version}</Text>
                    <Text className="summit-muted review-time">{dayjs(r.createdAt).format('YYYY-MM-DD HH:mm')}</Text>
                  </View>
                  <View className="review-scores">
                    <Text className="review-score">自评 {Math.round(r.selfRating * 100)}</Text>
                    {r.objectiveScore != null ? (
                      <Text className="review-score review-score--final">目标得分 {Math.round(r.objectiveScore)}</Text>
                    ) : null}
                  </View>
                  {r.thoughts ? <Text className="review-thoughts">{r.thoughts}</Text> : null}
                </View>
              ))
            )}
          </View>
        </View>
      ) : (
        <View className="detail-loading">
          <Text>{t('common.loading')}</Text>
        </View>
      )}

      {/* ============ 目标编辑弹层 ============ */}
      {objEditVisible ? (
        <View className="summit-overlay" onClick={() => setObjEditVisible(false)}>
          <View className="popup-sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="popup-title">{t('common.edit')}{t('goal.createObjective')}</Text>
            <View className="form-item">
              <Text className="form-label">标题</Text>
              <Input
                className="form-input"
                value={objEditForm.title}
                placeholder="目标标题"
                onInput={(e) => setObjEditForm((prev) => ({ ...prev, title: e.detail.value }))}
              />
            </View>
            <View className="form-item">
              <Text className="form-label">{t('goal.color')}</Text>
              <View className="color-row">
                {COLOR_PRESETS.map((c) => (
                  <View
                    key={c}
                    className={`color-dot-lg ${objEditForm.color === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setObjEditForm((prev) => ({ ...prev, color: c }))}
                  />
                ))}
              </View>
            </View>
            <View className="form-item form-item-switch">
              <Text className="form-label form-label-inline">计划时间</Text>
              <Switch
                checked={objEditForm.usePlanTime}
                onChange={(e) => setObjEditForm((prev) => ({ ...prev, usePlanTime: e.detail.value }))}
              />
            </View>
            {objEditForm.usePlanTime ? (
              <View className="form-item">
                <Text className="form-label">{t('objective.startAt')}</Text>
                <Picker
                  mode="date"
                  value={objEditForm.startDate}
                  onChange={(e) => setObjEditForm((prev) => ({ ...prev, startDate: String(e.detail.value) }))}
                >
                  <View className="form-picker">
                    <Text className={objEditForm.startDate ? '' : 'form-picker-placeholder'}>
                      {objEditForm.startDate || '选择开始日期'}
                    </Text>
                    <Text className="form-picker-arrow">▾</Text>
                  </View>
                </Picker>
              </View>
            ) : null}
            {objEditForm.usePlanTime ? (
              <View className="form-item">
                <Text className="form-label">{t('objective.endAt')}</Text>
                <Picker
                  mode="date"
                  start={objEditForm.startDate || undefined}
                  value={objEditForm.endDate}
                  onChange={(e) => setObjEditForm((prev) => ({ ...prev, endDate: String(e.detail.value) }))}
                >
                  <View className="form-picker">
                    <Text className={objEditForm.endDate ? '' : 'form-picker-placeholder'}>
                      {objEditForm.endDate || '选择结束日期'}
                    </Text>
                    <Text className="form-picker-arrow">▾</Text>
                  </View>
                </Picker>
              </View>
            ) : null}
            <View className="form-item">
              <Text className="form-label">{t('objective.motivations')}（点击标签删除）</Text>
              <View className="tag-wrap">
                {objEditForm.motivations.map((m, i) => (
                  <Text key={i} className="summit-tag editable-tag" onClick={() => removeTag('motivations', i)}>
                    {m} ×
                  </Text>
                ))}
              </View>
              <View className="tag-input-row">
                <Input
                  className="form-input flex-1"
                  value={newMotivation}
                  placeholder="输入动机"
                  onInput={(e) => setNewMotivation(e.detail.value)}
                />
                <View
                  className="tag-add-btn"
                  onClick={() => {
                    addTag('motivations', newMotivation);
                    setNewMotivation('');
                  }}
                >
                  <Text>{t('common.add')}</Text>
                </View>
              </View>
            </View>
            <View className="form-item">
              <Text className="form-label">{t('objective.feasibility')}（点击标签删除）</Text>
              <View className="tag-wrap">
                {objEditForm.feasibilities.map((f, i) => (
                  <Text key={i} className="summit-tag summit-tag--success editable-tag" onClick={() => removeTag('feasibilities', i)}>
                    {f} ×
                  </Text>
                ))}
              </View>
              <View className="tag-input-row">
                <Input
                  className="form-input flex-1"
                  value={newFeasibility}
                  placeholder="输入可行性"
                  onInput={(e) => setNewFeasibility(e.detail.value)}
                />
                <View
                  className="tag-add-btn"
                  onClick={() => {
                    addTag('feasibilities', newFeasibility);
                    setNewFeasibility('');
                  }}
                >
                  <Text>{t('common.add')}</Text>
                </View>
              </View>
            </View>
            <View className="popup-btns">
              <View className="summit-btn summit-btn--ghost popup-btn" onClick={() => setObjEditVisible(false)}>
                <Text>{t('common.cancel')}</Text>
              </View>
              <View className={`summit-btn popup-btn ${objEditLoading ? 'is-disabled' : ''}`} onClick={handleUpdateObjective}>
                <Text>{objEditLoading ? '...' : t('common.save')}</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {/* ============ KR 创建 / 编辑弹层 ============ */}
      {krDialogVisible ? (
        <View className="summit-overlay" onClick={() => setKrDialogVisible(false)}>
          <View className="popup-sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="popup-title">{krEditId ? '编辑关键结果' : '新建关键结果'}</Text>
            <View className="form-item">
              <Text className="form-label">标题</Text>
              <Input
                className="form-input"
                value={krForm.title}
                placeholder="建议含数字与单位"
                onInput={(e) => setKrForm((prev) => ({ ...prev, title: e.detail.value }))}
              />
            </View>
            <View className="form-item">
              <Text className="form-label">Emoji</Text>
              <Input
                className="form-input emoji-input"
                value={krForm.emoji}
                onInput={(e) => setKrForm((prev) => ({ ...prev, emoji: e.detail.value }))}
              />
            </View>
            <View className="form-row">
              <View className="form-item flex-1">
                <Text className="form-label">初始值</Text>
                <Input
                  className="form-input"
                  type="digit"
                  value={String(krForm.initialValue)}
                  onInput={(e) => setKrForm((prev) => ({ ...prev, initialValue: num(e.detail.value) }))}
                />
              </View>
              <View className="form-item flex-1">
                <Text className="form-label">目标值</Text>
                <Input
                  className="form-input"
                  type="digit"
                  value={String(krForm.targetValue)}
                  onInput={(e) => setKrForm((prev) => ({ ...prev, targetValue: num(e.detail.value) }))}
                />
              </View>
            </View>
            <View className="form-item">
              <Text className="form-label">取值方式</Text>
              <Picker
                mode="selector"
                range={CALC_LABELS}
                value={calcIndex}
                onChange={(e) => setKrForm((prev) => ({ ...prev, calculationType: CALC_KEYS[Number(e.detail.value)] }))}
              >
                <View className="form-picker">
                  <Text>{CALC_LABELS[calcIndex]}</Text>
                  <Text className="form-picker-arrow">▾</Text>
                </View>
              </Picker>
            </View>
            {krForm.calculationType === 'custom' ? (
              <View className="form-item">
                <Text className="form-label">自定义公式</Text>
                <Input
                  className="form-input"
                  value={krForm.customFormula}
                  placeholder="如：sum / count"
                  onInput={(e) => setKrForm((prev) => ({ ...prev, customFormula: e.detail.value }))}
                />
              </View>
            ) : null}
            <View className="form-row">
              <View className="form-item flex-1">
                <Text className="form-label">权重</Text>
                <Input
                  className="form-input"
                  type="number"
                  value={String(krForm.weight)}
                  onInput={(e) => setKrForm((prev) => ({ ...prev, weight: Math.max(1, Math.min(100, num(e.detail.value))) }))}
                />
              </View>
              <View className="form-item flex-1">
                <Text className="form-label">最少记录数</Text>
                <Input
                  className="form-input"
                  type="number"
                  value={String(krForm.minRecordCount)}
                  onInput={(e) => setKrForm((prev) => ({ ...prev, minRecordCount: Math.max(0, num(e.detail.value)) }))}
                />
              </View>
            </View>
            {krEditId ? (
              <View className="form-item">
                <Text className="form-label">信心度</Text>
                <View className="confidence-row">
                  {(Object.keys(CONFIDENCE_META) as KrConfidence[]).map((c) => (
                    <View
                      key={c}
                      className={`confidence-opt ${krForm.confidence === c ? 'active' : ''}`}
                      onClick={() => setKrForm((prev) => ({ ...prev, confidence: c }))}
                    >
                      <Text>{CONFIDENCE_META[c].label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            <View className="popup-btns">
              <View className="summit-btn summit-btn--ghost popup-btn" onClick={() => setKrDialogVisible(false)}>
                <Text>{t('common.cancel')}</Text>
              </View>
              <View className={`summit-btn popup-btn ${krSaving ? 'is-disabled' : ''}`} onClick={handleSubmitKr}>
                <Text>{krSaving ? '...' : krEditId ? t('common.save') : t('common.create')}</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {/* ============ 记录添加弹层 ============ */}
      {recordDialogVisible ? (
        <View className="summit-overlay" onClick={() => setRecordDialogVisible(false)}>
          <View className="popup-sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="popup-title">添加记录 · {selectedKr?.title ?? ''}</Text>
            <View className="form-item">
              <Text className="form-label">数值</Text>
              <Input
                className="form-input"
                type="digit"
                value={String(recordValue)}
                onInput={(e) => setRecordValue(num(e.detail.value))}
              />
            </View>
            <View className="form-item">
              <Text className="form-label">备注</Text>
              <Textarea
                className="form-textarea"
                value={recordNote}
                placeholder="可选"
                maxlength={500}
                onInput={(e) => setRecordNote(e.detail.value)}
              />
            </View>
            <View className="popup-btns">
              <View className="summit-btn summit-btn--ghost popup-btn" onClick={() => setRecordDialogVisible(false)}>
                <Text>{t('common.cancel')}</Text>
              </View>
              <View className={`summit-btn popup-btn ${recordSaving ? 'is-disabled' : ''}`} onClick={handleAddRecord}>
                <Text>{recordSaving ? '...' : t('common.add')}</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {/* ============ 备忘弹层（objective / KR 共用） ============ */}
      {memoDialogVisible ? (
        <View className="summit-overlay" onClick={closeMemoDialog}>
          <View className="popup-sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="popup-title">{memoKrTarget ? 'KR 备忘' : '添加备忘'}</Text>
            {memoKrTarget ? (
              <View className="bullet-list memo-list">
                {(krMemos[memoKrTarget.id] ?? []).map((m) => (
                  <View key={m.id} className="memo-item">
                    <Text className="memo-content">{m.content}</Text>
                    <Text className="summit-muted memo-time">{dayjs(m.createdAt).format('MM-DD')}</Text>
                    <Text className="memo-del" onClick={() => confirmDeleteMemo(m, memoKrTarget)}>{t('common.delete')}</Text>
                  </View>
                ))}
                {!(krMemos[memoKrTarget.id] ?? []).length ? <Text className="empty-hint">暂无备忘</Text> : null}
              </View>
            ) : null}
            <Textarea
              className="form-textarea memo-textarea"
              value={memoContent}
              placeholder="备忘内容"
              maxlength={500}
              onInput={(e) => setMemoContent(e.detail.value)}
            />
            <View className="popup-btns">
              <View className="summit-btn summit-btn--ghost popup-btn" onClick={closeMemoDialog}>
                <Text>关闭</Text>
              </View>
              <View className="summit-btn popup-btn" onClick={handleCreateMemo}>
                <Text>{t('common.add')}</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {/* ============ 趋势 / 记录列表弹层 ============ */}
      {trendVisible ? (
        <View className="summit-overlay" onClick={() => setTrendVisible(false)}>
          <View className="popup-sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="popup-title">趋势 · {trendKr?.title ?? ''}</Text>
            {trendPoints.length ? (
              <View className="trend-list">
                {trendPoints.map((p, i) => (
                  <View key={i} className="trend-row">
                    <Text className="trend-date">{dayjs(p.recordedAt).format('MM-DD')}</Text>
                    <View className="trend-bar-wrap">
                      <View
                        className="trend-bar"
                        style={{ width: `${Math.round((Math.abs(p.cumulativeValue) / trendMax) * 100)}%` }}
                      />
                    </View>
                    <Text className="trend-value">{p.value}</Text>
                    <Text className="summit-muted trend-cum">累计 {p.cumulativeValue}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="empty-hint trend-empty">还没有记录数据</Text>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}
