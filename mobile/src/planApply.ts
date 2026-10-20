import type { AppData, PlanHistory, PlanResult } from './types.ts';

export function applyPlanToData(data: AppData, plan: PlanResult, entry: Pick<PlanHistory, 'id' | 'date' | 'createdAt' | 'title'>,
  demo = data.demo): { data: AppData; error?: string } {
  if (!plan.valid || !plan.changes.length || new Set(plan.tasks.map(task => task.id)).size !== plan.tasks.length) {
    return { data, error: '方案无法套用，请重新检查预览。' };
  }
  if (plan.sourceTasks && JSON.stringify(data.tasks) !== JSON.stringify(plan.sourceTasks)
    || plan.sourceSettings && JSON.stringify(data.settings) !== JSON.stringify(plan.sourceSettings)) {
    return { data, error: '日程或偏好已变更，请重新查看调整预览。' };
  }
  if (JSON.stringify(data.tasks) === JSON.stringify(plan.tasks)) return { data, error: '这个方案已套用，无需重复调整。' };
  return { data: { ...data, demo, tasks: plan.tasks, history: [{ ...entry, changes: plan.changes, snapshot: data.tasks,
    snapshotDemo: data.demo, appliedTasks: plan.tasks }, ...data.history].slice(0, 20) } };
}
