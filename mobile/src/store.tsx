import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { AppData, PlanResult, Settings, Task } from './types';
import { storage } from './storage';
import { createEmpty, personalData } from './seed';
import { dateKey, uid } from './utils';
import { syncNotifications } from './notifications';
import { planningContext, validSettings } from './time';
import { applyPlanToData } from './planApply';
import { addCategoryToData, knownCategory, type CategoryAddResult } from './categories';
import { validTaskTiming } from './quick';
import { createAdvancePlan, setTaskCompletion } from './completion';
import { completionAdvanceFor, previewCompletionUndo, validCompletionAdvance, type CompletionUndoChoice } from './completionUndo';
import { withNickname } from './profile';

type Store = {
  data: AppData;
  loading: boolean;
  loadError: string | null;
  saveStatus: 'saving' | 'saved' | 'error';
  today: string;
  now: number;
  planningDate: string;
  planningNow: number;
  toast: string | null;
  notify: (text: string) => void;
  mutateTasks: (update: (tasks: Task[]) => Task[]) => boolean;
  applyPlan: (plan: PlanResult, title: string, options?: { demo: boolean }) => boolean;
  undoPlan: () => void;
  updateSettings: (settings: Settings) => void;
  setNickname: (name: string) => void;
  addCategory: (name: string) => CategoryAddResult;
  setCompleted: (id: string, completed: boolean, consentKey?: string) => boolean;
  completionOffer: string | null;
  completionRestore: { taskId: string; key: string; conflicts: string[]; undo?: { choice: CompletionUndoChoice; previewKey: string } } | null;
  completionUndo: string | null;
  undoCompletion: (id: string, choice: CompletionUndoChoice, previewKey: string, consentKey?: string) => boolean;
  dismissCompletionOffer: () => void;
  reset: () => void;
  reload: () => void;
};

const Context = createContext<Store | null>(null);

function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false;
  const data = value as AppData;
  return data.version === 1 && typeof data.demo === 'boolean' && Array.isArray(data.tasks) && Array.isArray(data.history)
    && !!data.settings && validSettings(data.settings)
    && data.tasks.every(task => typeof task.id === 'string' && typeof task.title === 'string'
      && validTaskTiming(task)
      && typeof task.completed === 'boolean' && typeof task.fixed === 'boolean'
      && typeof task.important === 'boolean' && typeof task.notes === 'string'
      && knownCategory(task.category, data.settings) && ['high', 'normal', 'low'].includes(task.priority)
      && (task.start === null || Number.isInteger(task.start) && task.start >= 0 && task.start < 1440)
      && (task.date === null || /^\d{4}-\d{2}-\d{2}$/.test(task.date))
      && (task.deadline === null || /^\d{4}-\d{2}-\d{2}$/.test(task.deadline))
      && Number.isFinite(task.postponed)
      && (task.inboxReminderAfter === undefined || /^\d{4}-\d{2}-\d{2}$/.test(task.inboxReminderAfter))
      && (task.rescueInterruption === undefined || typeof task.rescueInterruption === 'boolean')
      && validCompletionAdvance(task.completionAdvance)
      && (!task.courseImport || task.courseImport.school === 'hitsz' && typeof task.courseImport.semester === 'string'
        && typeof task.courseImport.key === 'string' && typeof task.courseImport.fingerprint === 'string'
        && (task.courseImport.sample === undefined || typeof task.courseImport.sample === 'boolean')));
}

