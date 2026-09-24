/**
 * @summit-okr/api-types
 * Summit OKR 项目共享 TypeScript 类型定义
 * 前后端共享，确保类型一致
 */

// ============ 通用响应 ============

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

export interface PaginatedResponse<T> {
  code: number;
  message: string;
  data: {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
  };
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

// ============ 错误码 ============

export const ErrorCode = {
  SUCCESS: 0,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_ERROR: 500,
} as const;

// ============ 用户模块 ============

export interface User {
  id: string;
  email: string;
  username: string;
  avatar?: string | null;
  bio?: string | null;
  birthDate?: string | Date | null;
  preferredLocale: SupportedLocale;
  preferredTheme: ThemeName;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export type SupportedLocale = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP';
export type ThemeName = 'light' | 'dark' | 'blue' | 'green' | 'purple' | 'macos';
/** 外观模式：日间 / 夜间 / 跟随系统 */
export type ColorMode = 'light' | 'dark' | 'system';

export interface RegisterDto {
  email: string;
  username: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse extends AuthTokens {
  user: User;
}

export interface RefreshTokenDto {
  refreshToken: string;
}

export interface UpdateUserDto {
  username?: string;
  avatar?: string;
  bio?: string;
  birthDate?: string | null;
  preferredLocale?: SupportedLocale;
  preferredTheme?: ThemeName;
}

// ============ 个人愿景 ============

export type VisionStatus = 'upcoming' | 'in_progress' | 'achieved' | 'expired';

export interface Vision {
  id: string;
  userId: string;
  content: string;
  startAge?: number;
  endAge?: number;
  status: VisionStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
  objectives?: Objective[]; // 派生：愿景树（根节点及其后代）下的所有目标
  progress?: number; // 派生：关联目标的平均进度 0-1
}

export interface CreateVisionDto {
  content: string;
  startAge?: number;
  endAge?: number;
}

export interface UpdateVisionDto extends Partial<CreateVisionDto> {}

// ============ 目标节点（GoalGroup） ============

export interface GoalGroup {
  id: string;
  userId: string;
  parentId: string | null;
  /** 所属愿景（仅根节点有值），目标通过所在树自动归属愿景 */
  visionId?: string | null;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  children?: GoalGroup[];
  objectives?: Objective[];
  vision?: Vision | null;
  /** 派生：子树目标总数 */
  objectiveCount?: number;
  /** 派生：子树目标平均进度 0-1 */
  progress?: number;
}

export interface CreateGoalGroupDto {
  parentId?: string | null;
  /** 创建根节点时指定所属愿景 */
  visionId?: string | null;
  name: string;
  color?: string;
}

export interface UpdateGoalGroupDto {
  name?: string;
  color?: string;
  parentId?: string | null;
  /** 所属愿景（仅根节点可设置） */
  visionId?: string | null;
  sortOrder?: number;
}

export interface GoalGroupTreeQuery {
  includeObjectives?: boolean;
}

// ============ 目标（Objective） ============

export type ObjectiveStatus =
  | 'unplanned'
  | 'not_started'
  | 'in_progress'
  | 'pending_review'
  | 'completed';

export interface Objective {
  id: string;
  userId: string;
  goalGroupId: string;
  title: string;
  color: string;
  startAt: string | Date | null;
  endAt: string | Date | null;
  motivations: string[];
  feasibilities: string[];
  status: ObjectiveStatus;
  weight: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  goalGroup?: GoalGroup;
  keyResults?: KeyResult[];
  reviews?: Review[];
  currentProgress?: number; // 派生：当前完成度 0-1
  expectedProgress?: number; // 派生：今日预期完成度
  isLagging?: boolean; // 派生：是否滞后
}

export interface CreateObjectiveDto {
  goalGroupId: string;
  title: string;
  color?: string;
  startAt?: string;
  endAt?: string;
  motivations?: string[];
  feasibilities?: string[];
}

export interface UpdateObjectiveDto {
  goalGroupId?: string;
  title?: string;
  color?: string;
  startAt?: string | null;
  endAt?: string | null;
  motivations?: string[];
  feasibilities?: string[];
}

export interface ObjectiveListQuery extends PageQuery {
  goalGroupId?: string;
  status?: ObjectiveStatus;
  includeProgress?: boolean;
}

// ============ 关键结果（KeyResult） ============

export type CalculationType =
  | 'sum'
  | 'final'
  | 'average'
  | 'max'
  | 'custom';

export type KrConfidence = 'on_track' | 'at_risk' | 'off_track';

export interface KeyResult {
  id: string;
  objectiveId: string;
  title: string;
  emoji: string;
  initialValue: number;
  targetValue: number;
  currentValue: number;
  calculationType: CalculationType;
  customFormula?: string | null;
  weight: number;
  minRecordCount: number;
  confidence?: KrConfidence;
  sortOrder: number;
  deletedAt?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  records?: Record[];
  memos?: Memo[];
  currentProgress?: number; // 派生：当前完成度 0-1
}

export interface CreateKeyResultDto {
  objectiveId: string;
  title: string;
  emoji?: string;
  initialValue: number;
  targetValue: number;
  calculationType?: CalculationType;
  customFormula?: string;
  weight?: number;
  minRecordCount?: number;
}

export interface UpdateKeyResultDto {
  title?: string;
  emoji?: string;
  initialValue?: number;
  targetValue?: number;
  calculationType?: CalculationType;
  customFormula?: string | null;
  weight?: number;
  minRecordCount?: number;
  sortOrder?: number;
  confidence?: KrConfidence;
}

// ============ 记录（Record） ============

export interface Record {
  id: string;
  keyResultId: string;
  value: number;
  note?: string | null;
  recordedAt: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateRecordDto {
  keyResultId: string;
  value: number;
  note?: string;
  recordedAt?: string;
}

export interface UpdateRecordDto {
  value?: number;
  note?: string | null;
  recordedAt?: string;
}

export interface RecordTrendPoint {
  recordedAt: string;
  value: number;
  cumulativeValue: number; // 累计值（用于趋势图）
}

// ============ 备忘（Memo） ============

export type MemoOwnerType = 'record' | 'key_result' | 'objective';

export interface Memo {
  id: string;
  userId: string;
  ownerType: MemoOwnerType;
  ownerId: string;
  content: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateMemoDto {
  ownerType: MemoOwnerType;
  ownerId: string;
  content: string;
}

export interface UpdateMemoDto {
  content: string;
}

// ============ 任务（Task） ============

export type TaskStatus = 'pending' | 'completed';
export type RepeatRule =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'weekdays';

export interface Task {
  id: string;
  userId: string;
  objectiveId: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  completedAt: string | Date | null;
  scheduledAt: string | Date | null;
  repeatRule: RepeatRule;
  repeatEndDate: string | Date | null;
  contribution?: string | null;
  syncedToCalendar: boolean;
  deletedAt?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateTaskDto {
  objectiveId?: string | null;
  title: string;
  description?: string;
  scheduledAt?: string;
  repeatRule?: RepeatRule;
  repeatEndDate?: string;
  contribution?: string;
}

export interface UpdateTaskDto {
  objectiveId?: string | null;
  title?: string;
  description?: string | null;
  scheduledAt?: string | null;
  repeatRule?: RepeatRule;
  repeatEndDate?: string | null;
  contribution?: string | null;
}

export interface CompleteTaskParams {
  taskId: string;
  completed: boolean;
}

// ============ 专注周期（FocusCycle） ============

export interface FocusCycleObjective {
  objectiveId: string;
  weight: number;
  objective?: Objective;
}

export interface FocusCycle {
  id: string;
  userId: string;
  name: string;
  startAt: string | Date;
  endAt: string | Date;
  isActive: boolean;
  cycleScore?: number; // 派生：周期得分 0-100
  objectives: FocusCycleObjective[];
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateFocusCycleDto {
  name: string;
  objectiveIds: string[];
  weights?: { [key: string]: number }; // objectiveId -> weight
  startAt?: string; // B5.5: 手动指定起止时间（不传则自动计算）
  endAt?: string;
}

export interface UpdateFocusCycleDto {
  name?: string;
  startAt?: string;
  endAt?: string;
}

export interface UpdateFocusCycleObjectiveWeightDto {
  objectiveId: string;
  weight: number;
}

// ============ 复盘（Review） ============

export type ReviewType = 'midterm' | 'final';

export interface KrScore {
  keyResultId: string;
  score: number; // 0-1
  note?: string;
}

export interface Review {
  id: string;
  objectiveId: string;
  userId: string;
  type: ReviewType;
  version: number;
  krScores: KrScore[];
  selfRating: number; // 0-1
  objectiveScore?: number | null; // 期末复盘时的目标得分 0-100
  scoreGuidance?: string; // 评分引导
  problems?: string | null;
  solutions?: string | null;
  thoughts?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateReviewDto {
  objectiveId: string;
  type: ReviewType;
  krScores: KrScore[];
  selfRating: number;
  problems?: string;
  solutions?: string;
  thoughts?: string;
}

export interface UpdateReviewDto {
  krScores?: KrScore[];
  selfRating?: number;
  problems?: string | null;
  solutions?: string | null;
  thoughts?: string | null;
}

// ============ 摘要（Summary） ============

export interface SummaryData {
  activeFocusCycle: FocusCycle | null;
  totalObjectives: number;
  inProgressObjectives: number;
  completedObjectives: number;
  laggingObjectives: Objective[];
  todayTasks: Task[];
  randomMotivation: string | null;
  /** 今日新增记录数 */
  todayAddedRecords?: number;
  /** 今日任务总数（含已完成） */
  todayTaskCount?: number;
  /** 活跃周期剩余天数（无周期时 null） */
  cycleDaysRemaining?: number | null;
  /** 活跃周期时间进度 0-1 */
  cycleTimeProgress?: number | null;
  /** 今日整体进度增量（因今日记录带来的平均完成度提升，0-1） */
  todayProgressDelta?: number | null;
}

// ============ 甘特图（Gantt） ============

export interface GanttItem {
  id: string;
  title: string;
  color: string;
  startAt: string;
  endAt: string;
  currentProgress: number;
  expectedProgress: number;
  isLagging: boolean;
  status: ObjectiveStatus;
  worstConfidence?: KrConfidence; // 该目标下最差的 KR 信心度（off_track > at_risk > on_track）
}

export interface GanttData {
  items: GanttItem[];
  todayLine: string;
  rangeStart: string;
  rangeEnd: string;
}

// ============ 枚举工具类型 ============

export const CalculationTypeLabel = {
  sum: '求和',
  final: '最终值',
  average: '平均值',
  max: '最大值',
  custom: '自定义',
} as const;

export const ObjectiveStatusLabel = {
  unplanned: '未计划',
  not_started: '未开始',
  in_progress: '进行中',
  pending_review: '待复盘',
  completed: '已复盘',
} as const;

export const TaskStatusLabel = {
  pending: '未完成',
  completed: '已完成',
} as const;

// ============ AI ============

export type AiIntent =
  | 'plan_goal'
  | 'plan_tasks'
  | 'suggest_score'
  | 'suggest_motivations'
  | 'weekly_report';

export interface AiPlanGoalDto {
  goal: string;
  context?: string;
  goalGroupId?: string;
}

export interface AiPlannedKr {
  title: string;
  initialValue: number;
  targetValue: number;
  calculationType: CalculationType;
  emoji?: string;
  weight?: number;
}

export interface AiPlanGoalResult {
  objective: {
    title: string;
    motivations?: string[];
    feasibilities?: string[];
  };
  keyResults: AiPlannedKr[];
}

export interface AiPlanTaskDto {
  objectiveId?: string;
  keyResultId?: string;
  context?: string;
}

export interface AiPlannedTask {
  title: string;
  description?: string;
  scheduledAt?: string;
  repeatRule?: RepeatRule;
  contribution?: string;
}

export interface AiPlanTaskResult {
  tasks: AiPlannedTask[];
}

export interface AiSuggestScoreResult {
  krScores: { keyResultId: string; score: number; note?: string }[];
  selfRating: number;
  reasoning?: string;
}

export interface AiSuggestMotivationsDto {
  objectiveTitle: string;
  context?: string;
}

export interface AiSuggestMotivationsResult {
  motivations: string[];
}

export interface AiConversation {
  id: string;
  userId: string;
  title: string;
  intent: AiIntent;
  createdAt: string | Date;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
  tokensUsed?: number;
  createdAt: string | Date;
}

export interface AiUsageStat {
  used: number;
  limit: number;
  resetAt: string | Date;
}

// ============ AI 周报 ============

export interface AiWeeklyReportResult {
  summary: string; // 本周总体概述
  highlights: string[]; // 进展亮点
  risks: string[]; // 风险与滞后
  nextWeek: string[]; // 下周建议
}

// ============ 每周 Check-in ============

export interface CheckIn {
  id: string;
  userId: string;
  weekStart: string | Date;
  note?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface UpsertCheckInDto {
  note?: string;
  tzOffsetMin?: number; // 用户时区偏移（分钟），如 UTC+8 = 480
}

export interface CheckInStatus {
  weekStart: string;
  weekEnd: string;
  done: boolean;
  checkIn?: CheckIn | null;
  krUpdatedCount: number; // 本周有记录更新的 KR 数
  totalActiveKrCount: number; // 进行中目标的 KR 总数
  streak: number; // 连续打卡周数
}

// ============ 用户设置 ============

export interface NotifPrefs {
  stale_kr: boolean;
  cycle_ending: boolean;
  review_pending: boolean;
  task_overdue: boolean;
  checkin_reminder: boolean;
}

export interface UserSettings {
  notifPrefs: NotifPrefs;
}

// ============ 通知 ============

export type NotificationType =
  | 'stale_kr'
  | 'cycle_ending'
  | 'review_pending'
  | 'task_overdue'
  | 'checkin_reminder';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  read: boolean;
  createdAt: string | Date;
}

// ============ 回收站 ============

export type RecycleEntityType = 'objective' | 'key_result' | 'task';

export interface RecycleItem {
  id: string;
  entityType: RecycleEntityType;
  title: string;
  meta?: string; // 补充说明（所属目标 / 计划时间等）
  deletedAt: string | Date;
}
