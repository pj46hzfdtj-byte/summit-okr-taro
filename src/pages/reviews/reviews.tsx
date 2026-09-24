import { useCallback, useMemo, useState } from 'react';
import { View, Text, Input, Textarea, Picker, Slider } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { keyResultApi, objectiveApi, reviewApi } from '@/lib/api';
import type { KeyResult, Objective, Review, ReviewType } from '@/lib/types';
import { useAppStore } from '@/stores/app';
import './reviews.scss';

interface KrScoreRow {
  keyResultId: string;
  title: string;
  score: number; // 0-100
  note: string;
}

export default function ReviewsPage() {
  const { t } = useTranslation();
  const isDark = useAppStore((s) => s.isDark);
  const theme = useAppStore((s) => s.theme);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [krTitleMap, setKrTitleMap] = useState<Record<string, string>>({});

  const typeLabel: Record<string, string> = { midterm: t('review.midterm'), final: t('review.final') };

  // ============ 数据加载 ============
  const loadKrTitles = useCallback(
    async (list: Review[]) => {
      const ids = Array.from(new Set(list.map((r) => r.objectiveId)));
      const map: Record<string, string> = {};
      await Promise.all(
        ids.map(async (id) => {
          try {
            const krs = await keyResultApi.listByObjective(id);
            krs.forEach((kr: KeyResult) => {
              map[kr.id] = kr.title;
            });
          } catch {
            // ignore
          }
        }),
      );
      setKrTitleMap((prev) => ({ ...prev, ...map }));
    },
    [],
  );

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      const list = await reviewApi.list();
      setReviews(list);
      await loadKrTitles(list);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [loadKrTitles]);

  const loadObjectives = useCallback(async () => {
    try {
      const res = await objectiveApi.list({ page: 1, pageSize: 200 });
      setObjectives(res.list);
    } catch {
      setObjectives([]);
    }
  }, []);

  useDidShow(() => {
    loadObjectives();
    loadReviews();
  });

  usePullDownRefresh(async () => {
    await loadReviews();
    Taro.stopPullDownRefresh();
  });

  const objectiveTitle = (id: string): string =>
    objectives.find((o) => o.id === id)?.title ?? '未知目标';

  const krTitle = (id: string): string => krTitleMap[id] ?? id;

  const scoreClass = (rating: number | null | undefined): string => {
    const v = rating ?? 0;
    if (v >= 0.7) return 'score-badge--success';
    if (v >= 0.4) return 'score-badge--warning';
    return 'score-badge--danger';
  };

  const scoreBarColor = (score: number): string => {
    if (score >= 0.7) return 'var(--success)';
    if (score >= 0.4) return 'var(--warning)';
    return 'var(--danger)';
  };

  // VisOKR 风格：自评 emoji
  const SELF_EMOJIS = [
    { emoji: '😣', label: '很不理想', min: 0 },
    { emoji: '😕', label: '不太满意', min: 40 },
    { emoji: '🙂', label: '还不错', min: 60 },
    { emoji: '😊', label: '很满意', min: 70 },
    { emoji: '🤩', label: '太棒了', min: 90 },
  ];

  const selfEmoji = (rating: number | null | undefined) => {
    const v = Math.round((rating ?? 0) * 100);
    let cur = SELF_EMOJIS[0];
    for (const e of SELF_EMOJIS) if (v >= e.min) cur = e;
    return cur;
  };

  // ============ 创建 / 编辑弹层 ============
  const [dialogVisible, setDialogVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formObjectiveId, setFormObjectiveId] = useState('');
  const [formType, setFormType] = useState<ReviewType>('midterm');
  const [krScores, setKrScores] = useState<KrScoreRow[]>([]);
  const [selfRating, setSelfRating] = useState(70);
  const [problems, setProblems] = useState('');
  const [solutions, setSolutions] = useState('');
  const [thoughts, setThoughts] = useState('');

  const objectiveLabels = useMemo(() => objectives.map((o) => o.title), [objectives]);
  const objectiveIndex = Math.max(0, objectives.findIndex((o) => o.id === formObjectiveId));

  const selectedObjective = objectives.find((o) => o.id === formObjectiveId);
  const canFinalReview =
    !!selectedObjective && (selectedObjective.status === 'pending_review' || selectedObjective.status === 'in_progress');

  const initKrScores = (krs: KeyResult[]) => {
    setKrScores(
      krs.map((kr) => {
        let progress = 0;
        if (kr.targetValue !== kr.initialValue) {
          progress = (kr.currentValue - kr.initialValue) / (kr.targetValue - kr.initialValue);
        }
        return {
          keyResultId: kr.id,
          title: kr.title,
          score: Math.max(0, Math.min(100, Math.round(progress * 100))),
          note: '',
        };
      }),
    );
  };

  const openCreate = () => {
    setEditingId(null);
    setFormObjectiveId('');
    setFormType('midterm');
    setKrScores([]);
    setSelfRating(70);
    setProblems('');
    setSolutions('');
    setThoughts('');
    setDialogVisible(true);
  };

  const handleObjectivePick = async (idx: number) => {
    const obj = objectives[idx];
    if (!obj) return;
    setFormObjectiveId(obj.id);
    try {
      const krs = await keyResultApi.listByObjective(obj.id);
      initKrScores(krs);
    } catch {
      initKrScores([]);
    }
  };

  const openEdit = (r: Review) => {
    setEditingId(r.id);
    setFormObjectiveId(r.objectiveId);
    setFormType(r.type);
    setKrScores(
      (r.krScores ?? []).map((s) => ({
        keyResultId: s.keyResultId,
        title: krTitle(s.keyResultId),
        score: Math.round(s.score * 100),
        note: s.note ?? '',
      })),
    );
    setSelfRating(Math.round((r.selfRating ?? 0) * 100));
    setProblems(r.problems ?? '');
    setSolutions(r.solutions ?? '');
    setThoughts(r.thoughts ?? '');
    setDialogVisible(true);
  };

  const handleSubmit = async () => {
    if (!editingId && !formObjectiveId) {
      Taro.showToast({ title: '请选择目标', icon: 'none' });
      return;
    }
    if (!krScores.length) {
      Taro.showToast({ title: '该目标没有关键结果，无法复盘', icon: 'none' });
      return;
    }
    if (formType === 'final' && !editingId && !canFinalReview) {
      Taro.showToast({ title: '目标需为「进行中」或「待复盘」才能期末复盘', icon: 'none' });
      return;
    }
    setSaving(true);
    try {
      const payloadKr = krScores.map((s) => ({
        keyResultId: s.keyResultId,
        score: s.score / 100,
        note: s.note || undefined,
      }));
      if (editingId) {
        // 期中复盘编辑：后端生成新版本
        await reviewApi.update(editingId, {
          krScores: payloadKr,
          selfRating: selfRating / 100,
          problems: problems || null,
          solutions: solutions || null,
          thoughts: thoughts || null,
        });
        Taro.showToast({ title: '复盘已更新（新版本）', icon: 'success' });
      } else {
        await reviewApi.create({
          objectiveId: formObjectiveId,
          type: formType,
          krScores: payloadKr,
          selfRating: selfRating / 100,
          problems: problems || undefined,
          solutions: solutions || undefined,
          thoughts: thoughts || undefined,
        });
        Taro.showToast({
          title: formType === 'final' ? '期末复盘完成，目标已结束' : '期中复盘已创建',
          icon: 'success',
        });
      }
      setDialogVisible(false);
      await loadObjectives();
      await loadReviews();
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : '操作失败';
      Taro.showToast({ title: msg, icon: 'none' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: Review) => {
    const res = await Taro.showModal({ title: t('common.notice'), content: '确定删除该复盘记录？' });
    if (!res.confirm) return;
    await reviewApi.remove(r.id);
    Taro.showToast({ title: '删除成功', icon: 'success' });
    await loadReviews();
  };

  const updateKrRow = (i: number, patch: Partial<KrScoreRow>) => {
    setKrScores(krScores.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };

  // ============ 渲染 ============
  return (
    <View className={`summit-page ${isDark ? 'summit-dark' : ''} ${theme !== 'light' ? 'theme-' + theme : ''}`}>
      <View className="page-container">
        <View className="r-header">
          <Text className="r-heading">{t('review.title')}</Text>
          <Text className="mini-btn mini-btn--primary" onClick={openCreate}>新建复盘</Text>
        </View>

        {loading && (
          <View className="summit-empty"><Text>{t('common.loading')}</Text></View>
        )}

        {!loading && !reviews.length && (
          <View className="summit-empty">
            <Text className="empty-icon">📝</Text>
            <Text>{t('review.empty')}</Text>
            <View className="summit-btn create-btn" onClick={openCreate}>立即创建</View>
          </View>
        )}

        {!loading &&
          reviews.map((r) => (
            <View key={r.id} className="summit-card">
              <View className="r-meta-row">
                <Text className={`summit-tag ${r.type === 'final' ? 'summit-tag--success' : 'summit-tag--warning'}`}>
                  {typeLabel[r.type] ?? r.type}
                </Text>
                <Text className="summit-tag">v{r.version}</Text>
                <Text className="obj-title">{objectiveTitle(r.objectiveId)}</Text>
                <Text className="summit-muted text-small">{dayjs(r.createdAt).format('YYYY-MM-DD HH:mm')}</Text>
              </View>

              {/* VisOKR 风格：大分数 + emoji 自评 */}
              <View className={`review-hero ${scoreClass(r.selfRating)}`}>
                <Text className="hero-emoji">{selfEmoji(r.selfRating).emoji}</Text>
                <Text className="hero-value">{Math.round((r.selfRating ?? 0) * 100)}</Text>
                <View className="hero-meta">
                  <Text className="hero-label">自评 · {selfEmoji(r.selfRating).label}</Text>
                  {r.objectiveScore != null && (
                    <Text className="hero-sub">目标得分 {r.objectiveScore}</Text>
                  )}
                </View>
              </View>

              {/* KR 评分明细 */}
              {(r.krScores?.length ?? 0) > 0 && (
                <View className="kr-scores">
                  {r.krScores.map((ks) => (
                    <View key={ks.keyResultId} className="kr-score-row">
                      <Text className="kr-score-title">{krTitle(ks.keyResultId)}</Text>
                      <View className="summit-progress flex-1">
                        <View
                          className="summit-progress__bar"
                          style={{
                            width: `${Math.round(ks.score * 100)}%`,
                            background: scoreBarColor(ks.score),
                          }}
                        />
                      </View>
                      <Text className="kr-score-value">{Math.round(ks.score * 100)}</Text>
                    </View>
                  ))}
                  {r.krScores.map((ks) =>
                    ks.note ? (
                      <Text key={`note-${ks.keyResultId}`} className="summit-muted text-small kr-note">· {ks.note}</Text>
                    ) : null,
                  )}
                </View>
              )}

              {r.problems && (
                <View className="review-section">
                  <Text className="review-section-label">问题</Text>
                  <Text className="review-section-content">{r.problems}</Text>
                </View>
              )}
              {r.solutions && (
                <View className="review-section">
                  <Text className="review-section-label">解决方案</Text>
                  <Text className="review-section-content">{r.solutions}</Text>
                </View>
              )}
              {r.thoughts && (
                <View className="review-section">
                  <Text className="review-section-label">感想</Text>
                  <Text className="review-section-content">{r.thoughts}</Text>
                </View>
              )}

              <View className="review-actions">
                {r.type === 'midterm' && (
                  <Text className="action-btn" onClick={() => openEdit(r)}>{t('common.edit')}</Text>
                )}
                <Text className="action-btn danger" onClick={() => handleDelete(r)}>{t('common.delete')}</Text>
              </View>
            </View>
          ))}
      </View>

      {/* 创建/编辑复盘弹层 */}
      {dialogVisible && (
        <View className="summit-overlay" onClick={() => setDialogVisible(false)}>
          <View className="sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="sheet-title">{editingId ? '编辑期中复盘' : '新建复盘'}</Text>

            {!editingId && (
              <View>
                <View className="form-item">
                  <Text className="form-label">选择目标 *</Text>
                  {!objectives.length && <Text className="summit-muted text-small">还没有目标，先去目标库创建</Text>}
                  {objectives.length > 0 && (
                    <Picker
                      mode="selector"
                      range={objectiveLabels}
                      value={objectiveIndex}
                      onChange={(e) => handleObjectivePick(Number(e.detail.value))}
                    >
                      <View className="field-picker">
                        <Text className={formObjectiveId ? '' : 'picker-placeholder'}>
                          {formObjectiveId ? objectiveTitle(formObjectiveId) : '选择要复盘的目标'}
                        </Text>
                        <Text className="summit-muted">▾</Text>
                      </View>
                    </Picker>
                  )}
                </View>
                <View className="form-item">
                  <Text className="form-label">复盘类型 *</Text>
                  <View className="seg">
                    <Text
                      className={`seg-item ${formType === 'midterm' ? 'seg-item--active' : ''}`}
                      onClick={() => setFormType('midterm')}
                    >
                      {t('review.midterm')}
                    </Text>
                    <Text
                      className={`seg-item ${formType === 'final' ? 'seg-item--active' : ''} ${!canFinalReview ? 'seg-item--disabled' : ''}`}
                      onClick={() => {
                        if (!canFinalReview) {
                          Taro.showToast({ title: '目标需为「进行中」或「待复盘」才能期末复盘', icon: 'none' });
                          return;
                        }
                        setFormType('final');
                      }}
                    >
                      {t('review.final')}
                    </Text>
                  </View>
                  {!canFinalReview && formType === 'final' && (
                    <Text className="summit-muted text-small seg-hint">目标需为「进行中」或「待复盘」才能期末复盘</Text>
                  )}
                </View>
              </View>
            )}

            {krScores.length > 0 ? (
              <View className="form-item">
                <Text className="form-label">KR 评分 *</Text>
                {krScores.map((ks, i) => (
                  <View key={ks.keyResultId} className="kr-scoring-item">
                    <View className="kr-scoring-head">
                      <Text className="kr-scoring-title">{ks.title}</Text>
                      <Text className="kr-scoring-value">{ks.score} 分</Text>
                    </View>
                    <Slider
                      min={0}
                      max={100}
                      step={5}
                      value={ks.score}
                      showValue={false}
                      activeColor="#409eff"
                      backgroundColor={isDark ? '#33363b' : '#e5e7eb'}
                      blockColor="#409eff"
                      onChange={(e) => updateKrRow(i, { score: e.detail.value })}
                    />
                    <Input
                      className="field-input kr-note-input"
                      value={ks.note}
                      placeholder="评分说明（可选）"
                      onInput={(e) => updateKrRow(i, { note: e.detail.value })}
                    />
                  </View>
                ))}
              </View>
            ) : (
              (formObjectiveId || editingId) && (
                <Text className="summit-muted text-small kr-empty-hint">该目标没有关键结果，无法复盘</Text>
              )
            )}

            <View className="form-item">
              <Text className="form-label">自我评分 *：{selfRating} 分</Text>
              <Slider
                min={0}
                max={100}
                step={1}
                value={selfRating}
                showValue={false}
                activeColor="#409eff"
                backgroundColor={isDark ? '#33363b' : '#e5e7eb'}
                blockColor="#409eff"
                onChange={(e) => setSelfRating(e.detail.value)}
              />
              <View className="health-line">
                <View className="health-tick" />
                <Text className="summit-muted text-small">70 分是健康的 OKR 分数</Text>
              </View>
            </View>
            <View className="form-item">
              <Text className="form-label">问题总结</Text>
              <Textarea
                className="field-textarea"
                value={problems}
                placeholder="遇到了什么问题？"
                maxlength={500}
                onInput={(e) => setProblems(e.detail.value)}
              />
            </View>
            <View className="form-item">
              <Text className="form-label">解决方案</Text>
              <Textarea
                className="field-textarea"
                value={solutions}
                placeholder="如何解决这些问题？"
                maxlength={500}
                onInput={(e) => setSolutions(e.detail.value)}
              />
            </View>
            <View className="form-item">
              <Text className="form-label">感想</Text>
              <Textarea
                className="field-textarea"
                value={thoughts}
                placeholder="写下你的感想"
                maxlength={500}
                onInput={(e) => setThoughts(e.detail.value)}
              />
            </View>
            <View className="row sheet-actions">
              <View className="summit-btn summit-btn--ghost flex-1" onClick={() => setDialogVisible(false)}>{t('common.cancel')}</View>
              <View className={`summit-btn flex-1 ${saving ? 'is-disabled' : ''}`} onClick={handleSubmit}>
                {saving ? t('common.loading') : editingId ? '保存新版本' : t('common.create')}
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
