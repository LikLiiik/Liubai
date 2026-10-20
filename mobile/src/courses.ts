import type { PlanResult, Task } from './types.ts';
import { calendarSegments, overlaps, shiftDate } from './time.ts';
import { clock } from './utils.ts';
import { validDate } from './week.ts';

export type Course = { key: string; title: string; weekday: number; weeks: number[]; periods: number[]; teacher: string; room: string; offset: number };
export type Semester = { year: string; term: string; monday: string };
export type CourseDraft = { courses: Course[]; issues: string[]; ignored: number };
export type CoursePreview = PlanResult & { added: number; updated: number; removed: number; unchanged: number; protected: number; conflicts: { key: string; message: string }[] };
export const UNDERGRADUATE_PERIODS = [
  [510, 560], [565, 615], [630, 680], [685, 735], [840, 890], [895, 945],
  [960, 1010], [1015, 1065], [1125, 1175], [1180, 1230], [1245, 1295], [1300, 1350],
] as const;

const text = (value: string) => value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(?:p|div)>/gi, '\n').replace(/<[^>]*>/g, '')
  .replace(/&nbsp;|&#160;/gi, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Math.min(65535, Number(number))))
  .replace(/&#x([\da-f]+);/gi, (_, number) => String.fromCodePoint(Math.min(65535, parseInt(number, 16))))
  .replace(/[０-９]/g, number => String.fromCharCode(number.charCodeAt(0) - 0xfee0))
  .replace(/\r/g, '').replace(/[［【]/g, '[').replace(/[］】]/g, ']');
const hash = (value: string) => {
  let first = 2166136261, second = 2246822507;
  for (let index = 0; index < value.length; index++) {
    first = Math.imul(first ^ value.charCodeAt(index), 16777619);
    second = Math.imul(second ^ value.charCodeAt(index), 3266489909);
  }
  return `${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
};

export function parseNumbers(value: string, maximum: number): number[] {
  let source = value.replace(/[，、；;]/g, ',').replace(/[－–—~～至]/g, '-').replace(/\s+/g, '');
  const odd = /单/.test(source), even = /双/.test(source);
  if (odd && even) throw new Error('单双周标记不明确');
  source = source.replace(/[第周节单双()（）]/g, '');
  if (!/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(source)) throw new Error('周次或节次无法识别');
  const result = new Set<number>();
  for (const part of source.split(',')) {
    const [start, end = start] = part.split('-').map(Number);
    if (start < 1 || end < start || end > maximum) throw new Error('周次或节次超出范围');
    for (let value = start; value <= end; value++) if ((!odd || value % 2 === 1) && (!even || value % 2 === 0)) result.add(value);
  }
  if (!result.size) throw new Error('周次为空');
  return [...result].sort((a, b) => a - b);
}

export function validSemester(semester: Semester): boolean {
  const match = /^(\d{4})-(\d{4})$/.exec(semester.year);
  return !!match && Number(match[2]) === Number(match[1]) + 1 && ['1', '2', '3'].includes(semester.term)
    && validDate(semester.monday) && Number(semester.monday.slice(0, 4)) >= Number(match[1])
    && Number(semester.monday.slice(0, 4)) <= Number(match[2]) && new Date(`${semester.monday}T12:00:00`).getDay() === 1;
}

// Read the entire field before parsing numbers: accepting a numeric substring can
// silently turn an unsupported expression into the wrong set of lesson dates.
function scheduleField(content: string, unit: '周' | '节'): string | undefined {
  const label = unit === '周' ? '周次' : '节次';
  const fields: string[] = [];
  for (const match of content.matchAll(/\[([^\]\n]+)\]([^\S\n]*[周节])?([^\S\n]*[（(]\s*[单双](?:周)?\s*[)）])?/g)) {
    const prefix = new RegExp(`^${label}\\s*[:：]\\s*`);
    const labelled = prefix.test(match[1].trim());
    const inner = match[1].trim().replace(prefix, '');
    const suffix = match[2]?.trim();
    if (/^(?:第\s*)?\d/.test(inner) && (labelled || inner.includes(unit) || suffix === unit)) fields.push(inner + (suffix ?? '') + (match[3] ?? ''));
  }
  if (!fields.length) {
    for (const line of content.split('\n').map(line => line.trim())) {
      const labelled = new RegExp(`^${label}\\s*[:：]\\s*(.+)$`).exec(line);
      if (labelled) fields.push(labelled[1]);
      else if (/^(?:第\s*)?\d/.test(line) && line.includes(unit) && !/[\[\]]/.test(line)) fields.push(line);
    }
  }
  const unique = [...new Set(fields)];
  if (unique.length > 1) throw new Error(`存在多组${label}，需核对对应关系`);
  return unique[0];
}

export function parseHitszCourses(payload: unknown): CourseDraft {
  const object = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const rows = Array.isArray(payload) ? payload : Array.isArray(object.content) ? object.content : Array.isArray(object.data) ? object.data : null;
  if (!rows || rows.length > 1000) throw new Error('课表数据格式无法识别，请重新登录后读取。');
  const courses: Course[] = [], issues: string[] = [];
  const seen = new Map<string, string>();
  let ignored = 0;
  rows.forEach((row, index) => {
    let content = '', title = '';
    try {
      if (!row || typeof row !== 'object' || typeof row.SKSJ !== 'string' || row.SKSJ.length > 10000) throw new Error('缺少课程信息');
      content = text(row.SKSJ).trim();
      title = content.split('\n')[0].trim().split('[')[0].trim();
      const weekday = Number(/xq([1-7])(?:\D|$)/i.exec(String(row.KEY ?? ''))?.[1]);
      const weeksText = scheduleField(content, '周'), periodsText = scheduleField(content, '节');
      if (/考试/.test(content) && !weeksText) throw new Error('考试安排暂不自动导入');
      // Remarks (including MOOC entries) can follow the course name. Do not skip
      // a scheduled course merely because it also has a remark.
      if (/(?:^|\n)\s*备注\s*[:：]/.test(content) && !weeksText && !periodsText) { ignored++; return; }
      const missing = [!title && '课程名称缺失', title.length > 100 && '课程名称过长', !weekday && '星期未识别', !weeksText && '周次未识别', !periodsText && '节次未识别'].filter(Boolean);
      if (missing.length) throw new Error(missing.join('、'));
      const readNumbers = (value: string, maximum: number, label: string) => {
        try { return parseNumbers(value, maximum); }
        catch (error) { throw new Error(`${label}「${value}」：${error instanceof Error ? error.message : '无法识别'}`); }
      };
      const weeks = readNumbers(weeksText!, 30, '周次'), periods = readNumbers(periodsText!, 12, '节次');
      const extras = [...content.matchAll(/\[([^\]]+)\]([^\S\n]*[周节])?/g)].filter(match => !match[2])
        .map(match => match[1].trim()).filter(value => !/[周节]/.test(value));
      const teacher = extras.length > 1 ? extras[0] : '';
      const room = extras.length > 1 ? extras.slice(1).join(' · ') : extras[0] ?? '';
      const key = hash(JSON.stringify([title, teacher, weekday, weeks, periods]));
      if (seen.has(key)) {
        if (seen.get(key) !== room) throw new Error('同一课程存在不同地点，请核对课表');
        ignored++; return;
      }
      seen.set(key, room);
      courses.push({ key, title, weekday, weeks, periods, teacher, room, offset: 0 });
    } catch (error) {
      const name = title ? `「${title.slice(0, 60)}」` : '';
      const detail = content ? `\n课表原文：${content.replace(/\s+/g, ' ').slice(0, 240)}` : '';
      issues.push(`第 ${index + 1} 条${name}：${error instanceof Error ? error.message : '无法解析'}${detail}`);
    }
  });
  return { courses, issues, ignored };
}

export function courseFingerprint(task: Task): string {
  return hash(JSON.stringify([task.title, task.notes, task.date, task.start, task.duration, task.fixed,
    task.category, task.priority, task.important, task.deadline]));
}

export function expandCourses(courses: Course[], semester: Semester, sample = false): Task[] {
  if (!validSemester(semester)) throw new Error('请填写有效学年、学期和第一周周一日期。');
  const tasks: Task[] = [], seen = new Set<string>();
  for (const course of courses) {
    if (![0, 15].includes(course.offset)) throw new Error('课程时间偏移无效');
    const blocks: number[][] = [];
    for (const period of course.periods) {
      const previous = blocks[blocks.length - 1];
      // Lunch, afternoon and evening breaks are separate occurrences.
      if (previous && period === previous[previous.length - 1] + 1 && ![5, 9].includes(period)) previous.push(period);
      else blocks.push([period]);
    }
    for (const week of course.weeks) for (const block of blocks) {
      const date = shiftDate(semester.monday, (week - 1) * 7 + course.weekday - 1);
      const start = UNDERGRADUATE_PERIODS[block[0] - 1]?.[0] + course.offset;
      const end = UNDERGRADUATE_PERIODS[block[block.length - 1] - 1]?.[1] + course.offset;
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > 1440) throw new Error('课程节次无效');
      const key = JSON.stringify([course.title, course.teacher, date, block]);
      if (seen.has(key)) continue;
      seen.add(key);
      const semesterKey = `${semester.year}/${semester.term}${sample ? '/sample' : ''}`;
      const task: Task = { id: `hitsz-${hash(semesterKey + key)}`, title: course.title, notes: [sample ? '示例课表 · 哈工大（深圳）' : '哈尔滨工业大学（深圳）', course.teacher && `教师：${course.teacher}`, course.room && `教室：${course.room}`, `第 ${week} 周 · 第 ${block.join('、')} 节`].filter(Boolean).join('\n'),
        duration: end - start, category: 'work', priority: 'normal', important: false, fixed: true, completed: false,
        date, start, deadline: null, postponed: 0,
        courseImport: { school: 'hitsz', semester: semesterKey, key, fingerprint: '', sample } };
      task.courseImport!.fingerprint = courseFingerprint(task);
      tasks.push(task);
    }
  }
  if (tasks.length > 3000) throw new Error('课表条目过多，请检查周次设置。');
  return tasks;
}

export function previewCourseImport(original: Task[], incoming: Task[], semester: string, mode: 'merge' | 'sync', today: string): CoursePreview {
  const result: CoursePreview = { sourceTasks: original, tasks: original.slice(), changes: [], warnings: [], deferred: 0, finish: 0, extension: 0, valid: true,
    added: 0, updated: 0, removed: 0, unchanged: 0, protected: 0, conflicts: [] };
  const eligible = original.filter(task => task.courseImport?.school === 'hitsz' && task.courseImport.semester === semester);
  const originalById = new Map(original.map(task => [task.id, task]));
  const desired = new Map(incoming.map(task => [task.courseImport!.key, task]));
  const replacements = new Map<string, Task>(), removals = new Set<string>();
  const additions: Task[] = [];
  for (const task of eligible) {
    const next = desired.get(task.courseImport!.key);
    if (next) desired.delete(task.courseImport!.key);
    if (!next && mode !== 'sync') continue;
    if (task.completed || courseFingerprint(task) !== task.courseImport!.fingerprint) { result.protected++; continue; }
    if (!next) { removals.add(task.id); result.removed++; continue; }
    if (courseFingerprint(task) === courseFingerprint(next)) { result.unchanged++; continue; }
    replacements.set(task.id, { ...task, title: next.title, notes: next.notes, date: next.date, start: next.start, duration: next.duration, fixed: true, courseImport: next.courseImport });
    result.updated++;
  }
  for (const next of desired.values()) {
    if (originalById.has(next.id)) { result.valid = false; result.warnings.push('存在重复课程标识，请重新读取课表。'); continue; }
    additions.push(next); result.added++;
  }
  result.tasks = original.filter(task => !removals.has(task.id)).map(task => replacements.get(task.id) ?? task).concat(additions);
  const changedIds = new Set([...replacements.keys(), ...additions.map(task => task.id)]);
  const tasksByDate = new Map<string, Task[]>();
  for (const task of result.tasks) for (const segment of calendarSegments(task)) {
    const day = tasksByDate.get(segment.date) ?? [];
    day.push(task); tasksByDate.set(segment.date, day);
  }
  const conflictSet = new Set<string>();
  for (const task of result.tasks.filter(task => changedIds.has(task.id))) {
    const candidates = calendarSegments(task).flatMap(segment => tasksByDate.get(segment.date) ?? []);
    const collision = candidates.find(other => other.id !== task.id && overlaps(task, other));
    if (collision) {
      const key = task.courseImport!.key;
      if (!conflictSet.has(key)) result.conflicts.push({ key, message: `${task.date} ${clock(task.start!)}「${task.title}」与「${collision.title}」冲突` });
      conflictSet.add(key); result.valid = false;
    }
  }
  for (const task of original.filter(task => removals.has(task.id))) result.changes.push({ taskId: task.id, title: task.title, from: `${task.date} ${clock(task.start!)}`, to: '移除', reason: '同步本学期课表' });
  for (const task of result.tasks.filter(task => changedIds.has(task.id))) {
    const old = originalById.get(task.id);
    result.changes.push({ taskId: task.id, title: task.title, from: old ? `${old.date} ${clock(old.start!)}` : '新增', to: `${task.date} ${clock(task.start!)}`, reason: '导入哈工大（深圳）课表' });
  }
  if (result.protected) result.warnings.push(`${result.protected} 项已完成或手动修改的课程保留原记录。`);
  if (incoming.some(task => task.date! < today)) result.warnings.push('包含过去日期，导入后仍为未完成状态。');
  return result;
}
