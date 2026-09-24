import { useCallback, useEffect, useState } from 'react';
import { View, Text, Textarea, Input } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { useTranslation } from 'react-i18next';
import { summaryApi, checkinApi, recordApi } from '@/lib/api';
import type { CheckInStatus, KeyResult, SummaryData } from '@/lib/types';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import './summary.scss';

function fmtMD(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

function fmtHM(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mi}`;
}

const KPI_CARDS = [
  { key: 'totalObjectives', labelKey: 'summary.totalObjectives', emoji: '🎯', color: '#409eff' },
  { key: 'inProgressObjectives', labelKey: 'summary.inProgress', emoji: '📈', color: '#5ac8fa' },
  { key: 'completedObjectives', labelKey: 'summary.reviewed', emoji: '✅', color: '#67c23a' },
  { key: 'laggingCount', labelKey: 'summary.lagging', emoji: '⚠️', color: '#f56c6c' },
] as const;

/** VisOKR 风格顶部统计行 */
const STAT_ROW = [
  { key: 'records', emoji: '📝', label: '今日添加记录', color: 'var(--primary)' },
  { key: 'progress', emoji: '🎯', label: '进行中目标', color: 'var(--success)' },
  { key: 'tasks', emoji: '🔔', label: '今日任务', color: 'var(--danger)' },
] as const;

export default function SummaryPage() {
  const { t } = useTranslation();
  const isDark = useAppStore((s) => s.isDark);
  const theme = useAppStore((s) => s.theme);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);

  // 每周 Check-in
  const [checkin, setCheckin] = useState<CheckInStatus | null>(null);
  const [checkinNote, setCheckinNote] = useState('');
  const [checkinSubmitting, setCheckinSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      Taro.reLaunch({ url: '/pages/auth/login' });
    }
  }, [isAuthenticated]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await summaryApi.get());
    } catch {
      // http 层已 toast
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCheckin = useCallback(async () => {
    try {
      const status = await checkinApi.status();
      setCheckin(status);
      setCheckinNote(status.checkIn?.note ?? '');
    } catch {
      // ignore
    }
  }, []);

  const load = useCallback(async () => {
    await Promise.all([loadSummary(), loadCheckin()]);
  }, [loadSummary, loadCheckin]);

  useDidShow(() => {
    if (!useAuthStore.getState().isAuthenticated) return;
    load();
  });

  usePullDownRefresh(async () => {
    try {
      await load();
    } finally {
      Taro.stopPullDownRefresh();
    }
  });

  async function submitCheckin() {
    if (checkinSubmitting) return;
    setCheckinSubmitting(true);
    try {
      await checkinApi.upsertThisWeek(checkinNote.trim() || undefined);
      Taro.showToast({ title: '本周打卡完成，继续保持！', icon: 'success' });
      await loadCheckin();
    } catch {
      // http 层已 toast
    } finally {
      setCheckinSubmitting(false);
    }
  }

  const checkinRatio =
    checkin && checkin.totalActiveKrCount
      ? Math.min(1, checkin.krUpdatedCount / checkin.totalActiveKrCount)
      : 0;

  function getKpiValue(key: string): number {
    if (!summary) return 0;
    if (key === 'laggingCount') return summary.laggingObjectives.length;
    return (summary as unknown as Record<string, number>)[key] ?? 0;
  }

  function goFocus() {
    Taro.navigateTo({ url: '/pages/focus/focus' });
  }

  function goObjective(id: string) {
    Taro.navigateTo({ url: '/pages/goals/objective-detail?id=' + id });
  }

  function goTasks() {
    Taro.switchTab({ url: '/pages/tasks/tasks' });
  }

  // ============ VisOKR 统计行取值 ============
  function getStatValue(key: string): number {
    if (!summary) return 0;
    if (key === 'records') return summary.todayAddedRecords ?? 0;
    if (key === 'progress') return summary.inProgressObjectives;
    return summary.todayTaskCount ?? summary.todayTasks.length;
  }

  // ============ 周期圆环 ============
  const cycleScore = summary?.activeFocusCycle?.cycleScore ?? 0;
  const todayDelta =
    summary?.todayProgressDelta != null
      ? (summary.todayProgressDelta * 100).toFixed(1).replace(/\.0$/, '')
      : '0';

  // ============ KR 记录快捷添加 ============
  const [recordKr, setRecordKr] = useState<KeyResult | null>(null);
  const [recordValue, setRecordValue] = useState(0);
  const [recordNote, setRecordNote] = useState('');
  const [recordSubmitting, setRecordSubmitting] = useState(false);

  function openRecordDialog(kr: KeyResult) {
    setRecordKr(kr);
    setRecordValue(kr.currentValue ?? 0);
    setRecordNote('');
  }

  async function submitRecord() {
    if (!recordKr || recordSubmitting) return;
    setRecordSubmitting(true);
    try {
      await recordApi.create({
        keyResultId: recordKr.id,
        value: recordValue,
        note: recordNote.trim() || undefined,
      });
      Taro.showToast({ title: '记录已添加', icon: 'success' });
      setRecordKr(null);
      await loadSummary();
    } catch {
      // http 层已 toast
    } finally {
      setRecordSubmitting(false);
    }
  }

  const weekEndMinus1 = (() => {
    if (!checkin) return '';
    const d = new Date(checkin.weekEnd);
    if (Number.isNaN(d.getTime())) return '';
    d.setDate(d.getDate() - 1);
    return fmtMD(d);
  })();

  return (
    <View className={`summit-page summary-page ${isDark ? 'summit-dark' : ''} ${theme !== 'light' ? 'theme-' + theme : ''}`}>
      <View className="page-container">
        {/* VisOKR 风格统计行 */}
        <View className="stat-row">
          {STAT_ROW.map((st) => (
            <View
              key={st.key}
              className="stat-item"
              onClick={st.key === 'tasks' ? goTasks : undefined}
            >
              <Text className="stat-emoji" style={{ color: st.color }}>{st.emoji}</Text>
              <Text className="stat-value">{getStatValue(st.key)}</Text>
              <Text className="stat-label">{st.label}</Text>
            </View>
          ))}
        </View>

        {/* KPI 四宫格 */}
        <View className="kpi-grid">
          {KPI_CARDS.map((kpi) => (
            <View key={kpi.key} className="kpi-card">
              <View className="kpi-icon" style={{ background: kpi.color + '22', color: kpi.color }}>
                <Text>{kpi.emoji}</Text>
              </View>
              <Text className="kpi-value">{getKpiValue(kpi.key)}</Text>
              <Text className="kpi-label">{t(kpi.labelKey)}</Text>
            </View>
          ))}
        </View>

        {/* 随机动机 */}
        {summary?.randomMotivation && (
          <View className="motivation-banner">
            <Text className="motivation-quote">"</Text>
            <Text className="motivation-text">{summary.randomMotivation}</Text>
          </View>
        )}

        {/* 每周 Check-in */}
        {checkin && (
          <View className="summit-card">
            <View className="card-title">
              <Text>🔔 每周 Check-in</Text>
              <Text className={`summit-tag ${checkin.done ? 'summit-tag--success' : 'summit-tag--warning'}`}>
                {checkin.done ? '本周已打卡' : '本周未打卡'}
              </Text>
            </View>
            <View className="checkin-stats">
              <View className="checkin-stat">
                <Text className="stat-value">
                  {checkin.krUpdatedCount}/{checkin.totalActiveKrCount}
                </Text>
                <Text className="stat-label">本周已更新的 KR</Text>
              </View>
              <View className="checkin-stat">
                <Text className="stat-value">
                  {fmtMD(checkin.weekStart)}-{weekEndMinus1}
                </Text>
                <Text className="stat-label">本周周期</Text>
              </View>
              <View className="checkin-stat">
                <Text className="stat-value">🔥 {checkin.streak}</Text>
                <Text className="stat-label">连续打卡周数</Text>
              </View>
            </View>
            <View className="summit-progress checkin-progress">
              <View
                className="summit-progress__bar"
                style={{
                  width: Math.round(checkinRatio * 100) + '%',
                  background: checkinRatio >= 0.6 ? 'var(--success)' : 'var(--primary)',
                }}
              />
            </View>
            <Textarea
              className="checkin-note"
              value={checkinNote}
              onInput={(e) => setCheckinNote(e.detail.value)}
              placeholder="本周进展一句话总结，或记录遇到的困难（可选）"
              maxlength={200}
            />
            <View
              className={`summit-btn ${checkinSubmitting ? 'summit-btn--loading' : ''}`}
              onClick={submitCheckin}
            >
              <Text>{checkinSubmitting ? '提交中...' : checkin.done ? '更新打卡' : '完成打卡'}</Text>
            </View>
          </View>
        )}

        {/* 活跃专注周期（VisOKR 圆环 + KR chips） */}
        {summary?.activeFocusCycle && (
          <View className="summit-card cycle-card">
            <View className="card-title" onClick={goFocus}>
              <Text>🎯 {summary.activeFocusCycle.name}</Text>
              <Text className="link-primary">管理 ›</Text>
            </View>
            <View className="cycle-period">
              {fmtMD(summary.activeFocusCycle.startAt)} → {fmtMD(summary.activeFocusCycle.endAt)}
              {summary.cycleDaysRemaining != null && (
                <Text className={`cycle-days ${summary.cycleDaysRemaining <= 7 ? 'is-urgent' : ''}`}>
                  剩余 {summary.cycleDaysRemaining} 天
                </Text>
              )}
            </View>

            <View className="cycle-body">
              {/* 圆环 */}
              <View className="cycle-ring-wrap">
                <View className="cycle-ring">
                  <View className="cycle-ring__track" />
                  <View
                    className="cycle-ring__fill"
                    style={{
                      background: `conic-gradient(var(--primary) ${cycleScore}%, transparent 0)`,
                    }}
                  />
                  <View className="cycle-ring__inner">
                    <Text className="cycle-ring__value">
                      {cycleScore}
                      <Text className="cycle-ring__unit">%</Text>
                    </Text>
                    <Text className="cycle-ring__label">周期进度</Text>
                  </View>
                </View>
              </View>
              {/* 侧栏统计 */}
              <View className="cycle-side">
                <View className="cycle-side-item">
                  <Text className="cycle-side-value">
                    {todayDelta}
                    <Text className="cycle-side-unit">%</Text>
                  </Text>
                  <Text className="cycle-side-label">今日增加进度</Text>
                </View>
                <View className="cycle-side-item">
                  <Text className="cycle-side-value">
                    {summary.activeFocusCycle.objectives.length}
                    <Text className="cycle-side-unit">个</Text>
                  </Text>
                  <Text className="cycle-side-label">进行中目标</Text>
                </View>
              </View>
            </View>

            {/* 目标 + KR chips */}
            <View className="cycle-objectives">
              {summary.activeFocusCycle.objectives.map((oco) => (
                <View key={oco.objectiveId} className="cycle-obj">
                  <View className="cycle-obj-head" onClick={() => goObjective(oco.objectiveId)}>
                    <View className="status-dot" style={{ background: oco.objective?.color || 'var(--primary)' }} />
                    <Text className="cycle-obj-title">{oco.objective?.title}</Text>
                    <Text className="cycle-obj-percent" style={{ color: oco.objective?.color }}>
                      {Math.round((oco.objective?.currentProgress ?? 0) * 100)}%
                    </Text>
                  </View>
                  <View className="cycle-obj-bar">
                    <View
                      className="cycle-obj-bar__fill"
                      style={{
                        width: Math.round((oco.objective?.currentProgress ?? 0) * 100) + '%',
                        background: oco.objective?.color || 'var(--primary)',
                      }}
                    />
                  </View>
                  <View className="kr-chips">
                    {(oco.objective?.keyResults ?? []).map((kr) => (
                      <View
                        key={kr.id}
                        className="kr-chip"
                        style={{
                          background: (oco.objective?.color || '#409eff') + '14',
                          borderColor: (oco.objective?.color || '#409eff') + '55',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openRecordDialog(kr);
                        }}
                      >
                        <Text className="kr-chip-title">
                          {kr.emoji} {kr.title}
                        </Text>
                        <View className="kr-chip-foot">
                          <Text className="kr-chip-range">
                            {kr.initialValue} → {kr.targetValue}
                          </Text>
                          <Text className="kr-chip-add">＋</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 今日任务 */}
        {summary?.todayTasks.length ? (
          <View className="summit-card">
            <View className="card-title">
              <Text>📋 {t('summary.todayTasks')}</Text>
              <Text className="summit-tag">{summary.todayTasks.length}</Text>
            </View>
            {summary.todayTasks.map((task) => (
              <View key={task.id} className="list-row" onClick={goTasks}>
                <View className={`task-check ${task.status === 'completed' ? 'is-done' : ''}`}>
                  {task.status === 'completed' && <Text>✓</Text>}
                </View>
                <Text className={`flex-1 ${task.status === 'completed' ? 'task-done-text' : ''}`}>
                  {task.title}
                </Text>
                {task.scheduledAt && <Text className="task-time summit-muted text-small">{fmtHM(task.scheduledAt)}</Text>}
              </View>
            ))}
          </View>
        ) : null}

        {/* 滞后目标 */}
        {summary?.laggingObjectives.length ? (
          <View className="summit-card">
            <View className="card-title">
              <Text className="danger-text">⚠️ {t('summary.lagging')}</Text>
            </View>
            {summary.laggingObjectives.map((obj) => (
              <View key={obj.id} className="list-row" onClick={() => goObjective(obj.id)}>
                <View className="status-dot" style={{ background: obj.color || 'var(--primary)' }} />
                <Text className="flex-1 obj-name">{obj.title}</Text>
                <View className="obj-progress">
                  <View className="summit-progress">
                    <View
                      className="summit-progress__bar"
                      style={{
                        width: Math.round((obj.currentProgress ?? 0) * 100) + '%',
                        background: 'var(--warning)',
                      }}
                    />
                  </View>
                </View>
                <Text className="obj-percent warning-text text-small">
                  {Math.round((obj.currentProgress ?? 0) * 100)}%
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {!loading && !summary && (
          <View className="summit-empty">
            <Text>暂无数据</Text>
          </View>
        )}
      </View>

      {/* KR 快捷记录弹层 */}
      {recordKr && (
        <View className="summit-overlay" onClick={() => setRecordKr(null)}>
          <View className="sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="sheet-title">
              添加记录 · {recordKr.emoji} {recordKr.title}
            </Text>
            <View className="form-item">
              <Text className="form-label">数值（{recordKr.initialValue} → {recordKr.targetValue}）</Text>
              <Input
                type="digit"
                className="field-input"
                value={String(recordValue)}
                onInput={(e) => setRecordValue(Number(e.detail.value) || 0)}
              />
            </View>
            <View className="form-item">
              <Text className="form-label">备注（可选）</Text>
              <Input
                className="field-input"
                value={recordNote}
                placeholder="记录说明"
                onInput={(e) => setRecordNote(e.detail.value)}
              />
            </View>
            <View className="row sheet-actions">
              <View className="summit-btn summit-btn--ghost flex-1" onClick={() => setRecordKr(null)}>
                {t('common.cancel')}
              </View>
              <View
                className={`summit-btn flex-1 ${recordSubmitting ? 'summit-btn--loading' : ''}`}
                onClick={submitRecord}
              >
                <Text>{recordSubmitting ? '提交中...' : '添加'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
