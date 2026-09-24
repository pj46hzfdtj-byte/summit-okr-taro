import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, Input, Picker } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { objectiveApi, taskApi } from '@/lib/api';
import type { Objective, RepeatRule, Task } from '@/lib/types';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import './tasks.scss';

interface DayCell {
  dateStr: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
}

interface TaskForm {
  title: string;
  objectiveId: string | null;
  contribution: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm
  repeatRule: RepeatRule;
  repeatEndDate: string | null; // YYYY-MM-DD
}

const WEEK_DAYS = ['一', '二', '三', '四', '五', '六', '日'];
const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const emptyForm = (date: string): TaskForm => ({
  title: '',
  objectiveId: null,
  contribution: '',
  scheduledDate: date,
  scheduledTime: '09:00',
  repeatRule: 'none',
  repeatEndDate: null,
});

export default function TasksPage() {
  const { t } = useTranslation();
  const isDark = useAppStore((s) => s.isDark);
  const theme = useAppStore((s) => s.theme);

  const [currentMonth, setCurrentMonth] = useState(() => dayjs());
  const [selectedDate, setSelectedDate] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);

  // 多选模式
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 新建/编辑弹层
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskForm>(() => emptyForm(dayjs().format('YYYY-MM-DD')));

  // ============ 数据加载 ============
  const loadTasks = useCallback(async () => {
    try {
      const [pending, completed] = await Promise.all([
        taskApi.list({ status: 'pending' }),
        taskApi.list({ status: 'completed' }),
      ]);
      setAllTasks([...pending, ...completed]);
    } catch {
      // ignore
    }
  }, []);

  const loadObjectives = useCallback(async () => {
    if (objectives.length) return;
    try {
      const res = await objectiveApi.list({ page: 1, pageSize: 200 });
      setObjectives(res.list);
    } catch {
      // ignore
    }
  }, [objectives.length]);

  useDidShow(() => {
    // Tab 页登录守卫
    if (!useAuthStore.getState().isAuthenticated) {
      Taro.reLaunch({ url: '/pages/auth/login' });
      return;
    }
    loadTasks();
    loadObjectives();
  });

  usePullDownRefresh(async () => {
    await loadTasks();
    Taro.stopPullDownRefresh();
  });

  // ============ 日历网格 ============
  const calendarDays = useMemo<DayCell[]>(() => {
    const startOfMonth = currentMonth.startOf('month');
    const endOfMonth = currentMonth.endOf('month');
    const dow = startOfMonth.day(); // 0=周日
    let cursor = startOfMonth.subtract(dow === 0 ? 6 : dow - 1, 'day');
    const days: DayCell[] = [];
    while (days.length < 42) {
      const dateStr = cursor.format('YYYY-MM-DD');
      days.push({
        dateStr,
        day: cursor.date(),
        inMonth: cursor.isSame(currentMonth, 'month'),
        isToday: cursor.isSame(dayjs(), 'day'),
      });
      cursor = cursor.add(1, 'day');
      if ((cursor.isAfter(endOfMonth, 'day') || cursor.isSame(endOfMonth, 'day')) && days.length % 7 === 0) break;
    }
    return days;
  }, [currentMonth]);

  const tasksByDay = useMemo(() => {
    const map: Record<string, Task[]> = {};
    allTasks.forEach((task) => {
      if (!task.scheduledAt) return;
      const key = dayjs(task.scheduledAt).format('YYYY-MM-DD');
      (map[key] = map[key] ?? []).push(task);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => dayjs(a.scheduledAt).valueOf() - dayjs(b.scheduledAt).valueOf()));
    return map;
  }, [allTasks]);

  const tasksOnDay = (dateStr: string): Task[] => tasksByDay[dateStr] ?? [];

  const dayCompletedCount = (dateStr: string): number =>
    tasksOnDay(dateStr).filter((task) => task.status === 'completed').length;

  const isOverdue = (task: Task): boolean =>
    task.status === 'pending' && !!task.scheduledAt && dayjs(task.scheduledAt).isBefore(dayjs(), 'day');

  const dayHasOverdue = (dateStr: string): boolean => tasksOnDay(dateStr).some(isOverdue);

  const monthLabel = currentMonth.format('YYYY年 M月');

  const selectedDayTasks = tasksOnDay(selectedDate);
  const pendingTasks = selectedDayTasks.filter((task) => task.status === 'pending');
  const completedTasks = selectedDayTasks.filter((task) => task.status === 'completed');

  const selectedDateLabel = useMemo(() => {
    const d = dayjs(selectedDate);
    return `${d.format('YYYY年 M月 D日')} ${WEEKDAY_NAMES[d.day()]}`;
  }, [selectedDate]);

  const shiftDay = (delta: number) => {
    const next = dayjs(selectedDate).add(delta, 'day');
    setSelectedDate(next.format('YYYY-MM-DD'));
    setCurrentMonth(next);
    setWeekAnchor(next.startOf('week').add(1, 'day'));
  };

  // ============ 横向周日期条（VisOKR 风格） ============
  const [weekAnchor, setWeekAnchor] = useState(() => dayjs().startOf('week').add(1, 'day'));

  const weekLabel = useMemo(() => {
    const start = weekAnchor;
    const end = start.add(6, 'day');
    return `${start.format('M月D日')} - ${end.format('M月D日')}`;
  }, [weekAnchor]);

  const weekStrip = useMemo(() => {
    const labels = ['一', '二', '三', '四', '五', '六', '日'];
    return Array.from({ length: 7 }, (_, i) => {
      const d = weekAnchor.add(i, 'day');
      const dateStr = d.format('YYYY-MM-DD');
      const list = tasksByDay[dateStr] ?? [];
      return {
        dateStr,
        weekday: labels[i],
        dayNum: d.date(),
        isToday: d.isSame(dayjs(), 'day'),
        isSelected: dateStr === selectedDate,
        count: list.length,
        completed: list.filter((task) => task.status === 'completed').length,
      };
    });
  }, [weekAnchor, tasksByDay, selectedDate]);

  const selectDay = (dateStr: string) => {
    setSelectedDate(dateStr);
    const d = dayjs(dateStr);
    setCurrentMonth(d);
    const start = weekAnchor;
    const end = start.add(6, 'day');
    if (d.isBefore(start, 'day') || d.isAfter(end, 'day')) {
      setWeekAnchor(d.startOf('week').add(1, 'day'));
    }
  };

  const goToday = () => {
    const today = dayjs();
    setSelectedDate(today.format('YYYY-MM-DD'));
    setCurrentMonth(today);
    setWeekAnchor(today.startOf('week').add(1, 'day'));
  };

  // ============ 完成庆祝提示（VisOKR 风格） ============
  const [celebrate, setCelebrate] = useState<{ show: boolean; title: string; sub: string; pct: string }>({
    show: false,
    title: '',
    sub: '',
    pct: '',
  });
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const celebrateMessages = [
    '又近了一步，继续加油！',
    '坚持就是胜利！',
    '今天的努力看得见！',
    '离目标更近了！',
    '太棒了，保持节奏！',
  ];

  const triggerCelebrate = (task: Task) => {
    const obj = task.objectiveId ? objectives.find((o) => o.id === task.objectiveId) : null;
    const sub = obj?.title ?? '';
    const pct = obj?.currentProgress != null ? `${Math.round(obj.currentProgress * 100)}%` : '';
    const msg = celebrateMessages[Math.floor(Math.random() * celebrateMessages.length)];
    setCelebrate({ show: true, title: msg, sub, pct });
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    celebrateTimer.current = setTimeout(() => {
      setCelebrate((c) => ({ ...c, show: false }));
    }, 2600);
  };

  // ============ 重复规则 ============
  const repeatOptions = useMemo<{ label: string; value: RepeatRule }[]>(
    () => [
      { label: t('task.repeat.none'), value: 'none' },
      { label: t('task.repeat.daily'), value: 'daily' },
      { label: t('task.repeat.weekly'), value: 'weekly' },
      { label: t('task.repeat.monthly'), value: 'monthly' },
      { label: t('task.repeat.yearly'), value: 'yearly' },
      { label: t('task.repeat.weekdays'), value: 'weekdays' },
    ],
    [t],
  );
  const repeatLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    repeatOptions.forEach((o) => (map[o.value] = o.label));
    return map;
  }, [repeatOptions]);
  const hasRepeat = form.repeatRule !== 'none';

  // ============ 关联目标 picker ============
  const objectiveLabels = useMemo(() => ['不关联', ...objectives.map((o) => o.title)], [objectives]);
  const objectiveIndex = form.objectiveId ? objectives.findIndex((o) => o.id === form.objectiveId) + 1 : 0;
  const repeatIndex = Math.max(0, repeatOptions.findIndex((o) => o.value === form.repeatRule));

  const getObjectiveTitle = (id?: string | null): string => {
    if (!id) return '';
    return objectives.find((o) => o.id === id)?.title ?? '';
  };

  const formatTime = (iso: string | Date): string => dayjs(iso).format('HH:mm');

  // ============ 新建 / 编辑 ============
  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm(selectedDate));
    setDialogVisible(true);
  };

  const openEdit = (task: Task) => {
    const at = task.scheduledAt ? dayjs(task.scheduledAt) : dayjs();
    setEditingId(task.id);
    setForm({
      title: task.title,
      objectiveId: task.objectiveId,
      contribution: task.contribution ?? '',
      scheduledDate: at.format('YYYY-MM-DD'),
      scheduledTime: at.format('HH:mm'),
      repeatRule: task.repeatRule ?? 'none',
      repeatEndDate: task.repeatEndDate ? dayjs(task.repeatEndDate).format('YYYY-MM-DD') : null,
    });
    setDialogVisible(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      Taro.showToast({ title: '请输入任务名称', icon: 'none' });
      return;
    }
    const scheduledAt = dayjs(`${form.scheduledDate} ${form.scheduledTime}`).toISOString();
    const repeatEndDate = hasRepeat && form.repeatEndDate ? dayjs(form.repeatEndDate).endOf('day').toISOString() : null;
    try {
      if (editingId) {
        await taskApi.update(editingId, {
          title: form.title.trim(),
          scheduledAt,
          repeatRule: form.repeatRule,
          objectiveId: form.objectiveId,
          contribution: form.contribution,
          repeatEndDate,
        });
        Taro.showToast({ title: '任务已更新', icon: 'success' });
      } else {
        await taskApi.create({
          title: form.title.trim(),
          scheduledAt,
          repeatRule: form.repeatRule,
          objectiveId: form.objectiveId,
          contribution: form.contribution,
          ...(repeatEndDate ? { repeatEndDate } : {}),
        });
        Taro.showToast({ title: '任务创建成功', icon: 'success' });
      }
      setDialogVisible(false);
      await loadTasks();
    } catch {
      // http 层已提示
    }
  };

  // ============ 完成 / 删除 ============
  const handleToggle = async (task: Task) => {
    try {
      const wasPending = task.status === 'pending';
      await taskApi.complete(task.id, wasPending);
      await loadTasks();
      if (wasPending) {
        triggerCelebrate(task);
        if (task.repeatRule && task.repeatRule !== 'none') {
          Taro.showToast({
            title: `已完成，已生成下一个${repeatLabelMap[task.repeatRule] ?? ''}任务`,
            icon: 'none',
          });
        }
      }
    } catch {
      // ignore
    }
  };

  const handleDelete = async (task: Task) => {
    const res = await Taro.showModal({
      title: t('common.notice'),
      content: `确定删除任务「${task.title}」？`,
    });
    if (!res.confirm) return;
    await taskApi.remove(task.id);
    Taro.showToast({ title: '删除成功', icon: 'success' });
    await loadTasks();
  };

  // ============ 批量删除 ============
  const toggleSelectMode = () => {
    setSelectMode(!selectMode);
    setSelectedIds([]);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(selectMode && selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const allSelected = selectedDayTasks.length > 0 && selectedDayTasks.every((task) => selectedIds.includes(task.id));

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : selectedDayTasks.map((task) => task.id));
  };

  const handleBatchDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length) {
      Taro.showToast({ title: '请先选择任务', icon: 'none' });
      return;
    }
    const res = await Taro.showModal({ title: t('common.notice'), content: `确定批量删除 ${ids.length} 个任务？` });
    if (!res.confirm) return;
    const result = await taskApi.batchDelete(ids);
    Taro.showToast({ title: `已删除 ${result.count} 个任务`, icon: 'success' });
    setSelectedIds([]);
    setSelectMode(false);
    await loadTasks();
  };

  const handleDeleteOverdue = async () => {
    const res = await Taro.showModal({
      title: '清理过期任务',
      content: '将删除所有超过 7 天未完成的过期任务，确定继续？',
    });
    if (!res.confirm) return;
    const result = await taskApi.deleteOverdue();
    if (result.count === 0) {
      Taro.showToast({ title: '没有过期任务需要清理', icon: 'none' });
    } else {
      Taro.showToast({ title: `已清理 ${result.count} 个过期任务`, icon: 'success' });
      await loadTasks();
    }
  };

  // ============ 渲染 ============
  return (
    <View className={`summit-page ${isDark ? 'summit-dark' : ''} ${theme !== 'light' ? 'theme-' + theme : ''}`}>
      <View className="page-container">
        {/* 横向周日期条（VisOKR 风格） */}
        <View className="week-strip-card">
          <View className="week-strip-header">
            <Text className="ws-arrow" onClick={() => setWeekAnchor(weekAnchor.subtract(7, 'day'))}>‹</Text>
            <Text className="week-label">{weekLabel}</Text>
            <Text className="ws-arrow" onClick={() => setWeekAnchor(weekAnchor.add(7, 'day'))}>›</Text>
            <Text className="ws-today" onClick={goToday}>今天</Text>
          </View>
          <View className="week-strip">
            {weekStrip.map((d) => (
              <View
                key={d.dateStr}
                className={`week-day ${d.isToday ? 'is-today' : ''} ${d.isSelected ? 'is-selected' : ''} ${d.count > 0 && d.completed === d.count ? 'all-done' : ''}`}
                onClick={() => selectDay(d.dateStr)}
              >
                <Text className="wd-weekday">{d.weekday}</Text>
                <Text className="wd-num">{d.dayNum}</Text>
                <View className="wd-dots">
                  {d.count > 0 && <View className={`wd-dot ${d.completed === d.count ? 'dot-done' : ''}`} />}
                </View>
                <Text className="wd-count">{d.count > 0 ? `${d.completed}/${d.count}` : ' '}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 工具行 */}
        <View className="toolbar">
          <View className="row">
            <Text className="tool-btn" onClick={() => setCurrentMonth(currentMonth.subtract(1, 'month'))}>‹</Text>
            <Text className="month-label">{monthLabel}</Text>
            <Text className="tool-btn" onClick={() => setCurrentMonth(currentMonth.add(1, 'month'))}>›</Text>
            <Text
              className="tool-btn today-btn"
              onClick={goToday}
            >
              今天
            </Text>
          </View>
          <View className="row">
            <Picker
              mode="date"
              value={selectedDate}
              onChange={(e) => {
                const v = e.detail.value;
                setSelectedDate(v);
                setCurrentMonth(dayjs(v));
              }}
            >
              <Text className="tool-btn picker-btn">📅</Text>
            </Picker>
            <Text className="tool-btn" onClick={() => shiftDay(-1)}>◀</Text>
            <Text className="tool-btn" onClick={() => shiftDay(1)}>▶</Text>
          </View>
        </View>

        <View className="toolbar toolbar-actions">
          <View className="row">
            <Text className={selectMode ? 'link link-primary' : 'link link-secondary'} onClick={toggleSelectMode}>
              {selectMode ? '取消' : '多选'}
            </Text>
            {selectMode && selectedIds.length > 0 && (
              <Text className="link link-danger" onClick={handleBatchDelete}>删除({selectedIds.length})</Text>
            )}
          </View>
          <View className="row">
            {!selectMode && (
              <Text className="link link-secondary" onClick={handleDeleteOverdue}>清过期</Text>
            )}
            {!selectMode && (
              <Text className="link-new" onClick={openCreate}>＋新建</Text>
            )}
          </View>
        </View>

        {/* 日历网格 */}
        <View className="summit-card cal-card">
          <View className="weekday-row">
            {WEEK_DAYS.map((d) => (
              <Text key={d} className="weekday-cell">{d}</Text>
            ))}
          </View>
          <View className="day-grid">
            {calendarDays.map((cell) => {
              const count = tasksOnDay(cell.dateStr).length;
              return (
                <View
                  key={cell.dateStr}
                  className={`day-cell ${cell.inMonth ? '' : 'out-of-month'} ${cell.isToday ? 'is-today' : ''} ${cell.dateStr === selectedDate ? 'is-selected' : ''}`}
                  onClick={() => selectDay(cell.dateStr)}
                >
                  <Text className={`day-number ${cell.isToday ? 'num-today' : ''} ${dayHasOverdue(cell.dateStr) ? 'num-overdue' : ''}`}>
                    {cell.day}
                  </Text>
                  {count > 0 && (
                    <View className="day-badges">
                      <Text className="badge-completed">{dayCompletedCount(cell.dateStr)}</Text>
                      <Text className="badge-total">/{count}</Text>
                    </View>
                  )}
                  {count > 0 && (
                    <View className="day-dot-bar">
                      {tasksOnDay(cell.dateStr).slice(0, 4).map((task, i) => (
                        <View
                          key={task.id}
                          className={`dot ${task.status === 'completed' ? 'done' : ''} ${isOverdue(task) ? 'overdue' : ''}`}
                          style={i === 3 && count > 4 ? { opacity: 0.5 } : undefined}
                        />
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* 选中日任务列表 */}
        <View className="summit-card">
          <View className="card-title">
            <View className="row">
              <Text className="card-title-text">{selectedDateLabel}</Text>
              {selectedDayTasks.length > 0 && (
                <Text className="summit-muted text-small"> {completedTasks.length}/{selectedDayTasks.length} 已完成</Text>
              )}
            </View>
            {selectMode && selectedDayTasks.length > 0 && (
              <Text className="link link-primary" onClick={toggleSelectAll}>
                {allSelected ? '取消全选' : '全选'}
              </Text>
            )}
          </View>

          {selectedDayTasks.length === 0 && (
            <View className="summit-empty">
              <Text>当天无任务</Text>
              <View className="summit-btn add-btn" onClick={openCreate}>添加任务</View>
            </View>
          )}

          {pendingTasks.length > 0 && (
            <View>
              <Text className="section-label">{t('task.pending')}（{pendingTasks.length}）</Text>
              {pendingTasks.map((task) => (
                <View key={task.id} className={`task-item ${isOverdue(task) ? 'is-overdue' : ''}`}>
                  <View className="task-check" onClick={() => (selectMode ? toggleSelect(task.id) : handleToggle(task))}>
                    {selectMode && selectedIds.includes(task.id) && <Text>✓</Text>}
                  </View>
                  <View className="task-body">
                    <View className="row">
                      <Text className="task-time summit-muted">{formatTime(task.scheduledAt!)}</Text>
                      <Text className="task-name">{task.title}</Text>
                    </View>
                    <View className="task-meta-row">
                      {isOverdue(task) && <Text className="summit-tag summit-tag--danger">过期</Text>}
                      {task.repeatRule && task.repeatRule !== 'none' && (
                        <Text className="summit-tag summit-tag--warning">{repeatLabelMap[task.repeatRule]}</Text>
                      )}
                      {task.objectiveId && <Text className="summit-tag">{getObjectiveTitle(task.objectiveId)}</Text>}
                      {task.contribution && <Text className="summit-tag summit-tag--success">{task.contribution}</Text>}
                    </View>
                  </View>
                  {!selectMode && (
                    <View className="row task-actions">
                      <Text className="link link-primary" onClick={() => openEdit(task)}>{t('common.edit')}</Text>
                      <Text className="link link-danger" onClick={() => handleDelete(task)}>{t('common.delete')}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {completedTasks.length > 0 && (
            <View>
              <Text className="section-label">{t('task.completed')}（{completedTasks.length}）</Text>
              {completedTasks.map((task) => (
                <View key={task.id} className="task-item is-completed">
                  <View className="task-check is-done" onClick={() => (selectMode ? toggleSelect(task.id) : handleToggle(task))}>
                    <Text>✓</Text>
                  </View>
                  <View className="task-body">
                    <View className="row">
                      <Text className="task-time summit-muted">{formatTime(task.scheduledAt!)}</Text>
                      <Text className={`task-name ${selectMode ? '' : 'name-done'}`}>{task.title}</Text>
                    </View>
                    <View className="task-meta-row">
                      {task.repeatRule && task.repeatRule !== 'none' && (
                        <Text className="summit-tag summit-tag--warning">{repeatLabelMap[task.repeatRule]}</Text>
                      )}
                      {task.objectiveId && <Text className="summit-tag">{getObjectiveTitle(task.objectiveId)}</Text>}
                      {task.contribution && <Text className="summit-tag summit-tag--success">{task.contribution}</Text>}
                    </View>
                  </View>
                  {!selectMode && (
                    <View className="row task-actions">
                      <Text className="link link-primary" onClick={() => openEdit(task)}>{t('common.edit')}</Text>
                      <Text className="link link-danger" onClick={() => handleDelete(task)}>{t('common.delete')}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* 新建/编辑任务弹层 */}
      {dialogVisible && (
        <View className="summit-overlay" onClick={() => setDialogVisible(false)}>
          <View className="sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="sheet-title">{editingId ? '编辑任务' : '新建任务'}</Text>
            <View className="form-item">
              <Text className="form-label">标题 *</Text>
              <Input
                className="field-input"
                value={form.title}
                placeholder="任务名称"
                onInput={(e) => setForm({ ...form, title: e.detail.value })}
              />
            </View>
            <View className="form-item">
              <Text className="form-label">关联目标（可选）</Text>
              <Picker
                mode="selector"
                range={objectiveLabels}
                value={objectiveIndex}
                onChange={(e) => {
                  const idx = Number(e.detail.value);
                  setForm({ ...form, objectiveId: idx === 0 ? null : objectives[idx - 1].id });
                }}
              >
                <View className="field-picker">
                  <Text className={form.objectiveId ? '' : 'picker-placeholder'}>
                    {form.objectiveId ? getObjectiveTitle(form.objectiveId) : '选择关联目标'}
                  </Text>
                  <Text className="summit-muted">▾</Text>
                </View>
              </Picker>
            </View>
            <View className="form-item">
              <Text className="form-label">贡献说明（可选）</Text>
              <Input
                className="field-input"
                value={form.contribution}
                placeholder="该任务对目标的贡献"
                onInput={(e) => setForm({ ...form, contribution: e.detail.value })}
              />
            </View>
            <View className="form-item">
              <Text className="form-label">计划时间</Text>
              <View className="row form-row-split">
                <Picker
                  mode="date"
                  value={form.scheduledDate}
                  onChange={(e) => setForm({ ...form, scheduledDate: e.detail.value })}
                >
                  <View className="field-picker flex-1">
                    <Text>{form.scheduledDate}</Text>
                    <Text className="summit-muted">📅</Text>
                  </View>
                </Picker>
                <Picker
                  mode="time"
                  value={form.scheduledTime}
                  onChange={(e) => setForm({ ...form, scheduledTime: e.detail.value })}
                >
                  <View className="field-picker flex-1">
                    <Text>{form.scheduledTime}</Text>
                    <Text className="summit-muted">🕐</Text>
                  </View>
                </Picker>
              </View>
            </View>
            <View className="form-item">
              <Text className="form-label">{t('task.repeatRule')}</Text>
              <Picker
                mode="selector"
                range={repeatOptions.map((o) => o.label)}
                value={repeatIndex}
                onChange={(e) => setForm({ ...form, repeatRule: repeatOptions[Number(e.detail.value)].value })}
              >
                <View className="field-picker">
                  <Text>{repeatOptions[repeatIndex].label}</Text>
                  <Text className="summit-muted">▾</Text>
                </View>
              </Picker>
            </View>
            {hasRepeat && (
              <View className="form-item">
                <Text className="form-label">{t('task.repeatEndDate')}（不选则永久）</Text>
                <View className="row form-row-split">
                  <Picker
                    mode="date"
                    value={form.repeatEndDate ?? form.scheduledDate}
                    onChange={(e) => setForm({ ...form, repeatEndDate: e.detail.value })}
                  >
                    <View className="field-picker flex-1">
                      <Text className={form.repeatEndDate ? '' : 'picker-placeholder'}>
                        {form.repeatEndDate ?? '选择截止日期'}
                      </Text>
                      <Text className="summit-muted">📅</Text>
                    </View>
                  </Picker>
                  {form.repeatEndDate && (
                    <Text className="link link-danger" onClick={() => setForm({ ...form, repeatEndDate: null })}>清除</Text>
                  )}
                </View>
              </View>
            )}
            <View className="row sheet-actions">
              <View className="summit-btn summit-btn--ghost flex-1" onClick={() => setDialogVisible(false)}>{t('common.cancel')}</View>
              <View className="summit-btn flex-1" onClick={handleSave}>{editingId ? t('common.save') : t('common.create')}</View>
            </View>
          </View>
        </View>
      )}

      {/* 浮动加号（VisOKR 风格） */}
      {!dialogVisible && (
        <View className="task-fab" onClick={openCreate}>
          <Text className="task-fab-icon">＋</Text>
        </View>
      )}

      {/* 完成庆祝提示（VisOKR 风格） */}
      {celebrate.show && (
        <View className="celebrate-toast">
          <Text className="celebrate-emoji">🎉</Text>
          <View className="celebrate-text">
            <Text className="celebrate-title">{celebrate.title}</Text>
            {celebrate.sub && (
              <Text className="celebrate-sub">
                {celebrate.sub}
                {celebrate.pct ? ` · ${celebrate.pct}` : ''}
              </Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
