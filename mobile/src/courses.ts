import type { PlanResult, Task } from './types.ts';
import { calendarSegments, overlaps, shiftDate } from './time.ts';
import { clock, taskPosition } from './utils.ts';
import { validDate } from './week.ts';

export type Course = { key: string; title: string; weekday: number; weeks: number[]; periods: number[]; teacher: string; room: string; offset: number;
  pending?: { reason: string; raw: string } };
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

export function validSemesterTerm(semester: Pick<Semester, 'year' | 'term'>): boolean {
  const match = /^(\d{4})-(\d{4})$/.exec(semester.year);
  return !!match && Number(match[2]) === Number(match[1]) + 1 && ['1', '2', '3'].includes(semester.term);
}
export function validSemester(semester: Semester): boolean {
  return validSemesterTerm(semester) && validDate(semester.monday) && Number(semester.monday.slice(0, 4)) >= Number(semester.year.slice(0, 4))
    && Number(semester.monday.slice(0, 4)) <= Number(semester.year.slice(5)) && new Date(`${semester.monday}T12:00:00`).getDay() === 1;
}

// One source for preview readiness and its visible explanation. Reviewing the
// semester is part of final confirmation, never a separate hidden toggle.
export function prepareCourseImport(original: Task[], draft: CourseDraft | null, semester: Semester, excluded: string[], mode: 'merge' | 'sync', today: string) {
  const selected = draft?.courses.filter(course => !excluded.includes(course.key)) ?? [];
  const blocked = (reason: string, preview: CoursePreview | null = null) => ({ selected, preview, blockedReason: reason });
  if (!draft) return blocked('请先读取课表。');
  if (!validSemesterTerm(semester)) return blocked('请选择有效的学年和学期。');
  if (draft.issues.length) return blocked(`有 ${draft.issues.length} 条数据未能解析，请查看解析结果并重新读取。`);
  if (!draft.courses.length) return blocked('该学期暂无可导入课程。');
  if (!selected.length) return blocked('请至少选择一门课程。');
  if (selected.some(course => !course.pending)) {
    if (!semester.monday) return blocked('请先选择第一周周一。');
    if (!validDate(semester.monday)) return blocked('第一周日期无效，请重新选择。');
    const year = Number(semester.monday.slice(0, 4));
    if (year < Number(semester.year.slice(0, 4)) || year > Number(semester.year.slice(5))) return blocked(`第一周周一须在 ${semester.year} 学年内。`);
    const weekday = new Date(`${semester.monday}T12:00:00`).getDay();
    if (weekday !== 1) return blocked(`第一周日期须为周一，当前为周${'日一二三四五六'[weekday]}。`);
  }
  try {
    const preview = previewCourseImport(original, expandCourses(selected, semester), `${semester.year}/${semester.term}`, mode, today);
    if (!preview.valid) return blocked(preview.warnings.join('；') || '课表预览无效，请重新读取。', preview);
    if (!preview.changes.length) return blocked('没有需要导入的变更，所选课程已存在或受手动修改保护。', preview);
    return { selected, preview, blockedReason: '' };
  } catch (error) {
    return blocked(error instanceof Error ? error.message : '无法生成课表预览，请重新读取。');
  }
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
      if (/^备注\s*[:：]/.test(content)) { ignored++; return; }
      // [实验] is part of the title, unlike the following numeric schedule fields.
      title = /^((?:\[(?:实验|实验课|上机|实践|理论|实习)\]\s*)*[^\[\n]*)/.exec(content)?.[1].trim().split(/备注\s*[:：]/)[0].trim() ?? '';
      if (!title.replace(/\[(?:实验|实验课|上机|实践|理论|实习)\]/g, '').trim() || title.length > 100) throw new Error(title.length > 100 ? '课程名称过长' : '课程名称缺失');
      const weekday = Number(/xq([1-7])(?:\D|$)/i.exec(String(row.KEY ?? ''))?.[1]);
      const missing: string[] = weekday ? [] : ['星期未识别'];
      const readNumbers = (unit: '周' | '节', maximum: number) => {
        let value: string | undefined;
        try {
          value = scheduleField(content, unit);
          if (!value) { missing.push(`${unit === '周' ? '周次' : '节次'}未识别`); return []; }
          return parseNumbers(value, maximum);
        } catch (error) {
          missing.push(`${unit === '周' ? '周次' : '节次'}${value ? `「${value}」` : ''}：${error instanceof Error ? error.message : '无法识别'}`);
          return [];
        }
      };
      const weeks = readNumbers('周', 30), periods = readNumbers('节', 12);
      const extras = [...content.matchAll(/\[([^\]]+)\]([^\S\n]*[周节])?/g)].filter(match => !match[2])
        .map(match => match[1].trim()).filter(value => !/[周节]/.test(value) && !/^(实验|实验课|上机|实践|理论|实习)$/.test(value));
      const teacher = extras.length > 1 ? extras[0] : '';
      const room = extras.length > 1 ? extras.slice(1).join(' · ') : extras[0] ?? '';
      const pending = missing.length ? { reason: missing.join('、'), raw: content } : undefined;
      const key = hash(JSON.stringify([title, teacher, weekday || 0, weeks, periods, ...(pending ? [content.replace(/\s+/g, ' ')] : [])]));
      if (seen.has(key)) {
        if (seen.get(key) !== room) throw new Error('同一课程存在不同地点，请核对课表');
        ignored++; return;
      }
      seen.set(key, room);
      courses.push({ key, title, weekday: weekday || 0, weeks, periods, teacher, room, offset: 0, ...(pending ? { pending } : {}) });
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
  if (!validSemesterTerm(semester) || courses.some(course => !course.pending) && !validSemester(semester)) throw new Error('请填写有效学年、学期和第一周周一日期。');
  const tasks: Task[] = [], seen = new Set<string>();
  for (const course of courses) {
    if (![0, 15].includes(course.offset)) throw new Error('课程时间偏移无效');
    const blocks: number[][] = [];
    for (const period of course.periods) {
      const previous = blocks[blocks.length - 1];
      if (previous && period === previous[previous.length - 1] + 1 && ![5, 9].includes(period)) previous.push(period);
      else blocks.push([period]);
    }
    const semesterKey = `${semester.year}/${semester.term}${sample ? '/sample' : ''}`;
    if (course.pending) {
      const key = `pending:${course.key}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const task: Task = { id: `hitsz-${hash(semesterKey + key)}`, title: course.title,
        notes: [sample ? '示例课表 · 哈工大（深圳）' : '哈尔滨工业大学（深圳）', `排课待确认：${course.pending.reason}`,
          course.periods.length ? '预计时长按已识别节次计算。' : '节次待确认，预计时长暂按 30 分钟，可修改。', `课表原文：\n${course.pending.raw}`].join('\n'),
        duration: blocks.reduce((sum, block) => sum + UNDERGRADUATE_PERIODS[block[block.length - 1] - 1][1] - UNDERGRADUATE_PERIODS[block[0] - 1][0], 0) || 30,
        category: 'work', priority: 'normal', important: false, fixed: false, completed: false,
        date: null, start: null, deadline: null, postponed: 0,
        courseImport: { school: 'hitsz', semester: semesterKey, key, fingerprint: '', sample } };
      task.courseImport!.fingerprint = courseFingerprint(task);
      tasks.push(task); continue;
    }
    for (const week of course.weeks) for (const block of blocks) {
      const date = shiftDate(semester.monday, (week - 1) * 7 + course.weekday - 1);
      const start = UNDERGRADUATE_PERIODS[block[0] - 1]?.[0] + course.offset;
      const end = UNDERGRADUATE_PERIODS[block[block.length - 1] - 1]?.[1] + course.offset;
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > 1440) throw new Error('课程节次无效');
      const key = JSON.stringify([course.title, course.teacher, date, block]);
      if (seen.has(key)) continue;
      seen.add(key);
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
    replacements.set(task.id, { ...task, title: next.title, notes: next.notes, date: next.date, start: next.start, duration: next.duration, fixed: next.fixed, courseImport: next.courseImport });
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
    const collisions = [...new Map(candidates.filter(other => other.id !== task.id && overlaps(task, other)).map(other => [other.id, other])).values()];
    if (collisions.length) {
      const key = task.courseImport!.key;
      const titles = collisions.slice(0, 3).map(other => `「${other.title}」`).join('、');
      if (!conflictSet.has(key)) result.conflicts.push({ key, message: `${task.date} ${clock(task.start!)}「${task.title}」与${titles}${collisions.length > 3 ? `等 ${collisions.length} 项` : ''}时间重叠` });
      // Import is an explicit manual placement. Keep the warning without moving,
      // dropping or granting the automatic scheduler permission to overlap tasks.
      conflictSet.add(key);
    }
  }
  for (const task of original.filter(task => removals.has(task.id))) result.changes.push({ taskId: task.id, title: task.title, from: taskPosition(task, today), to: '移除', reason: '同步本学期课表' });
  for (const task of result.tasks.filter(task => changedIds.has(task.id))) {
    const old = originalById.get(task.id);
    result.changes.push({ taskId: task.id, title: task.title, from: old ? taskPosition(old, today) : '新增', to: taskPosition(task, today), reason: '导入哈工大（深圳）课表' });
  }
  if (result.protected) result.warnings.push(`${result.protected} 项已完成或手动修改的课程保留原记录。`);
  const pendingCount = incoming.filter(task => task.date === null).length;
  if (pendingCount) result.warnings.push(`${pendingCount} 门课程排课时间未识别，将放入收集箱，保留原文供核对。`);
  if (incoming.some(task => task.date && task.date < today)) result.warnings.push('包含过去日期，导入后仍为未完成状态。');
  return result;
}
