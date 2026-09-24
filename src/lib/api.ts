import http from './http';
import type {
  AuthResponse,
  AuthTokens,
  LoginDto,
  RegisterDto,
  User,
  UpdateUserDto,
  GoalGroup,
  CreateGoalGroupDto,
  UpdateGoalGroupDto,
  Objective,
  CreateObjectiveDto,
  UpdateObjectiveDto,
  Record,
  CreateRecordDto,
  UpdateRecordDto,
  RecordTrendPoint,
  Memo,
  CreateMemoDto,
  UpdateMemoDto,
  Task,
  CreateTaskDto,
  UpdateTaskDto,
  Vision,
  CreateVisionDto,
  UpdateVisionDto,
  Review,
  CreateReviewDto,
  UpdateReviewDto,
  SummaryData,
  GanttData,
  FocusCycle,
  CreateFocusCycleDto,
  UpdateFocusCycleDto,
  AiPlanGoalDto,
  AiPlanGoalResult,
  AiPlanTaskDto,
  AiPlanTaskResult,
  AiSuggestScoreResult,
  AiSuggestMotivationsDto,
  AiSuggestMotivationsResult,
  AiConversation,
  AiMessage,
  AiUsageStat,
  AiWeeklyReportResult,
  CheckIn,
  CheckInStatus,
  AppNotification,
  RecycleItem,
  RecycleEntityType,
  UserSettings,
} from './types';

// ============ Auth ============
export const authApi = {
  register: (dto: RegisterDto) => http.post<AuthResponse>('/auth/register', dto),
  login: (dto: LoginDto) => http.post<AuthResponse>('/auth/login', dto),
  refresh: (refreshToken: string) => http.post<AuthTokens>('/auth/refresh', { refreshToken }),
  profile: () => http.get<User>('/auth/profile'),
};

// ============ User ============
export const userApi = {
  getMe: () => http.get<User>('/users/me'),
  updateMe: (dto: UpdateUserDto) => http.patch<User>('/users/me', dto),
  getSettings: () => http.get<UserSettings>('/users/me/settings'),
  updateSettings: (dto: Partial<UserSettings>) => http.put<UserSettings>('/users/me/settings', dto),
};

// ============ Vision ============
export const visionApi = {
  list: () => http.get<Vision[]>('/visions'),
  create: (dto: CreateVisionDto) => http.post<Vision>('/visions', dto),
  update: (id: string, dto: UpdateVisionDto) => http.patch<Vision>(`/visions/${id}`, dto),
  markAchieved: (id: string) => http.post<Vision>(`/visions/${id}/achieve`),
  resetStatus: (id: string) => http.post<Vision>(`/visions/${id}/reset-status`),
  remove: (id: string) => http.delete(`/visions/${id}`),
};

// ============ GoalGroup ============
export const goalGroupApi = {
  getTree: (includeObjectives = false) =>
    http.get<GoalGroup[]>('/goal-groups', { params: { includeObjectives } }),
  create: (dto: CreateGoalGroupDto) => http.post<GoalGroup>('/goal-groups', dto),
  update: (id: string, dto: UpdateGoalGroupDto) => http.patch<GoalGroup>(`/goal-groups/${id}`, dto),
  remove: (id: string) => http.delete(`/goal-groups/${id}`),
  reorder: (ids: string[]) => http.post('/goal-groups/reorder', { ids }),
};

// ============ Objective ============
export const objectiveApi = {
  list: (params: { goalGroupId?: string; status?: string; page?: number; pageSize?: number }) =>
    http.get<{ list: Objective[]; total: number }>('/objectives', { params }),
  getById: (id: string) => http.get<Objective>(`/objectives/${id}`),
  create: (dto: CreateObjectiveDto) => http.post<Objective>('/objectives', dto),
  update: (id: string, dto: UpdateObjectiveDto) => http.patch<Objective>(`/objectives/${id}`, dto),
  remove: (id: string) => http.delete(`/objectives/${id}`),
};

// ============ KeyResult ============
export const keyResultApi = {
  listByObjective: (objectiveId: string) =>
    http.get<import('./types').KeyResult[]>(`/key-results/by-objective/${objectiveId}`),
  create: (dto: import('./types').CreateKeyResultDto) =>
    http.post<import('./types').KeyResult>('/key-results', dto),
  update: (id: string, dto: import('./types').UpdateKeyResultDto) =>
    http.patch<import('./types').KeyResult>(`/key-results/${id}`, dto),
  remove: (id: string) => http.delete(`/key-results/${id}`),
};

// ============ Record ============
export const recordApi = {
  getTrend: (keyResultId: string) => http.get<RecordTrendPoint[]>(`/records/trend/${keyResultId}`),
  create: (dto: CreateRecordDto) => http.post<Record>('/records', dto),
  update: (id: string, dto: UpdateRecordDto) => http.patch<Record>(`/records/${id}`, dto),
  remove: (id: string) => http.delete(`/records/${id}`),
};

// ============ Memo ============
export const memoApi = {
  list: (ownerType: string, ownerId: string) => http.get<Memo[]>('/memos', { params: { ownerType, ownerId } }),
  create: (dto: CreateMemoDto) => http.post<Memo>('/memos', dto),
  update: (id: string, dto: UpdateMemoDto) => http.patch<Memo>(`/memos/${id}`, dto),
  remove: (id: string) => http.delete(`/memos/${id}`),
};

