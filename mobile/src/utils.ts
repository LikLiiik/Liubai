export function dateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function nextDay(key: string): string {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return dateKey(date);
}

export function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;
}

export function durationText(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours} 小时${remainder ? ` ${remainder} 分钟` : ''}`;
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function taskPosition(task: { date: string | null; start: number | null }, today: string): string {
  if (!task.date) return '收集箱';
  const day = task.date === today ? '今天' : task.date === nextDay(today) ? '明天' : task.date.slice(5).replace('-', '/');
  return task.start === null ? `${day} · 待安排` : `${day} ${clock(task.start)}`;
}
