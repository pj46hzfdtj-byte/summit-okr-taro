import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { View, Text, Input, Textarea, Picker } from '@tarojs/components';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import {
  aiApi,
  objectiveApi,
  keyResultApi,
  taskApi,
  goalGroupApi,
} from '@/lib/api';
import { CalculationTypeLabel } from '@/lib/types';
import type {
  AiPlanGoalResult,
  AiPlanTaskResult,
  AiSuggestScoreResult,
  AiUsageStat,
  GoalGroup,
  Objective,
} from '@/lib/types';
import { useAppStore } from '@/stores/app';
import './ai-assistant.scss';

type TabName = 'plan-goal' | 'plan-tasks' | 'suggest-score' | 'suggest-motivations';

const VALID_TABS: TabName[] = ['plan-goal', 'plan-tasks', 'suggest-score', 'suggest-motivations'];

const calcLabel = CalculationTypeLabel as Record<string, string>;

interface PickerOption {
  label: string;
  value: string;
}

function flattenGroups(nodes: GoalGroup[], prefix = ''): PickerOption[] {
  const out: PickerOption[] = [];
  for (const n of nodes) {
    out.push({ label: prefix + n.name, value: n.id });
    if (n.children?.length) out.push(...flattenGroups(n.children, prefix + n.name + ' / '));
  }
  return out;
}

