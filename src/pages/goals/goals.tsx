import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Input, Switch, Picker } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { useTranslation } from 'react-i18next';
import { goalGroupApi, visionApi, objectiveApi } from '@/lib/api';
import type { GoalGroup, Vision } from '@/lib/types';
import { ObjectiveStatusLabel } from '@/lib/types';
import { useAppStore } from '@/stores/app';
import './goals.scss';

const COLOR_PRESETS = ['#409eff', '#1E40AF', '#2e7d32', '#7c3aed', '#e6a23c', '#f56c6c', '#0f9960', '#646a73'];

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 日期 + 时间字符串 → ISO；日期为空返回 null */
function toIso(date: string, time: string): string | null {
  if (!date) return null;
  return new Date(`${date}T${time || '00:00'}:00`).toISOString();
}

function objStatusTagClass(status: string) {
  if (status === 'completed') return 'summit-tag summit-tag--success';
  if (status === 'in_progress' || status === 'pending_review') return 'summit-tag summit-tag--warning';
  return 'summit-tag';
}

interface NodeForm {
  name: string;
  color: string;
  parentId: string | null;
  visionId: string | null;
}

interface ObjForm {
  title: string;
  color: string;
  usePlanTime: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  motivations: string[];
  feasibilities: string[];
}

const emptyObjForm = (): ObjForm => ({
  title: '',
  color: '#409EFF',
  usePlanTime: false,
  startDate: '',
  startTime: '00:00',
  endDate: '',
  endTime: '23:59',
  motivations: [],
  feasibilities: [],
});