export function PlanningProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(createEmpty);
  const currentData = useRef(data);
  // Commit event handlers against the latest value even before React renders a
  // preceding tap. This prevents duplicate submits and stale whole-plan writes.
  const commit = useCallback((update: (previous: AppData) => AppData) => {
    const previous = currentData.current;
    const next = update(previous);
    if (next === previous) return false;
    currentData.current = next;
    setData(next);
    return true;
  }, []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saving');
  const [toast, setToast] = useState<string | null>(null);
  const [completionOffer, setCompletionOffer] = useState<string | null>(null);
  const [completionRestore, setCompletionRestore] = useState<Store['completionRestore']>(null);
  const [completionUndo, setCompletionUndo] = useState<string | null>(null);
  const [tick, setTick] = useState(() => new Date());
  const today = dateKey(tick);
  const timezoneOffset = tick.getTimezoneOffset();
  const writeQueue = useRef(Promise.resolve());
  const notify = useCallback((message: string) => setToast(message), []);
  const readData = useCallback(() => {
    return storage.get().then(raw => {
      if (!raw) commit(() => createEmpty());
      else {
        const parsed: unknown = JSON.parse(raw);
        if (!isAppData(parsed)) throw new Error('本地数据格式无法识别');
        commit(() => personalData(parsed));
      }
      setLoadError(null);
    }).catch(() => setLoadError('暂时无法读取本地数据。你可以重试，原有数据不会被覆盖。')).finally(() => setLoading(false));
  }, [commit]);

  const reload = useCallback(() => { setLoading(true); setLoadError(null); void readData(); }, [readData]);
  useEffect(() => { void readData(); }, [readData]);
  useEffect(() => {
    const timer = setInterval(() => setTick(new Date()), 30000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') setTick(new Date()); });
    return () => { clearInterval(timer); listener.remove(); };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (loading || loadError) return;
    writeQueue.current = writeQueue.current.then(async () => {
      setSaveStatus('saving');
      await storage.set(JSON.stringify(data));
      setSaveStatus('saved');
      if (Platform.OS !== 'web') {
        try { await syncNotifications(data); }
        catch { notify('日程已保存，但系统提醒更新失败，请检查通知权限。'); }
      }
    }).catch(() => { setSaveStatus('error'); notify('保存失败，请保留当前页面，并检查设备存储或浏览器权限。'); });
  }, [data, loading, loadError, notify, today, timezoneOffset]);
  useEffect(() => {
    if (Platform.OS === 'web' || loading || loadError) return;
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      writeQueue.current = writeQueue.current.then(() => syncNotifications(data))
        .catch(() => notify('系统提醒更新失败，请检查通知权限。'));
    });
    return () => listener.remove();
  }, [data, loading, loadError, notify]);

  const mutateTasks = useCallback((update: (tasks: Task[]) => Task[]) => {
    return commit(previous => { const tasks = update(previous.tasks); return tasks === previous.tasks ? previous : { ...previous, tasks }; });
  }, [commit]);
  const setCompleted = useCallback((id: string, completed: boolean, consentKey?: string) => {
    const moment = new Date();
    let offer = false;
    let restore: Store['completionRestore'] = null;
    let askUndo = false;
    const changed = commit(previous => {
      if (!completed && completionAdvanceFor(previous, id)) { askUndo = true; return previous; }
      const result = setTaskCompletion(previous.tasks, id, completed, moment.toISOString(), consentKey);
      if (result.confirmation) restore = { taskId: id, key: result.confirmation.key, conflicts: result.confirmation.conflicts.map(task => task.title) };
      const tasks = result.tasks;
      if (tasks === previous.tasks) return previous;
      const context = planningContext(dateKey(moment), moment.getHours() * 60 + moment.getMinutes(), previous.settings);
      offer = completed && createAdvancePlan(tasks, previous.settings, id, context.date, context.now).changes.length > 0;
      return { ...previous, tasks };
    });
    if (askUndo) { setCompletionOffer(null); setCompletionRestore(null); setCompletionUndo(id); }
    if (restore) { setCompletionOffer(null); setCompletionRestore(restore); }
    if (changed) {
      setCompletionUndo(null);
      setCompletionRestore(null);
      setCompletionOffer(offer ? id : null);
      notify(completed ? '已标记完成。' : '已恢复为待完成。');
    }
    return changed;
  }, [commit, notify]);
  const dismissCompletionOffer = useCallback(() => { setCompletionOffer(null); setCompletionRestore(null); setCompletionUndo(null); }, []);
  const undoCompletion = useCallback((id: string, choice: CompletionUndoChoice, previewKey: string, consentKey?: string) => {
    let restore: Store['completionRestore'] = null;
    let message = '';
    const changed = commit(previous => {
      const result = previewCompletionUndo(previous, id, choice);
      if (!result.valid) { message = '此事件的完成状态已变更。'; return previous; }
      if (result.key !== previewKey) { message = '日程已变化，请重新核对撤销预览。'; return previous; }
      if (result.conflicts.length && consentKey !== result.consentKey) {
        restore = { taskId: id, key: result.consentKey, conflicts: result.conflicts.map(task => task.title), undo: { choice, previewKey } };
        return previous;
      }
      message = choice === 'cancel-advance' ? `已撤销完成，${result.changes.length} 项恢复提前前的时间。${result.skipped.length ? '已变更的事项保持当前安排。' : ''}` : '已撤销完成，后续提前保持不变。';
      return { ...previous, tasks: result.tasks };
    });
    if (restore) setCompletionRestore(restore);
    else if (changed) { setCompletionOffer(null); setCompletionUndo(null); setCompletionRestore(null); }
    else { setCompletionRestore(null); setCompletionUndo(id); }
    if (message) notify(message);
    return changed;
  }, [commit, notify]);
  const applyPlan = useCallback((plan: PlanResult, title: string, options?: { demo: boolean }) => {
    let error: string | undefined;
    const applied = commit(previous => {
      const result = applyPlanToData(previous, plan, { id: uid(), date: today, createdAt: new Date().toISOString(), title }, options?.demo ?? previous.demo);
      error = result.error;
      return result.data;
    });
    notify(error ?? '新计划已安排好，可以在回顾中撤销。');
    return applied;
  }, [today, notify, commit]);
  const undoPlan = useCallback(() => {
    commit(previous => {
      const latest = previous.history[0];
      if (!latest) return previous;
      if (JSON.stringify(previous.tasks) !== JSON.stringify(latest.appliedTasks)) return previous;
      return { ...previous, demo: latest.snapshotDemo ?? previous.demo, tasks: latest.snapshot, history: previous.history.slice(1) };
    });
  }, [commit]);
  const updateSettings = useCallback((settings: Settings) => {
    // Independently saved profile/category data survives delayed permission responses.
    commit(previous => ({ ...previous, settings: { ...settings, nickname: previous.settings.nickname, ...(previous.settings.categories ? { categories: previous.settings.categories } : {}) } }));
  }, [commit]);
  const setNickname = useCallback((name: string) => {
    commit(previous => { const settings = withNickname(previous.settings, name); return settings ? { ...previous, settings } : previous; });
  }, [commit]);
  const addCategory = useCallback((name: string): CategoryAddResult => {
    let result: CategoryAddResult = { error: '未能添加分类，请重试。' };
    commit(previous => {
      const next = addCategoryToData(previous, name, uid());
      result = next.result;
      return next.data;
    });
    return result;
  }, [commit]);
  const reset = useCallback(() => {
    setLoadError(null);
    commit(previous => createEmpty(previous.settings));
    notify('空白的一天，准备好了。');
  }, [notify, commit]);

  const now = data.demo ? 840 : tick.getHours() * 60 + tick.getMinutes();
  const planning = planningContext(today, now, data.settings);
  return <Context.Provider value={{ data, loading, loadError, saveStatus, today, now,
    planningDate: planning.date, planningNow: planning.now, toast, notify, mutateTasks, applyPlan,
    undoPlan, updateSettings, setNickname, addCategory, setCompleted, completionOffer, completionRestore, completionUndo, undoCompletion, dismissCompletionOffer, reset, reload }}>{children}</Context.Provider>;
}

export function usePlanning() {
  const value = useContext(Context);
  if (!value) throw new Error('PlanningProvider missing');
  return value;
}