// ============ Task ============
export const taskApi = {
  list: (params: { status?: string; date?: string }) => http.get<Task[]>('/tasks', { params }),
  create: (dto: CreateTaskDto) => http.post<Task>('/tasks', dto),
  update: (id: string, dto: UpdateTaskDto) => http.patch<Task>(`/tasks/${id}`, dto),
  complete: (id: string, completed: boolean) => http.post<Task>(`/tasks/${id}/complete`, { completed }),
  remove: (id: string) => http.delete(`/tasks/${id}`),
  deleteOverdue: () => http.post<{ count: number }>('/tasks/delete-overdue'),
  batchDelete: (ids: string[]) => http.post<{ count: number }>('/tasks/batch-delete', { ids }),
};

// ============ FocusCycle ============
export const focusCycleApi = {
  getActive: () => http.get<FocusCycle | null>('/focus-cycles/active'),
  create: (dto: CreateFocusCycleDto) => http.post<FocusCycle>('/focus-cycles', dto),
  update: (id: string, dto: UpdateFocusCycleDto) => http.patch<FocusCycle>(`/focus-cycles/${id}`, dto),
  updateWeight: (cycleId: string, objectiveId: string, weight: number) =>
    http.patch(`/focus-cycles/${cycleId}/objectives/${objectiveId}/weight`, { weight }),
  endCycle: (cycleId: string) => http.post(`/focus-cycles/${cycleId}/end`),
};

// ============ Review ============
export const reviewApi = {
  list: (type?: string) => http.get<Review[]>('/reviews', { params: { type } }),
  listByObjective: (objectiveId: string) => http.get<Review[]>(`/reviews/by-objective/${objectiveId}`),
  create: (dto: CreateReviewDto) => http.post<Review>('/reviews', dto),
  update: (id: string, dto: UpdateReviewDto) => http.patch<Review>(`/reviews/${id}`, dto),
  remove: (id: string) => http.delete(`/reviews/${id}`),
};

// ============ Summary / Gantt ============
export const summaryApi = {
  get: () => http.get<SummaryData>('/summary'),
};

export const ganttApi = {
  get: (params: { scope?: 'all' | 'cycle'; goalGroupId?: string }) => http.get<GanttData>('/gantt', { params }),
};

// ============ Data Export/Import ============
export const dataApi = {
  export: () => http.get<unknown>('/data/export'),
  import: (data: unknown, conflict: 'skip' | 'overwrite' = 'skip') =>
    http.post('/data/import', data, { params: { conflict } }),
};

// ============ Feedback ============
export interface Feedback {
  id: string;
  type: string;
  content: string;
  contact: string | null;
  status: string;
  createdAt: string | Date;
}

export const feedbackApi = {
  create: (dto: { type: string; content: string; contact?: string }) => http.post<Feedback>('/feedback', dto),
  list: () => http.get<Feedback[]>('/feedback'),
};

// ============ AI ============
export const aiApi = {
  planGoal: (dto: AiPlanGoalDto) => http.post<AiPlanGoalResult>('/ai/plan-goal', dto),
  planTasks: (dto: AiPlanTaskDto) => http.post<AiPlanTaskResult>('/ai/plan-tasks', dto),
  suggestScore: (objectiveId: string) => http.post<AiSuggestScoreResult>('/ai/suggest-score', { objectiveId }),
  suggestMotivations: (dto: AiSuggestMotivationsDto) =>
    http.post<AiSuggestMotivationsResult>('/ai/suggest-motivations', dto),
  weeklyReport: () => http.post<AiWeeklyReportResult>('/ai/weekly-report'),
  listConversations: () => http.get<AiConversation[]>('/ai/conversations'),
  getConversation: (id: string) => http.get<AiMessage[]>(`/ai/conversations/${id}`),
  getUsage: () => http.get<AiUsageStat>('/ai/usage'),
};

// ============ Check-in ============
export const checkinApi = {
  status: () => http.get<CheckInStatus>('/checkins/status'),
  upsertThisWeek: (note?: string) =>
    http.put<CheckIn>('/checkins/this-week', { note, tzOffsetMin: -new Date().getTimezoneOffset() }),
  history: () => http.get<CheckIn[]>('/checkins/history'),
};

// ============ Notification ============
export const notificationApi = {
  list: () => http.get<{ list: AppNotification[]; unread: number }>('/notifications'),
  markRead: (id: string) => http.post(`/notifications/${id}/read`),
  markAllRead: () => http.post('/notifications/read-all'),
  remove: (id: string) => http.delete(`/notifications/${id}`),
};

// ============ Recycle Bin ============
export const recycleApi = {
  list: () => http.get<RecycleItem[]>('/recycle'),
  restore: (entityType: RecycleEntityType, id: string) => http.post('/recycle/restore', { entityType, id }),
  destroy: (entityType: RecycleEntityType, id: string) => http.post('/recycle/destroy', { entityType, id }),
  empty: () => http.delete<{ count: number }>('/recycle/empty'),
};
