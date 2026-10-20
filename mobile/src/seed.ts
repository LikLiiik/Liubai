import type { AppData, Settings, Task } from './types.ts';
import { dateKey, nextDay } from './utils.ts';

export const defaultSettings = { dayStart: 9 * 60, dayEnd: 18 * 60, buffer: 10 };

export function createDemo(today = dateKey()): AppData {
  const base: Task = { id: '', title: '', notes: '', duration: 30, category: 'work', priority: 'normal', important: false, fixed: false, completed: false, date: today, start: null, deadline: null, postponed: 0 };
  return {
    version: 1, demo: true, settings: { ...defaultSettings }, history: [], tasks: [
      { ...base, id: 'demo-1', title: '整理本周的项目方向', duration: 45, start: 540, completed: true, completedAt: `${today}T09:45:00`, important: true },
      { ...base, id: 'demo-2', title: '和团队对齐设计进度', duration: 45, start: 600, fixed: true, completed: true, completedAt: `${today}T10:45:00` },
      { ...base, id: 'demo-3', title: '把产品方案写清楚', notes: '完成用户场景、核心流程和第一版范围。先写出可以讨论的一稿。', duration: 90, start: 840, priority: 'high', important: true, deadline: today },
      { ...base, id: 'demo-4', title: '项目进度碰个头', notes: '固定会议，调整计划时保持时间不变。', duration: 30, start: 960, fixed: true },
      { ...base, id: 'demo-5', title: '处理邮件与零碎事项', duration: 40, start: 990, priority: 'low' },
      { ...base, id: 'demo-6', title: '出门走走，给自己充个电', duration: 40, start: 1040, category: 'health' },
      { ...base, id: 'demo-7', title: '整理下次旅行的灵感', duration: 30, date: null, category: 'life', priority: 'low' },
      { ...base, id: 'demo-8', title: '给个人网站找一些参考', duration: 45, date: null, postponed: 3 },
      { ...base, id: 'demo-9', title: '准备明天要讨论的提纲', duration: 30, date: nextDay(today), priority: 'normal' },
    ],
  };
}

export function createEmpty(settings: Settings = defaultSettings): AppData {
  return { version: 1, demo: false, settings: { ...settings }, history: [], tasks: [] };
}

// Only an untouched legacy fixture is disposable. Any edits/imports/history may be personal work.
export function personalData(data: AppData): AppData {
  if (!data.demo) return data;
  const anchor = data.tasks.find(task => task.id === 'demo-1')?.date;
  const fixture = anchor ? createDemo(anchor) : null;
  const untouched = fixture && !data.history.length && data.tasks.length === fixture.tasks.length
    && fixture.tasks.every(example => {
      const task = data.tasks.find(item => item.id === example.id);
      return task && [...new Set([...Object.keys(example), ...Object.keys(task)])].every(key =>
        JSON.stringify(task[key as keyof Task]) === JSON.stringify(example[key as keyof Task]));
    });
  return untouched ? createEmpty(data.settings) : { ...data, demo: false, history: data.history.map(entry => ({ ...entry, snapshotDemo: false })) };
}
