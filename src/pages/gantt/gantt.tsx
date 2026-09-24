import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { ganttApi } from '@/lib/api';
import type { GanttData, GanttItem } from '@/lib/types';
import { useAppStore } from '@/stores/app';
import './gantt.scss';

const PX_PER_DAY = 20;

export default function GanttPage() {
  const { t } = useTranslation();
  const isDark = useAppStore((s) => s.isDark);
  const theme = useAppStore((s) => s.theme);

  const [ganttData, setGanttData] = useState<GanttData | null>(null);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<'all' | 'cycle'>('all');

  const loadGantt = useCallback(async (s: 'all' | 'cycle') => {
    setLoading(true);
    try {
      setGanttData(await ganttApi.get({ scope: s }));
    } catch {
      setGanttData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGantt(scope);
  }, [scope, loadGantt]);

  const items = useMemo<GanttItem[]>(() => ganttData?.items ?? [], [ganttData]);

  // ============ 状态过滤 Tab（VisOKR 风格） ============
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'lagging' | 'completed'>('all');

  const statusCounts = useMemo(
    () => ({
      all: items.length,
      active: items.filter((i) => i.status === 'in_progress' || i.status === 'pending_review').length,
      lagging: items.filter((i) => i.isLagging).length,
      completed: items.filter((i) => i.status === 'completed').length,
    }),
    [items],
  );

  const filteredItems = useMemo(() => {
    switch (statusFilter) {
      case 'active':
        return items.filter((i) => i.status === 'in_progress' || i.status === 'pending_review');
      case 'lagging':
        return items.filter((i) => i.isLagging);
      case 'completed':
        return items.filter((i) => i.status === 'completed');
      default:
        return items;
    }
  }, [items, statusFilter]);

  const statusTabs = useMemo(
    () => [
      { key: 'all' as const, label: '全部' },
      { key: 'active' as const, label: '进行中' },
      { key: 'lagging' as const, label: '滞后' },
      { key: 'completed' as const, label: '已完成' },
    ],
    [],
  );

  const timeline = useMemo(() => {
    if (!items.length || !ganttData) return null;
    const start = dayjs(ganttData.rangeStart);
    const end = dayjs(ganttData.rangeEnd);
    const totalDays = Math.max(end.diff(start, 'day') + 1, 1);
    const todayOffset = dayjs(ganttData.todayLine).startOf('day').diff(start, 'day', true) + 0.5;
    // 时间轴刻度：每月起点 + 月中
    const ticks: { label: string; offset: number; major: boolean }[] = [];
    let cursor = start.startOf('month');
    while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
      const offset = cursor.diff(start, 'day');
      if (offset >= 0) {
        ticks.push({ label: cursor.format('M月'), offset, major: true });
        const half = cursor.add(15, 'day');
        const halfOffset = half.diff(start, 'day');
        if (halfOffset >= 0 && halfOffset < totalDays) {
          ticks.push({ label: half.format('D日'), offset: halfOffset, major: false });
        }
      }
      cursor = cursor.add(1, 'month');
    }
    return { start, totalDays, todayOffset, ticks, width: totalDays * PX_PER_DAY };
  }, [items, ganttData]);

  const goDetail = (id: string) => {
    Taro.navigateTo({ url: '/pages/goals/objective-detail?id=' + id });
  };

  return (
    <View className={`summit-page ${isDark ? 'summit-dark' : ''} ${theme !== 'light' ? 'theme-' + theme : ''}`}>
      <View className="page-container">
        <View className="g-toolbar">
          <Text className="g-heading">{t('gantt.title')}</Text>
          <View className="seg">
            <Text className={`seg-item ${scope === 'all' ? 'seg-item--active' : ''}`} onClick={() => setScope('all')}>
              {t('gantt.scopeAll')}
            </Text>
            <Text className={`seg-item ${scope === 'cycle' ? 'seg-item--active' : ''}`} onClick={() => setScope('cycle')}>
              {t('gantt.scopeCycle')}
            </Text>
          </View>
        </View>

        {loading && (
          <View className="summit-empty"><Text>{t('common.loading')}</Text></View>
        )}

        {!loading && !items.length && (
          <View className="summit-empty">
            <Text className="empty-icon">📊</Text>
            <Text>{scope === 'cycle' ? '当前专注周期内没有已计划的目标' : '还没有带计划时间的目标，去目标库创建吧'}</Text>
          </View>
        )}

        {!loading && items.length > 0 && (
          <View className="status-tabs">
            {statusTabs.map((tab) => (
              <Text
                key={tab.key}
                className={`status-tab ${statusFilter === tab.key ? 'is-active' : ''}`}
                onClick={() => setStatusFilter(tab.key)}
              >
                {tab.label}
                <Text className="tab-count">{statusCounts[tab.key]}</Text>
              </Text>
            ))}
          </View>
        )}

        {!loading && items.length > 0 && timeline && filteredItems.length > 0 && (
          <View className="summit-card gantt-card">
            <View className="gantt-wrap">
              {/* 固定左侧标签列 */}
              <View className="g-labels">
                <View className="g-axis-spacer"><Text className="g-axis-cap">目标</Text></View>
                {filteredItems.map((item) => (
                  <View key={item.id} className="g-label-row" onClick={() => goDetail(item.id)}>
                    <View className="g-dot" style={{ background: item.isLagging ? 'var(--danger)' : item.color }} />
                    <Text className="g-label-text">{item.title}</Text>
                  </View>
                ))}
              </View>

              {/* 可横向滚动的时间轴区 */}
              <ScrollView scrollX className="gantt-scroll" enhanced showScrollbar={false}>
                <View className="gantt-inner" style={{ width: `${timeline.width}px` }}>
                  <View className="g-axis">
                    {timeline.ticks.map((tick) => (
                      <View
                        key={`${tick.offset}-${tick.label}`}
                        className={`g-tick ${tick.major ? 'g-tick--major' : ''}`}
                        style={{ left: `${tick.offset * PX_PER_DAY}px` }}
                      >
                        <Text className="g-tick-label">{tick.label}</Text>
                      </View>
                    ))}
                  </View>

                  {filteredItems.map((item) => {
                    const startOffset = dayjs(item.startAt).diff(timeline.start, 'day');
                    const spanDays = Math.max(dayjs(item.endAt).diff(dayjs(item.startAt), 'day') + 1, 1);
                    const barWidth = Math.max(spanDays * PX_PER_DAY, 8);
                    const color = item.isLagging ? 'var(--danger)' : item.color;
                    const progW = barWidth * Math.min(Math.max(item.currentProgress, 0), 1);
                    const expX = barWidth * Math.min(Math.max(item.expectedProgress, 0), 1);
                    return (
                      <View key={item.id} className="g-row" onClick={() => goDetail(item.id)}>
                        <View
                          className="g-bar"
                          style={{
                            left: `${startOffset * PX_PER_DAY}px`,
                            width: `${barWidth}px`,
                            background: item.isLagging ? 'var(--danger-soft)' : 'var(--primary-soft)',
                            borderColor: item.worstConfidence === 'off_track'
                              ? 'var(--danger)'
                              : item.worstConfidence === 'at_risk'
                                ? 'var(--warning)'
                                : 'transparent',
                          }}
                        >
                          {progW > 2 && (
                            <View className="g-bar-fill" style={{ width: `${progW}px`, background: color }} />
                          )}
                          <View className="g-bar-tick" style={{ left: `${expX}px` }} />
                          <Text className="g-bar-label">{Math.round(item.currentProgress * 100)}%</Text>
                        </View>
                      </View>
                    );
                  })}

                  {/* 今日红线 */}
                  {timeline.todayOffset >= 0 && timeline.todayOffset <= timeline.totalDays && (
                    <View className="g-today-line" style={{ left: `${timeline.todayOffset * PX_PER_DAY}px` }}>
                      <Text className="g-today-label">{t('gantt.today')}</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            </View>

            {/* 图例 */}
            <View className="g-legend">
              <View className="lg"><View className="sw sw-track" /><Text>{t('gantt.legendDuration')}</Text></View>
              <View className="lg"><View className="sw sw-fill" /><Text>{t('gantt.legendProgress')}</Text></View>
              <View className="lg"><View className="sw sw-tick" /><Text>{t('gantt.legendExpected')}</Text></View>
              <View className="lg"><View className="sw sw-lag" /><Text>{t('gantt.legendLagging')}</Text></View>
            </View>
          </View>
        )}

        {/* 目标列表（条形点击的兜底入口） */}
        {!loading && filteredItems.length > 0 && (
          <View className="summit-card">
            <View className="g-list-title">
              <Text>目标列表 ({filteredItems.length})</Text>
              <Text className="summit-muted text-small">点击查看目标详情</Text>
            </View>
            {filteredItems.map((item) => (
              <View key={item.id} className="g-list-row" onClick={() => goDetail(item.id)}>
                <View className="g-dot" style={{ background: item.isLagging ? 'var(--danger)' : item.color }} />
                <View className="g-list-body">
                  <View className="g-list-name-row">
                    <Text className="g-list-name">{item.title}</Text>
                    {item.isLagging && <Text className="summit-tag summit-tag--danger">{t('gantt.lagging')}</Text>}
                    {!item.isLagging && item.worstConfidence === 'at_risk' && (
                      <Text className="summit-tag summit-tag--warning">有风险</Text>
                    )}
                    {!item.isLagging && item.worstConfidence === 'off_track' && (
                      <Text className="summit-tag summit-tag--danger">已偏离</Text>
                    )}
                  </View>
                  <Text className="summit-muted text-small g-list-meta">
                    {dayjs(item.startAt).format('MM-DD')} ~ {dayjs(item.endAt).format('MM-DD')} · {t('gantt.expected')} {Math.round(item.expectedProgress * 100)}%
                  </Text>
                </View>
                <Text className={`g-pct ${item.isLagging ? 'g-pct--lag' : ''}`}>
                  {Math.round(item.currentProgress * 100)}%
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