/** 通用选择器行（Picker mode=selector） */
function SelectRow(props: {
  label: string;
  placeholder: string;
  options: PickerOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  const { label, placeholder, options, value, onChange } = props;
  const idx = options.findIndex((o) => o.value === value);
  return (
    <View className="ai-form-item">
      <Text className="ai-form-label">{label}</Text>
      <Picker
        mode="selector"
        range={options.map((o) => o.label)}
        value={idx >= 0 ? idx : 0}
        onChange={(e) => {
          const opt = options[Number(e.detail.value)];
          if (opt) onChange(opt.value);
        }}
      >
        <View className="ai-picker">
          <Text className={idx >= 0 ? 'ai-picker__text' : 'ai-picker__placeholder'}>
            {idx >= 0 ? options[idx].label : placeholder}
          </Text>
          <Text className="ai-picker__arrow">›</Text>
        </View>
      </Picker>
    </View>
  );
}

/** 勾选行 */
function CheckRow(props: { checked: boolean; onToggle: () => void; children: ReactNode }) {
  const { checked, onToggle, children } = props;
  return (
    <View className="ai-check-item" onClick={onToggle}>
      <Text className="ai-check-item__box">{checked ? '☑' : '☐'}</Text>
      <View className="ai-check-item__content">{children}</View>
    </View>
  );
}

export default function AiAssistantPage() {
  const { t } = useTranslation();
  const { theme, isDark } = useAppStore();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabName>('plan-goal');
  const [usage, setUsage] = useState<AiUsageStat | null>(null);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [groups, setGroups] = useState<PickerOption[]>([]);

  // ============ 规划目标 ============
  const [planGoalInput, setPlanGoalInput] = useState('');
  const [planGoalContext, setPlanGoalContext] = useState('');
  const [planGoalGroup, setPlanGoalGroup] = useState('');
  const [planGoalResult, setPlanGoalResult] = useState<AiPlanGoalResult | null>(null);
  const [planGoalLoading, setPlanGoalLoading] = useState(false);
  const [planGoalChecked, setPlanGoalChecked] = useState<Set<number>>(new Set());
  const [applyingGoal, setApplyingGoal] = useState(false);

  // ============ 拆解任务 ============
  const [planTaskObjective, setPlanTaskObjective] = useState('');
  const [planTaskContext, setPlanTaskContext] = useState('');
  const [planTaskResult, setPlanTaskResult] = useState<AiPlanTaskResult | null>(null);
  const [planTaskLoading, setPlanTaskLoading] = useState(false);
  const [planTaskChecked, setPlanTaskChecked] = useState<Set<number>>(new Set());
  const [applyingTasks, setApplyingTasks] = useState(false);

  // ============ 复盘评分 ============
  const [scoreObjective, setScoreObjective] = useState('');
  const [scoreResult, setScoreResult] = useState<AiSuggestScoreResult | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [krTitleMap, setKrTitleMap] = useState<Record<string, string>>({});

  // ============ 动机建议 ============
  const [motivationTitle, setMotivationTitle] = useState('');
  const [motivationContext, setMotivationContext] = useState('');
  const [motivationResult, setMotivationResult] = useState<string[]>([]);
  const [motivationLoading, setMotivationLoading] = useState(false);
  const [motivationChecked, setMotivationChecked] = useState<Set<number>>(new Set());
  const [motivationObjective, setMotivationObjective] = useState('');
  const [applyingMotivations, setApplyingMotivations] = useState(false);

  const objectiveOptions = useMemo<PickerOption[]>(
    () => objectives.map((o) => ({ label: o.title, value: o.id })),
    [objectives],
  );

  const usagePercent = usage
    ? Math.min(100, Math.round((usage.used / Math.max(usage.limit, 1)) * 100))
    : 0;

  const loadUsage = useCallback(async () => {
    try {
      setUsage(await aiApi.getUsage());
    } catch {
      // ignore
    }
  }, []);

  const loadObjectives = useCallback(async () => {
    try {
      const res = await objectiveApi.list({ page: 1, pageSize: 100 });
      setObjectives(res.list);
    } catch {
      // ignore
    }
  }, []);

  const loadGoalGroups = useCallback(async () => {
    try {
      const tree = await goalGroupApi.getTree();
      setGroups(flattenGroups(tree));
    } catch {
      // ignore
    }
  }, []);

  // 初始化 + 深链参数（tab / objectiveId）
  useEffect(() => {
    const qTab = router.params.tab as TabName | undefined;
    const qObj = router.params.objectiveId as string | undefined;
    if (qTab && VALID_TABS.includes(qTab)) setActiveTab(qTab);
    if (qObj) {
      setPlanTaskObjective(qObj);
      setScoreObjective(qObj);
      setMotivationObjective(qObj);
    }
    loadUsage();
    loadObjectives();
    loadGoalGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切换 tab 时若目标列表为空则补拉
  useEffect(() => {
    if (objectives.length === 0) loadObjectives();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const failToast = (e: any) => {
    Taro.showToast({ title: e?.message || t('ai.failed'), icon: 'none' });
  };

  const aiCall = async <T,>(fn: () => Promise<T>, loadingSetter: (v: boolean) => void): Promise<T | null> => {
    loadingSetter(true);
    Taro.showLoading({ title: 'AI 思考中...', mask: true });
    try {
      return await fn();
    } catch (e) {
      failToast(e);
      return null;
    } finally {
      Taro.hideLoading();
      loadingSetter(false);
    }
  };

  // ============ 规划目标 ============
  const runPlanGoal = async () => {
    if (!planGoalInput.trim()) {
      Taro.showToast({ title: t('ai.inputGoal'), icon: 'none' });
      return;
    }
    setPlanGoalResult(null);
    const res = await aiCall(
      () =>
        aiApi.planGoal({
          goal: planGoalInput.trim(),
          context: planGoalContext.trim() || undefined,
        }),
      setPlanGoalLoading,
    );
    if (res) {
      setPlanGoalResult(res);
      setPlanGoalChecked(new Set(res.keyResults.map((_, i) => i)));
      loadUsage();
    }
  };

  const toggleKr = (i: number) => {
    setPlanGoalChecked((prev) => {
      const s = new Set(prev);
      if (s.has(i)) s.delete(i);
      else s.add(i);
      return s;
    });
  };

  const applyPlanGoal = async () => {
    if (!planGoalResult) return;
    if (!planGoalGroup) {
      Taro.showToast({ title: t('ai.selectGroup'), icon: 'none' });
      return;
    }
    const krs = planGoalResult.keyResults.filter((_, i) => planGoalChecked.has(i));
    if (!krs.length) {
      Taro.showToast({ title: t('ai.selectKr'), icon: 'none' });
      return;
    }
    setApplyingGoal(true);
    try {
      const obj = await objectiveApi.create({
        goalGroupId: planGoalGroup,
        title: planGoalResult.objective.title,
        motivations: planGoalResult.objective.motivations,
        feasibilities: planGoalResult.objective.feasibilities,
      });
      for (const kr of krs) {
        await keyResultApi.create({
          objectiveId: obj.id,
          title: kr.title,
          initialValue: kr.initialValue,
          targetValue: kr.targetValue,
          calculationType: kr.calculationType,
          emoji: kr.emoji,
          weight: kr.weight,
        });
      }
      Taro.showToast({ title: '已创建目标与 KR', icon: 'success' });
      setPlanGoalResult(null);
      setPlanGoalInput('');
      loadObjectives();
    } catch (e: any) {
      failToast(e);
    } finally {
      setApplyingGoal(false);
    }
  };

  // ============ 拆解任务 ============
  const runPlanTasks = async () => {
    if (!planTaskObjective && !planTaskContext.trim()) {
      Taro.showToast({ title: '请选择目标或填写背景', icon: 'none' });
      return;
    }
    setPlanTaskResult(null);
    const res = await aiCall(
      () =>
        aiApi.planTasks({
          objectiveId: planTaskObjective || undefined,
          context: planTaskContext.trim() || undefined,
        }),
      setPlanTaskLoading,
    );
    if (res) {
      setPlanTaskResult(res);
      setPlanTaskChecked(new Set(res.tasks.map((_, i) => i)));
      loadUsage();
    }
  };

  const toggleTask = (i: number) => {
    setPlanTaskChecked((prev) => {
      const s = new Set(prev);
      if (s.has(i)) s.delete(i);
      else s.add(i);
      return s;
    });
  };

  const applyPlanTasks = async () => {
    if (!planTaskResult) return;
    const tasks = planTaskResult.tasks.filter((_, i) => planTaskChecked.has(i));
    if (!tasks.length) {
      Taro.showToast({ title: t('ai.selectTask'), icon: 'none' });
      return;
    }
    setApplyingTasks(true);
    try {
      for (const tk of tasks) {
        await taskApi.create({
          objectiveId: planTaskObjective || null,
          title: tk.title,
          description: tk.description,
          scheduledAt: tk.scheduledAt,
          repeatRule: tk.repeatRule,
          contribution: tk.contribution,
        });
      }
      Taro.showToast({ title: `已创建 ${tasks.length} 个任务`, icon: 'success' });
      setPlanTaskResult(null);
      setPlanTaskContext('');
    } catch (e: any) {
      failToast(e);
    } finally {
      setApplyingTasks(false);
    }
  };

  // ============ 复盘评分 ============
  const runSuggestScore = async () => {
    if (!scoreObjective) {
      Taro.showToast({ title: t('ai.selectObjective'), icon: 'none' });
      return;
    }
    setScoreResult(null);
    const res = await aiCall(() => aiApi.suggestScore(scoreObjective), setScoreLoading);
    if (res) {
      setScoreResult(res);
      loadUsage();
      // 加载该目标的 KR 标题，便于展示
      try {
        const obj = await objectiveApi.getById(scoreObjective);
        const map: Record<string, string> = {};
        (obj.keyResults ?? []).forEach((kr) => {
          map[kr.id] = kr.title;
        });
        setKrTitleMap(map);
      } catch {
        setKrTitleMap({});
      }
    }
  };

  const krTitleOf = (krId: string) => krTitleMap[krId] || `KR ${krId.slice(0, 8)}`;

  // ============ 动机建议 ============
  const runMotivations = async () => {
    if (!motivationTitle.trim()) {
      Taro.showToast({ title: t('ai.inputTitle'), icon: 'none' });
      return;
    }
    setMotivationResult([]);
    const res = await aiCall(
      () =>
        aiApi.suggestMotivations({
          objectiveTitle: motivationTitle.trim(),
          context: motivationContext.trim() || undefined,
        }),
      setMotivationLoading,
    );
    if (res) {
      setMotivationResult(res.motivations);
      setMotivationChecked(new Set(res.motivations.map((_, i) => i)));
      loadUsage();
    }
  };

  const toggleMotivation = (i: number) => {
    setMotivationChecked((prev) => {
      const s = new Set(prev);
      if (s.has(i)) s.delete(i);
      else s.add(i);
      return s;
    });
  };

  const applyMotivations = async () => {
    if (!motivationObjective) {
      Taro.showToast({ title: '请选择应用到的目标', icon: 'none' });
      return;
    }
    const picked = motivationResult.filter((_, i) => motivationChecked.has(i));
    if (!picked.length) {
      Taro.showToast({ title: t('ai.selectMotivation'), icon: 'none' });
      return;
    }
    setApplyingMotivations(true);
    try {
      const obj = objectives.find((o) => o.id === motivationObjective);
      const merged = Array.from(new Set([...(obj?.motivations ?? []), ...picked]));
      await objectiveApi.update(motivationObjective, { motivations: merged });
      Taro.showToast({ title: '动机已追加', icon: 'success' });
      setMotivationResult([]);
      setMotivationTitle('');
      await loadObjectives();
    } catch (e: any) {
      failToast(e);
    } finally {
      setApplyingMotivations(false);
    }
  };

  // ============ 渲染 ============
  const tabs: { key: TabName; label: string }[] = [
    { key: 'plan-goal', label: t('ai.planGoal') },
    { key: 'plan-tasks', label: t('ai.planTasks') },
    { key: 'suggest-score', label: t('ai.suggestScore') },
    { key: 'suggest-motivations', label: t('ai.suggestMotivations') },
  ];

  return (
    <View className={`summit-page ${isDark ? 'summit-dark' : ''} ${theme !== 'light' ? 'theme-' + theme : ''}`}>
      <View className="ai-container">
        <View className="ai-header">
          <Text className="ai-header__title">{t('nav.ai')}</Text>
          {usage && (
            <Text className={`summit-tag ${usage.used >= usage.limit ? 'summit-tag--danger' : ''}`}>
              今日额度 {usage.used}/{usage.limit}
            </Text>
          )}
        </View>

        {/* 每日用量 */}
        {usage && (
          <View className="summit-card ai-usage-card">
            <View className="ai-usage-head">
              <Text className="summit-muted ai-small">每日 AI 用量</Text>
              <Text className={`ai-small ${usagePercent >= 100 ? 'ai-danger' : 'ai-primary'}`}>
                {usagePercent}%
              </Text>
            </View>
            <View className="summit-progress">
              <View
                className="summit-progress__bar"
                style={{
                  width: `${usagePercent}%`,
                  background: usagePercent >= 100 ? 'var(--danger)' : 'var(--primary)',
                }}
              />
            </View>
            <Text className="summit-muted ai-small ai-usage-reset">
              {dayjs(usage.resetAt).format('MM-DD HH:mm')} 重置
            </Text>
          </View>
        )}

        <View className="summit-card">
          {/* 自绘 tabs */}
          <View className="ai-tabs">
            {tabs.map((tab) => (
              <View
                key={tab.key}
                className={`ai-tabs__item${activeTab === tab.key ? ' ai-tabs__item--active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <Text>{tab.label}</Text>
              </View>
            ))}
          </View>

          {/* ============ 规划目标 ============ */}
          {activeTab === 'plan-goal' && (
            <View className="ai-tab-body">
              <View className="ai-form-item">
                <Text className="ai-form-label">{t('ai.bigGoal')}</Text>
                <Input
                  className="ai-form-input"
                  value={planGoalInput}
                  placeholder={t('ai.bigGoalPlaceholder')}
                  onInput={(e) => setPlanGoalInput(e.detail.value)}
                />
              </View>
              <View className="ai-form-item">
                <Text className="ai-form-label">{t('ai.context')}（可选）</Text>
                <Textarea
                  className="ai-form-textarea"
                  value={planGoalContext}
                  placeholder={t('ai.contextPlaceholder')}
                  onInput={(e) => setPlanGoalContext(e.detail.value)}
                />
              </View>
              <SelectRow
                label={t('ai.applyTo')}
                placeholder={t('ai.selectGroup')}
                options={groups}
                value={planGoalGroup}
                onChange={setPlanGoalGroup}
              />
              <View
                className={`summit-btn${planGoalLoading ? ' summit-btn--disabled' : ''}`}
                onClick={runPlanGoal}
              >
                <Text>{planGoalLoading ? t('common.loading') : '生成规划'}</Text>
              </View>

              {planGoalResult && (
                <View className="ai-result-block">
                  <Text className="ai-result-title">{planGoalResult.objective.title}</Text>
                  {planGoalResult.objective.motivations?.length ? (
                    <View className="ai-tag-wrap">
                      {planGoalResult.objective.motivations.map((m, i) => (
                        <Text key={'m' + i} className="summit-tag summit-tag--success">
                          {m}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {planGoalResult.objective.feasibilities?.length ? (
                    <View className="ai-tag-wrap ai-tag-wrap--gap">
                      {planGoalResult.objective.feasibilities.map((f, i) => (
                        <Text key={'f' + i} className="summit-tag">
                          {f}
                        </Text>
                      ))}
                    </View>
                  ) : null}

                  <Text className="ai-section-label">关键结果（勾选要采纳的）</Text>
                  {planGoalResult.keyResults.map((kr, i) => (
                    <CheckRow key={i} checked={planGoalChecked.has(i)} onToggle={() => toggleKr(i)}>
                      <Text className="ai-check-title">{kr.title}</Text>
                      <Text className="summit-muted ai-small">
                        {kr.initialValue} → {kr.targetValue} · {calcLabel[kr.calculationType] ?? kr.calculationType}
                        {kr.weight != null ? ` · 权重 ${kr.weight}` : ''}
                      </Text>
                    </CheckRow>
                  ))}
                  <View
                    className={`summit-btn summit-btn--ghost ai-apply-btn${applyingGoal ? ' summit-btn--disabled' : ''}`}
                    onClick={applyPlanGoal}
                  >
                    <Text>{applyingGoal ? t('common.loading') : '应用（创建目标 + KR）'}</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ============ 拆解任务 ============ */}
          {activeTab === 'plan-tasks' && (
            <View className="ai-tab-body">
              <SelectRow
                label={t('ai.objective')}
                placeholder="选择要拆解的目标"
                options={objectiveOptions}
                value={planTaskObjective}
                onChange={setPlanTaskObjective}
              />
              <View className="ai-form-item">
                <Text className="ai-form-label">{t('ai.context')}（可选）</Text>
                <Textarea
                  className="ai-form-textarea"
                  value={planTaskContext}
                  maxlength={-1}
                  placeholder="如：本周可投入 10 小时"
                  onInput={(e) => setPlanTaskContext(e.detail.value)}
                />
              </View>
              <View className={`summit-btn${planTaskLoading ? ' summit-btn--disabled' : ''}`} onClick={runPlanTasks}>
                <Text>{planTaskLoading ? t('common.loading') : '拆解任务'}</Text>
              </View>

              {planTaskResult && (
                <View className="ai-result-block">
                  <Text className="ai-section-label">任务清单（勾选要采纳的）</Text>
                  {planTaskResult.tasks.map((tk, i) => (
                    <CheckRow key={i} checked={planTaskChecked.has(i)} onToggle={() => toggleTask(i)}>
                      <Text className="ai-check-title">{tk.title}</Text>
                      {tk.description ? <Text className="summit-muted ai-small">{tk.description}</Text> : null}
                      {tk.contribution ? <Text className="ai-primary ai-small">贡献：{tk.contribution}</Text> : null}
                    </CheckRow>
                  ))}
                  <View
                    className={`summit-btn summit-btn--ghost ai-apply-btn${applyingTasks ? ' summit-btn--disabled' : ''}`}
                    onClick={applyPlanTasks}
                  >
                    <Text>{applyingTasks ? t('common.loading') : '应用（创建任务）'}</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ============ 复盘评分 ============ */}
          {activeTab === 'suggest-score' && (
            <View className="ai-tab-body">
              <SelectRow
                label={t('ai.objective')}
                placeholder="选择要评分的目标"
                options={objectiveOptions}
                value={scoreObjective}
                onChange={setScoreObjective}
              />
              <View className={`summit-btn${scoreLoading ? ' summit-btn--disabled' : ''}`} onClick={runSuggestScore}>
                <Text>{scoreLoading ? t('common.loading') : '生成评分建议'}</Text>
              </View>

              {scoreResult && (
                <View className="ai-result-block">
                  <View className="ai-score-banner">
                    <Text className="ai-score-banner__label">自评建议</Text>
                    <Text className="ai-score-banner__value">{Math.round(scoreResult.selfRating * 100)}%</Text>
                  </View>
                  {scoreResult.reasoning ? <Text className="ai-reasoning">{scoreResult.reasoning}</Text> : null}
                  <Text className="ai-section-label">KR 评分建议</Text>
                  {scoreResult.krScores.map((s, i) => (
                    <View key={i} className="ai-kr-score-item">
                      <View className="ai-row-between">
                        <Text className="ai-check-title">{krTitleOf(s.keyResultId)}</Text>
                        <Text className="ai-primary ai-score-value">{Math.round(s.score * 100)}%</Text>
                      </View>
                      <View className="summit-progress ai-kr-progress">
                        <View className="summit-progress__bar" style={{ width: `${Math.round(s.score * 100)}%` }} />
                      </View>
                      {s.note ? <Text className="summit-muted ai-small">{s.note}</Text> : null}
                    </View>
                  ))}
                  <Text className="summit-muted ai-small ai-score-hint">
                    评分建议仅供参考，请到目标详情页创建复盘时手动采纳。
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ============ 动机建议 ============ */}
          {activeTab === 'suggest-motivations' && (
            <View className="ai-tab-body">
              <View className="ai-form-item">
                <Text className="ai-form-label">{t('ai.objectiveTitle')}</Text>
                <Input
                  className="ai-form-input"
                  value={motivationTitle}
                  placeholder="如：三个月内跑完半程马拉松"
                  onInput={(e) => setMotivationTitle(e.detail.value)}
                />
              </View>
              <View className="ai-form-item">
                <Text className="ai-form-label">{t('ai.context')}（可选）</Text>
                <Textarea
                  className="ai-form-textarea"
                  value={motivationContext}
                  maxlength={-1}
                  placeholder="为什么想做这个目标？"
                  onInput={(e) => setMotivationContext(e.detail.value)}
                />
              </View>
              <View className={`summit-btn${motivationLoading ? ' summit-btn--disabled' : ''}`} onClick={runMotivations}>
                <Text>{motivationLoading ? t('common.loading') : '生成动机建议'}</Text>
              </View>

              {motivationResult.length > 0 && (
                <View className="ai-result-block">
                  <Text className="ai-section-label">动机建议（勾选要采纳的）</Text>
                  {motivationResult.map((m, i) => (
                    <CheckRow key={i} checked={motivationChecked.has(i)} onToggle={() => toggleMotivation(i)}>
                      <Text className="ai-check-title">{m}</Text>
                    </CheckRow>
                  ))}
                  <SelectRow
                    label={t('ai.applyTo')}
                    placeholder={t('ai.selectObjective')}
                    options={objectiveOptions}
                    value={motivationObjective}
                    onChange={setMotivationObjective}
                  />
                  <View
                    className={`summit-btn summit-btn--ghost${applyingMotivations ? ' summit-btn--disabled' : ''}`}
                    onClick={applyMotivations}
                  >
                    <Text>{applyingMotivations ? t('common.loading') : '应用（追加到动机）'}</Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