export default function GoalsPage() {
  const { t } = useTranslation();
  const isDark = useAppStore((s) => s.isDark);
  const theme = useAppStore((s) => s.theme);

  const [tree, setTree] = useState<GoalGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [visions, setVisions] = useState<Vision[]>([]);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      const data = await goalGroupApi.getTree(true);
      setTree(data ?? []);
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, []);

  const loadVisions = useCallback(async () => {
    try {
      const data = await visionApi.list();
      setVisions(data ?? []);
    } catch {
      setVisions([]);
    }
  }, []);

  useEffect(() => {
    loadTree();
    loadVisions();
  }, [loadTree, loadVisions]);

  // 从目标详情页返回时刷新
  useDidShow(() => {
    if (loadedOnce) loadTree();
  });

  usePullDownRefresh(() => {
    const stop = () => Taro.stopPullDownRefresh();
    Promise.all([loadTree(), loadVisions()]).then(stop, stop);
  });

  /** 深度优先展开为扁平行（仅渲染已展开路径），避免递归组件 */
  const flatRows = useMemo(() => {
    const rows: { node: GoalGroup; level: number }[] = [];
    function walk(nodes: GoalGroup[], level: number) {
      for (const node of nodes) {
        rows.push({ node, level });
        if (expanded[node.id] && node.children?.length) {
          walk(node.children, level + 1);
        }
      }
    }
    walk(tree, 0);
    return rows;
  }, [tree, expanded]);

  const toggleNode = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const openObjective = useCallback((id: string) => {
    Taro.navigateTo({ url: '/pages/goals/objective-detail?id=' + id });
  }, []);

  const onNodeTap = useCallback(
    (node: GoalGroup) => {
      // 与 web 行为一致：点击节点直接进入第一个目标，否则切换展开
      if (node.objectives?.length) {
        openObjective(node.objectives[0].id);
      } else if (node.children?.length) {
        toggleNode(node.id);
      }
    },
    [openObjective, toggleNode],
  );

  // ============ 节点创建 / 编辑弹层 ============
  const [nodeDialogVisible, setNodeDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isRootNode, setIsRootNode] = useState(true);
  const [nodeForm, setNodeForm] = useState<NodeForm>({
    name: '',
    color: '#1E40AF',
    parentId: null,
    visionId: null,
  });
  // 愿景选择器索引：0 = 不关联
  const [visionIndex, setVisionIndex] = useState(0);
  const visionRange = useMemo(
    () => ['（不关联）', ...visions.map((v) => v.content)],
    [visions],
  );

  const openCreate = useCallback(
    (parentId: string | null = null) => {
      setEditingId(null);
      setIsRootNode(parentId === null);
      setNodeForm({ name: '', color: '#1E40AF', parentId, visionId: null });
      setVisionIndex(0);
      setNodeDialogVisible(true);
    },
    [],
  );

  const openEdit = useCallback(
    (node: GoalGroup) => {
      setEditingId(node.id);
      setIsRootNode(!node.parentId);
      setNodeForm({
        name: node.name,
        color: node.color,
        parentId: node.parentId,
        visionId: node.visionId ?? null,
      });
      const idx = node.visionId ? visions.findIndex((v) => v.id === node.visionId) : -1;
      setVisionIndex(idx >= 0 ? idx + 1 : 0);
      setNodeDialogVisible(true);
    },
    [visions],
  );

  const handleSubmitNode = useCallback(async () => {
    if (!nodeForm.name.trim()) {
      Taro.showToast({ title: '请输入节点名称', icon: 'none' });
      return;
    }
    const visionId = visionIndex > 0 ? visions[visionIndex - 1].id : null;
    try {
      if (editingId) {
        await goalGroupApi.update(editingId, {
          name: nodeForm.name.trim(),
          color: nodeForm.color,
          ...(isRootNode ? { visionId } : {}),
        });
        Taro.showToast({ title: '更新成功', icon: 'success' });
      } else {
        await goalGroupApi.create({
          parentId: nodeForm.parentId,
          name: nodeForm.name.trim(),
          color: nodeForm.color,
          ...(isRootNode ? { visionId } : {}),
        });
        Taro.showToast({ title: '创建成功', icon: 'success' });
      }
      setNodeDialogVisible(false);
      await loadTree();
    } catch {
      // http 层已 toast
    }
  }, [nodeForm, editingId, isRootNode, visionIndex, visions, loadTree]);

  const handleDelete = useCallback(
    (node: GoalGroup) => {
      Taro.showModal({
        title: '危险操作',
        content: t('goal.deleteConfirm', { name: node.name }),
        confirmText: '确认删除',
        confirmColor: '#f56c6c',
        success: async (res) => {
          if (res.confirm) {
            await goalGroupApi.remove(node.id);
            Taro.showToast({ title: '删除成功', icon: 'success' });
            await loadTree();
          }
        },
      });
    },
    [t, loadTree],
  );

  // ============ 目标快速创建弹层 ============
  const [objDialogVisible, setObjDialogVisible] = useState(false);
  const [objCreating, setObjCreating] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [objForm, setObjForm] = useState<ObjForm>(emptyObjForm());
  const [motivationInput, setMotivationInput] = useState('');
  const [feasibilityInput, setFeasibilityInput] = useState('');

  const openObjectiveCreate = useCallback((groupId: string) => {
    setSelectedGroupId(groupId);
    setObjForm(emptyObjForm());
    setMotivationInput('');
    setFeasibilityInput('');
    setObjDialogVisible(true);
  }, []);

  const addTag = useCallback((field: 'motivations' | 'feasibilities') => {
    const src = field === 'motivations' ? motivationInput : feasibilityInput;
    const v = src.trim();
    if (v && !objForm[field].includes(v)) {
      setObjForm((prev) => ({ ...prev, [field]: [...prev[field], v] }));
    }
    if (field === 'motivations') setMotivationInput('');
    else setFeasibilityInput('');
  }, [motivationInput, feasibilityInput, objForm]);

  const removeTag = useCallback((field: 'motivations' | 'feasibilities', i: number) => {
    setObjForm((prev) => ({ ...prev, [field]: prev[field].filter((_, idx) => idx !== i) }));
  }, []);

  const handleCreateObjective = useCallback(async () => {
    if (!objForm.title.trim()) {
      Taro.showToast({ title: '请输入目标标题', icon: 'none' });
      return;
    }
    if (objForm.usePlanTime) {
      if (!objForm.startDate || !objForm.endDate) {
        Taro.showToast({ title: '请填写开始与结束时间', icon: 'none' });
        return;
      }
      const start = toIso(objForm.startDate, objForm.startTime);
      const end = toIso(objForm.endDate, objForm.endTime);
      if (start && end && new Date(end) <= new Date(start)) {
        Taro.showToast({ title: '结束时间需晚于开始时间', icon: 'none' });
        return;
      }
    }
    setObjCreating(true);
    try {
      const obj = await objectiveApi.create({
        goalGroupId: selectedGroupId,
        title: objForm.title.trim(),
        color: objForm.color,
        startAt: objForm.usePlanTime ? toIso(objForm.startDate, objForm.startTime) ?? undefined : undefined,
        endAt: objForm.usePlanTime ? toIso(objForm.endDate, objForm.endTime) ?? undefined : undefined,
        motivations: objForm.motivations,
        feasibilities: objForm.feasibilities,
      });
      Taro.showToast({ title: '目标创建成功', icon: 'success' });
      setObjDialogVisible(false);
      await loadTree();
      Taro.navigateTo({ url: '/pages/goals/objective-detail?id=' + obj.id });
    } catch (e) {
      Taro.showToast({ title: (e as Error)?.message || '目标创建失败', icon: 'none' });
    } finally {
      setObjCreating(false);
    }
  }, [objForm, selectedGroupId, loadTree]);

  return (
    <View className={`summit-page goals-page ${isDark ? 'summit-dark' : ''} ${theme !== 'light' ? 'theme-' + theme : ''}`}>
      <View className="goals-container">
        <View className="goals-header">
          <Text className="goals-title">{t('goal.title')}</Text>
          <View className="goals-header-btn" onClick={() => openCreate(null)}>
            <Text>{t('goal.createRoot')}</Text>
          </View>
        </View>

        {loading && !tree.length ? (
          <View className="goals-loading">
            <Text>{t('common.loading')}</Text>
          </View>
        ) : !tree.length ? (
          <View className="summit-empty">
            <Text className="goals-empty-icon">🗂️</Text>
            <View className="goals-empty-text">{t('goal.emptyHint')}</View>
            <View className="goals-empty-btn" onClick={() => openCreate(null)}>
              <Text>{t('objective.addNow').replace('添加', '创建')}</Text>
            </View>
          </View>
        ) : (
          <View>
            {flatRows.map(({ node, level }) => {
              const hasChildren = !!(node.children?.length || node.objectives?.length);
              const isOpen = !!expanded[node.id];
              return (
                <View key={node.id} className="node-block" style={{ marginLeft: `${level * 12}px` }}>
                  <View className="node-row">
                    <Text
                      className={`expand-icon ${hasChildren ? '' : 'placeholder'}`}
                      onClick={hasChildren ? () => toggleNode(node.id) : undefined}
                    >
                      {hasChildren ? (isOpen ? '▾' : '▸') : '·'}
                    </Text>

                    <View className="node-main" onClick={() => onNodeTap(node)}>
                      <View className="node-main-row">
                        <View className="color-dot" style={{ background: node.color }} />
                        <Text className="node-name">{node.name}</Text>
                        {node.vision ? (
                          <Text className="summit-tag summit-tag--warning vision-tag">
                            {t('vision.rootTag')}·{node.vision.content.slice(0, 10)}
                          </Text>
                        ) : null}
                        {node.objectives?.length ? <Text className="obj-count">{node.objectives.length}</Text> : null}
                      </View>
                      {(node.progress ?? 0) > 0 && (
                        <View className="node-progress">
                          <View className="node-progress__track">
                            <View
                              className="node-progress__fill"
                              style={{ width: `${Math.round(Math.min(1, node.progress ?? 0) * 100)}%`, background: node.color }}
                            />
                          </View>
                          <Text className="node-progress__pct">{Math.round((node.progress ?? 0) * 100)}%</Text>
                        </View>
                      )}
                    </View>

                    <View className="node-actions">
                      <Text className="action-btn" onClick={() => openCreate(node.id)}>＋子</Text>
                      <Text className="action-btn" onClick={() => openObjectiveCreate(node.id)}>＋目标</Text>
                      <Text className="action-btn" onClick={() => openEdit(node)}>{t('common.edit')}</Text>
                      <Text className="action-btn danger" onClick={() => handleDelete(node)}>{t('common.delete')}</Text>
                    </View>
                  </View>

                  {isOpen && node.objectives?.length ? (
                    <View className="node-children">
                      {node.objectives.map((obj) => (
                        <View key={obj.id} className="obj-row" onClick={() => openObjective(obj.id)}>
                          <View className="color-dot small" style={{ background: obj.color }} />
                          <Text className="obj-title-text">{obj.title}</Text>
                          <Text className={objStatusTagClass(obj.status)}>
                            {(ObjectiveStatusLabel as Record<string, string>)[obj.status] ??
                              t(`objective.status.${obj.status}`)}
                          </Text>
                          <Text className="obj-progress">{Math.round((obj.currentProgress ?? 0) * 100)}%</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* ============ 节点编辑弹层 ============ */}
      {nodeDialogVisible ? (
        <View className="summit-overlay" onClick={() => setNodeDialogVisible(false)}>
          <View className="popup-sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="popup-title">{editingId ? t('goal.editNode') : t('goal.createNode')}</Text>
            <View className="form-item">
              <Text className="form-label">{t('goal.name')}</Text>
              <Input
                className="form-input"
                value={nodeForm.name}
                placeholder="如：技术提升"
                onInput={(e) => setNodeForm((prev) => ({ ...prev, name: e.detail.value }))}
              />
            </View>
            {isRootNode ? (
              <View className="form-item">
                <Text className="form-label">{t('vision.fieldLabel')}</Text>
                <Picker
                  mode="selector"
                  range={visionRange}
                  value={visionIndex}
                  onChange={(e) => setVisionIndex(Number(e.detail.value))}
                >
                  <View className="form-picker">
                    <Text className={visionIndex > 0 ? '' : 'form-picker-placeholder'}>
                      {visionIndex > 0 ? visionRange[visionIndex] : t('vision.fieldPlaceholder')}
                    </Text>
                    <Text className="form-picker-arrow">▾</Text>
                  </View>
                </Picker>
              </View>
            ) : null}
            <View className="form-item">
              <Text className="form-label">{t('goal.color')}</Text>
              <View className="color-row">
                {COLOR_PRESETS.map((c) => (
                  <View
                    key={c}
                    className={`color-dot-lg ${nodeForm.color === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setNodeForm((prev) => ({ ...prev, color: c }))}
                  />
                ))}
              </View>
            </View>
            <View className="popup-btns">
              <View className="summit-btn summit-btn--ghost popup-btn" onClick={() => setNodeDialogVisible(false)}>
                <Text>{t('common.cancel')}</Text>
              </View>
              <View className="summit-btn popup-btn" onClick={handleSubmitNode}>
                <Text>{t('common.confirm')}</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {/* ============ 目标快速创建弹层 ============ */}
      {objDialogVisible ? (
        <View className="summit-overlay" onClick={() => setObjDialogVisible(false)}>
          <View className="popup-sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="popup-title">新建目标</Text>
            <View className="form-item">
              <Text className="form-label">标题</Text>
              <Input
                className="form-input"
                value={objForm.title}
                placeholder="目标标题"
                onInput={(e) => setObjForm((prev) => ({ ...prev, title: e.detail.value }))}
              />
            </View>
            <View className="form-item">
              <Text className="form-label">{t('goal.color')}</Text>
              <View className="color-row">
                {COLOR_PRESETS.map((c) => (
                  <View
                    key={c}
                    className={`color-dot-lg ${objForm.color === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setObjForm((prev) => ({ ...prev, color: c }))}
                  />
                ))}
              </View>
            </View>
            <View className="form-item form-item-switch">
              <Text className="form-label form-label-inline">计划时间</Text>
              <Switch checked={objForm.usePlanTime} onChange={(e) => setObjForm((prev) => ({ ...prev, usePlanTime: e.detail.value }))} />
            </View>
            <Text className="form-hint">关闭则目标为「{t('objective.status.unplanned')}」状态</Text>
            {objForm.usePlanTime ? (
              <View className="form-item">
                <Text className="form-label">开始时间</Text>
                <View className="datetime-row">
                  <Picker
                    mode="date"
                    start={todayStr()}
                    value={objForm.startDate}
                    onChange={(e) => setObjForm((prev) => ({ ...prev, startDate: String(e.detail.value) }))}
                  >
                    <View className="form-picker half">
                      <Text className={objForm.startDate ? '' : 'form-picker-placeholder'}>
                        {objForm.startDate || '选择日期'}
                      </Text>
                      <Text className="form-picker-arrow">▾</Text>
                    </View>
                  </Picker>
                  <Picker
                    mode="time"
                    value={objForm.startTime}
                    onChange={(e) => setObjForm((prev) => ({ ...prev, startTime: String(e.detail.value) }))}
                  >
                    <View className="form-picker half">
                      <Text>{objForm.startTime}</Text>
                      <Text className="form-picker-arrow">▾</Text>
                    </View>
                  </Picker>
                </View>
              </View>
            ) : null}
            {objForm.usePlanTime ? (
              <View className="form-item">
                <Text className="form-label">结束时间</Text>
                <View className="datetime-row">
                  <Picker
                    mode="date"
                    start={objForm.startDate || todayStr()}
                    value={objForm.endDate}
                    onChange={(e) => setObjForm((prev) => ({ ...prev, endDate: String(e.detail.value) }))}
                  >
                    <View className="form-picker half">
                      <Text className={objForm.endDate ? '' : 'form-picker-placeholder'}>
                        {objForm.endDate || '选择日期'}
                      </Text>
                      <Text className="form-picker-arrow">▾</Text>
                    </View>
                  </Picker>
                  <Picker
                    mode="time"
                    value={objForm.endTime}
                    onChange={(e) => setObjForm((prev) => ({ ...prev, endTime: String(e.detail.value) }))}
                  >
                    <View className="form-picker half">
                      <Text>{objForm.endTime}</Text>
                      <Text className="form-picker-arrow">▾</Text>
                    </View>
                  </Picker>
                </View>
              </View>
            ) : null}
            <View className="form-item">
              <Text className="form-label">{t('objective.motivations')}</Text>
              <View className="tag-wrap">
                {objForm.motivations.map((m, i) => (
                  <Text key={i} className="summit-tag editable-tag" onClick={() => removeTag('motivations', i)}>
                    {m} ×
                  </Text>
                ))}
              </View>
              <View className="tag-input-row">
                <Input
                  className="form-input flex-1"
                  value={motivationInput}
                  placeholder="输入动机"
                  onInput={(e) => setMotivationInput(e.detail.value)}
                />
                <View className="tag-add-btn" onClick={() => addTag('motivations')}>
                  <Text>{t('common.add')}</Text>
                </View>
              </View>
            </View>
            <View className="form-item">
              <Text className="form-label">{t('objective.feasibility')}</Text>
              <View className="tag-wrap">
                {objForm.feasibilities.map((f, i) => (
                  <Text key={i} className="summit-tag summit-tag--success editable-tag" onClick={() => removeTag('feasibilities', i)}>
                    {f} ×
                  </Text>
                ))}
              </View>
              <View className="tag-input-row">
                <Input
                  className="form-input flex-1"
                  value={feasibilityInput}
                  placeholder="输入可行性"
                  onInput={(e) => setFeasibilityInput(e.detail.value)}
                />
                <View className="tag-add-btn" onClick={() => addTag('feasibilities')}>
                  <Text>{t('common.add')}</Text>
                </View>
              </View>
            </View>
            <View className="popup-btns">
              <View className="summit-btn summit-btn--ghost popup-btn" onClick={() => setObjDialogVisible(false)}>
                <Text>{t('common.cancel')}</Text>
              </View>
              <View className={`summit-btn popup-btn ${objCreating ? 'is-disabled' : ''}`} onClick={handleCreateObjective}>
                <Text>{objCreating ? '...' : t('common.create')}</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
