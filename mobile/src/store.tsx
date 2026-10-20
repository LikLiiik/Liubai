import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { AppData, PlanResult, Settings, Task } from './types';
import { storage } from './storage';
import { createDemo, createEmpty } from './seed';
import { dateKey, uid } from './utils';
import { syncNotifications } from './notifications';
import { planningContext, validSettings } from './time';

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
  mutateTasks: (update: (tasks: Task[]) => Task[]) => void;
  applyPlan: (plan: PlanResult, title: string, options?: { demo: boolean }) => void;
  undoPlan: () => void;
  updateSettings: (settings: Settings) => void;
  reset: (demo: boolean) => void;
  reload: () => void;
};

const Context = createContext<Store | null>(null);

function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false;
  const data = value as AppData;
  return data.version === 1 && typeof data.demo === 'boolean' && Array.isArray(data.tasks) && Array.isArray(data.history)
    && !!data.settings && validSettings(data.settings)
    && data.tasks.every(task => typeof task.id === 'string' && typeof task.title === 'string'
      && Number.isFinite(task.duration) && task.duration > 0 && task.duration <= 720
      && typeof task.completed === 'boolean' && typeof task.fixed === 'boolean'
      && typeof task.important === 'boolean' && typeof task.notes === 'string'
      && ['work', 'life', 'health'].includes(task.category) && ['high', 'normal', 'low'].includes(task.priority)
      && (task.start === null || Number.isInteger(task.start) && task.start >= 0 && task.start < 1440)
      && (task.date === null || /^\d{4}-\d{2}-\d{2}$/.test(task.date))
      && (task.deadline === null || /^\d{4}-\d{2}-\d{2}$/.test(task.deadline))
      && Number.isFinite(task.postponed)
      && (!task.courseImport || task.courseImport.school === 'hitsz' && typeof task.courseImport.semester === 'string'
        && typeof task.courseImport.key === 'string' && typeof task.courseImport.fingerprint === 'string'
        && (task.courseImport.sample === undefined || typeof task.courseImport.sample === 'boolean')));
}

export function PlanningProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(createEmpty);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saving');
  const [toast, setToast] = useState<string | null>(null);
  const [tick, setTick] = useState(() => new Date());
  const writeQueue = useRef(Promise.resolve());
  const notify = useCallback((message: string) => setToast(message), []);
  const readData = useCallback(() => {
    return storage.get().then(raw => {
      if (!raw) setData(createDemo());
      else {
        const parsed: unknown = JSON.parse(raw);
        if (!isAppData(parsed)) throw new Error('本地数据格式无法识别');
        setData(parsed);
      }
      setLoadError(null);
    }).catch(() => setLoadError('暂时无法读取本地数据。你可以重试，原有数据不会被覆盖。')).finally(() => setLoading(false));
  }, []);

  const reload = useCallback(() => { setLoading(true); setLoadError(null); void readData(); }, [readData]);
  useEffect(() => { void readData(); }, [readData]);
  useEffect(() => {
    const timer = setInterval(() => setTick(new Date()), 30000);
    return () => clearInterval(timer);
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
  }, [data, loading, loadError, notify]);

  const mutateTasks = useCallback((update: (tasks: Task[]) => Task[]) => {
    setData(previous => ({ ...previous, tasks: update(previous.tasks) }));
  }, []);
  const today = dateKey(tick);
  const applyPlan = useCallback((plan: PlanResult, title: string, options?: { demo: boolean }) => {
    if (!plan.valid) return;
    setData(previous => ({ ...previous, demo: options?.demo ?? previous.demo, tasks: plan.tasks, history: [{ id: uid(), date: today,
      createdAt: new Date().toISOString(), title, changes: plan.changes, snapshot: previous.tasks, snapshotDemo: previous.demo, appliedTasks: plan.tasks }, ...previous.history].slice(0, 20) }));
    notify('新计划已安排好，可以在回顾中撤销。');
  }, [today, notify]);
  const undoPlan = useCallback(() => {
    setData(previous => {
      const latest = previous.history[0];
      if (!latest) return previous;
      if (JSON.stringify(previous.tasks) !== JSON.stringify(latest.appliedTasks)) return previous;
      return { ...previous, demo: latest.snapshotDemo ?? previous.demo, tasks: latest.snapshot, history: previous.history.slice(1) };
    });
  }, []);
  const updateSettings = useCallback((settings: Settings) => setData(previous => ({ ...previous, settings })), []);
  const reset = useCallback((demo: boolean) => {
    setLoadError(null);
    setData(demo ? createDemo() : createEmpty());
    notify(demo ? '已载入示例日程，模拟时间为 14:00。' : '空白的一天，准备好了。');
  }, [notify]);

  const now = data.demo ? 840 : tick.getHours() * 60 + tick.getMinutes();
  const planning = planningContext(today, now, data.settings);
  return <Context.Provider value={{ data, loading, loadError, saveStatus, today, now,
    planningDate: planning.date, planningNow: planning.now, toast, notify, mutateTasks, applyPlan,
    undoPlan, updateSettings, reset, reload }}>{children}</Context.Provider>;
}

export function usePlanning() {
  const value = useContext(Context);
  if (!value) throw new Error('PlanningProvider missing');
  return value;
}
