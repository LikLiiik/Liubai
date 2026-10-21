import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { courseFingerprint, expandCourses, parseHitszCourses, parseNumbers, prepareCourseImport, previewCourseImport, validSemester } from '../src/courses.ts';
import { buildSchoolReadScript, collectHitsz, sampleSchoolFetcher, SAMPLE_ROWS, schoolUrlAllowed } from '../src/hitsz.ts';
import { createPlan } from '../src/scheduler.ts';
import { applyPlanToData } from '../src/planApply.ts';
import { createEmpty } from '../src/seed.ts';
import { dayBudget } from '../src/budget.ts';
import { overlaps } from '../src/time.ts';
import { layoutDay, moveTaskTo, weekDates } from '../src/week.ts';
import type { Task } from '../src/types.ts';
import { freshGuideProgress, guideStartStep, visitGuideStep } from '../src/guide.ts';

const semester = { year: '2026-2027', term: '1', monday: '2026-08-31' };
const semesterKey = '2026-2027/1';
const getTasks = () => expandCourses(parseHitszCourses(SAMPLE_ROWS).courses, semester);

test('a valid read is ready to import without a separate acknowledgement toggle, including overlaps', () => {
  const draft = parseHitszCourses(SAMPLE_ROWS);
  const existing = { ...getTasks()[0], id: 'personal-meeting', courseImport: undefined };
  const state = prepareCourseImport([existing], draft, semester, [], 'merge', semester.monday);
  assert.equal(state.blockedReason, '');
  assert.ok(state.preview?.valid);
  assert.ok(state.preview.conflicts.length);
  const initial = { ...createEmpty(), tasks: [existing] };
  const result = applyPlanToData(initial, state.preview!, { id: 'ready-import', date: semester.monday, createdAt: '2026-08-31T00:00:00', title: '导入课表' });
  assert.equal(result.error, undefined);
  assert.equal(result.data.tasks.length, 10);
});

test('missing, invalid, out-of-year and non-Monday anchors each explain why import is unavailable', () => {
  const draft = parseHitszCourses(SAMPLE_ROWS);
  for (const [monday, reason] of [['', /选择第一周周一/], ['2026-02-30', /日期无效/], ['2025-09-01', /学年内/], ['2026-09-01', /当前为周二/]] as const) {
    const state = prepareCourseImport([], draft, { ...semester, monday }, [], 'merge', semester.monday);
    assert.match(state.blockedReason, reason);
    assert.equal(state.preview, null);
  }
  assert.equal(prepareCourseImport([], draft, semester, [], 'merge', semester.monday).blockedReason, '');
});

test('pending-only selection needs no calendar anchor while deselecting every course gives a reason', () => {
  const draft = parseHitszCourses([...SAMPLE_ROWS, { KEY: 'bz1', SKSJ: '健康跑 备注:时间待定' }]);
  const excluded = draft.courses.filter(course => !course.pending).map(course => course.key);
  const pending = prepareCourseImport([], draft, { ...semester, monday: '' }, excluded, 'merge', semester.monday);
  assert.equal(pending.blockedReason, '');
  assert.equal(pending.preview?.added, 1);
  assert.equal(pending.preview?.tasks[0].date, null);
  assert.match(prepareCourseImport([], draft, semester, draft.courses.map(course => course.key), 'sync', semester.monday).blockedReason, /至少选择一门/);
});

test('unreadable or unchanged data and expansion failures have visible blockers instead of a silent disabled button', () => {
  const draft = parseHitszCourses(SAMPLE_ROWS);
  assert.match(prepareCourseImport([], null, semester, [], 'merge', semester.monday).blockedReason, /先读取/);
  assert.match(prepareCourseImport([], draft, { ...semester, year: '2026-2026' }, [], 'merge', semester.monday).blockedReason, /有效的学年/);
  assert.match(prepareCourseImport([], { ...draft, issues: ['课程名称缺失'] }, semester, [], 'merge', semester.monday).blockedReason, /未能解析/);
  assert.match(prepareCourseImport([], { ...draft, courses: [] }, semester, [], 'merge', semester.monday).blockedReason, /暂无可导入/);
  const repeated = prepareCourseImport(getTasks(), draft, semester, [], 'merge', semester.monday);
  assert.match(repeated.blockedReason, /没有需要导入的变更/);
  assert.equal(repeated.preview?.unchanged, 9);
  const invalid = { ...draft, courses: [{ ...draft.courses[0], periods: [13] }] };
  assert.match(prepareCourseImport([], invalid, semester, [], 'merge', semester.monday).blockedReason, /节次/);
});

test('a duplicate identifier prevents import with an explanation, and a preview cannot overwrite newer tasks', () => {
  const draft = parseHitszCourses(SAMPLE_ROWS);
  const collision = { ...getTasks()[0], courseImport: undefined };
  const invalid = prepareCourseImport([collision], draft, semester, [], 'merge', semester.monday);
  assert.equal(invalid.preview?.valid, false);
  assert.match(invalid.blockedReason, /重复课程标识/);
  const ready = prepareCourseImport([], draft, semester, [], 'merge', semester.monday);
  const changed = { ...createEmpty(), tasks: [collision] };
  assert.ok(applyPlanToData(changed, ready.preview!, { id: 'stale', date: semester.monday, createdAt: '2026-08-31T00:00:00', title: '导入课表' }).error);
});

test('v19 users receive the import confirmation lesson without losing previous completion', () => {
  const previous = { ...freshGuideProgress(), revision: 19, completedRevision: 19, deferredRevision: 19 };
  assert.equal(guideStartStep(previous), 'preferences');
  assert.equal(visitGuideStep(previous, 'preferences').completedRevision, 19);
});

test('the reported experiment titles retain their prefix and numeric schedule fields parse separately', () => {
  const source = [
    '[实验]统计机器学习 [11-12节][2-2,4-4周] [T2617]',
    '[实验]操作系统1/第1组 [5-8节] [10-10,12-12,14-14,3-3,6-6,8-8周] [T2102]',
    '[实验]计算机网络 配置实验/第3组 [7-8节] [10-10,12-12,8-8周] [T2604-T2606]',
    '[实验]软件构造实践 第一批/第3组 [1-2节] [13-13,14-14周] [T2507]',
  ];
  const result = parseHitszCourses(source.map((SKSJ, index) => ({ KEY: `xq${index + 1}`, SKSJ })));
  assert.deepEqual(result.issues, []);
  assert.equal(result.courses.length, 4);
  assert.ok(result.courses.every(course => course.title.startsWith('[实验]') && !course.pending && course.teacher === ''));
  assert.equal(result.courses[0].room, 'T2617');
  assert.deepEqual(result.courses[0].weeks, [2, 4]);
  assert.deepEqual(result.courses[1].weeks, [3, 6, 8, 10, 12, 14]);
  assert.equal(expandCourses(result.courses, semester).length, 13);
});

test('reported undated remark courses import to inbox with original text and stay idempotent and protected', () => {
  const rows = [{ KEY: 'bz1', SKSJ: '体育E齐冠杰 备注:健康跑' }, { KEY: 'bz2', SKSJ: '软件构造实践 汪花梅 备注:无' }];
  const draft = parseHitszCourses(rows);
  assert.deepEqual(draft.issues, []);
  const incoming = expandCourses(draft.courses, { ...semester, monday: '' });
  assert.ok(incoming.every(task => !task.date && task.start === null && !task.fixed && task.duration === 30));
  assert.equal(incoming[0].title, '体育E齐冠杰');
  assert.ok(incoming[0].notes.includes(rows[0].SKSJ));
  const first = previewCourseImport([], incoming, semesterKey, 'merge', semester.monday);
  assert.equal(first.valid, true);
  assert.ok(first.changes.every(change => change.to === '收集箱'));
  const repeated = previewCourseImport(first.tasks, incoming, semesterKey, 'merge', semester.monday);
  assert.equal(repeated.changes.length, 0);
  assert.equal(repeated.unchanged, 2);
  const changed = [{ ...first.tasks[0], notes: '我的备注' }, first.tasks[1]];
  const synced = previewCourseImport(changed, [], semesterKey, 'sync', semester.monday);
  assert.equal(synced.protected, 1);
  assert.equal(synced.tasks.length, 1);
  assert.equal(synced.tasks[0].notes, '我的备注');
});

test('missing titles still report errors while unknown dates preserve known duration without inventing a date', () => {
  const result = parseHitszCourses([{ KEY: 'xq1', SKSJ: '[实验][1-2节][1-2周]' }, { KEY: 'unknown', SKSJ: '[实验]未定星期 [1-2节][1-2周][T2507]' }]);
  assert.match(result.issues[0], /课程名称缺失/);
  const task = expandCourses(result.courses, semester)[0];
  assert.equal(task.duration, 105);
  assert.equal(task.start, null);
  assert.equal(task.date, null);
  assert.ok(task.notes.includes('星期未识别'));
});

test('week and period expressions support odd/even weeks, ranges and discrete values without unbounded expansion', () => {
  assert.deepEqual(parseNumbers('第1-8周（单）', 30), [1, 3, 5, 7]);
  assert.deepEqual(parseNumbers('2—6周(双)', 30), [2, 4, 6]);
  assert.deepEqual(parseNumbers('1-2、4,6至8', 30), [1, 2, 4, 6, 7, 8]);
  for (const source of ['0-4', '3-2', '1-99999999', '单', '1-4单双', '1,,3']) assert.throws(() => parseNumbers(source, 30));
});

test('school rows parse text or HTML line breaks and report unsupported rows instead of silently losing classes', () => {
  const result = parseHitszCourses({ content: [SAMPLE_ROWS[0], { ...SAMPLE_ROWS[1], SKSJ: SAMPLE_ROWS[1].SKSJ.replaceAll('\n', '<br/>') }, { KEY: 'note', SKSJ: '备注：线上课程' }, { KEY: 'xq1', SKSJ: '不完整课程' }] });
  assert.equal(result.courses.length, 3);
  assert.equal(result.courses[0].room, 'T2-203');
  assert.deepEqual(result.courses[1].weeks, [1, 3]);
  assert.equal(result.ignored, 1);
  assert.equal(result.issues.length, 0);
  assert.ok(result.courses[2].pending);
  assert.throws(() => parseHitszCourses({ login: true }));
  assert.equal(parseHitszCourses([SAMPLE_ROWS[0], { ...SAMPLE_ROWS[0], SKSJ: SAMPLE_ROWS[0].SKSJ.replace('T2-203', 'T2-404') }]).issues.length, 1);
});

test('named remarks and incomplete schedules stay available for inbox import', () => {
  const result = parseHitszCourses([
    { KEY: 'bz', SKSJ: '线上通识课<br/>备注：慕课，自主学习' },
    { ...SAMPLE_ROWS[0], SKSJ: `${SAMPLE_ROWS[0].SKSJ}\n备注：请按时上课` },
    { KEY: 'xq3', SKSJ: '时间待确认\n[1-4周]\n备注：节次待定' },
  ]);
  assert.equal(result.ignored, 0);
  assert.equal(result.courses.length, 3);
  assert.equal(result.issues.length, 0);
  assert.ok(result.courses[0].pending);
  assert.equal(result.courses[1].pending, undefined);
  assert.match(result.courses[2].pending!.reason, /节次未识别/);
});

test('complete bracketed or separate schedule fields accept outside units, spacing and full-width digits', () => {
  const variants = [
    '格式课程\n[1-4]周\n[1-2]节\n[老师][教室]',
    '格式课程\n【１－４周】\n【第１－２节】\n[老师][教室]',
    '格式课程\n周次：1-4\n节次：1-2\n[老师][教室]',
    '格式课程\n[周次：1-4]\n[节次：1-2]\n[老师][教室]',
    '格式课程\n1 - 4 周\n第 1 - 2 节\n[老师][教室]',
    '<div>格式课程</div><div>[1&#x2d;4周]</div><div>[第1-2节]</div><div>[老师][教室]</div>',
  ];
  for (const SKSJ of variants) {
    const result = parseHitszCourses([{ KEY: 'xq2_jc1', SKSJ }]);
    assert.deepEqual(result.issues, [], SKSJ);
    assert.deepEqual(result.courses[0].weeks, [1, 2, 3, 4]);
    assert.deepEqual(result.courses[0].periods, [1, 2]);
    assert.equal(result.courses[0].teacher, '老师');
    assert.equal(result.courses[0].room, '教室');
    assert.equal(expandCourses(result.courses, semester).length, 4);
  }
});

test('incomplete and ambiguous fields identify the course and failing field without inventing times', () => {
  const rows = [
    { KEY: 'bad-key', SKSJ: '星期未知\n[1-4周]\n[1-2节]' },
    { KEY: 'xq1', SKSJ: '周次未知\n[1-2节]' },
    { KEY: 'xq1', SKSJ: '坏周次\n[1-4,待定周]\n[1-2节]' },
    { KEY: 'xq1', SKSJ: '多组时段\n[1-4周][1-2节]\n[5-8周][3-4节]' },
    { KEY: 'xq1', SKSJ: '不合法节次\n[1-4周]\n[1-99节]' },
  ];
  const result = parseHitszCourses(rows);
  assert.equal(result.courses.length, rows.length);
  assert.equal(result.issues.length, 0);
  for (const [index, message] of ['星期未识别', '周次未识别', '周次「1-4,待定周」', '多组周次', '节次「1-99节」'].entries()) {
    assert.ok(result.courses[index].pending!.reason.includes(message));
    assert.equal(result.courses[index].pending!.raw, rows[index].SKSJ);
  }
  assert.ok(expandCourses(result.courses, semester).every(task => task.date === null && task.start === null && !task.fixed));
});

test('odd/even markers outside the week brackets retain their meaning', () => {
  for (const weeks of ['[1-4周]（单）', '[1-4]周(单周)']) {
    const result = parseHitszCourses([{ KEY: 'xq1', SKSJ: `单双周课程\n${weeks}\n[1-2]节\n[老师][教室]` }]);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.courses[0].weeks, [1, 3]);
    assert.deepEqual(expandCourses(result.courses, semester).map(task => task.date), ['2026-08-31', '2026-09-14']);
  }
});

test('the semester anchor must be an actual Monday, including year transitions', () => {
  assert.equal(validSemester(semester), true);
  assert.equal(validSemester({ ...semester, monday: '2026-09-01' }), false);
  assert.equal(validSemester({ ...semester, monday: '2026-02-30' }), false);
  assert.equal(validSemester({ ...semester, year: '2026-2028' }), false);
  assert.equal(validSemester({ ...semester, term: '4' }), false);
  assert.equal(validSemester({ ...semester, monday: '2030-09-02' }), false);
  const draft = parseHitszCourses([{ KEY: 'xq7_jc1', SKSJ: '跨年课程\n[1-2周]\n[第1节]\n[教师][教室]' }]);
  assert.deepEqual(expandCourses(draft.courses, { ...semester, monday: '2026-12-28' }).map(task => task.date), ['2027-01-03', '2027-01-10']);
});

test('real undergraduate periods expand into fixed dated lessons, preserve gaps and allow a 15-minute correction', () => {
  const draft = parseHitszCourses(SAMPLE_ROWS);
  const tasks = expandCourses(draft.courses.map(course => ({ ...course, offset: course.title.includes('体育') ? 15 : 0 })), semester);
  assert.equal(tasks.length, 9);
  assert.deepEqual([tasks[0].date, tasks[0].start, tasks[0].duration], ['2026-08-31', 510, 105]);
  assert.deepEqual(tasks.filter(task => task.title.includes('英语')).map(task => task.date), ['2026-09-02', '2026-09-16']);
  assert.equal(tasks.find(task => task.title.includes('体育'))!.start, 975);
  assert.ok(tasks.every(task => task.fixed && !task.completed));
  const separated = parseHitszCourses([{ KEY: 'xq1_jc1', SKSJ: '分节课程\n[1周]\n[第1,3,5-6节]\n[教师][教室]' }]);
  assert.deepEqual(expandCourses(separated.courses, semester).map(task => [task.start, task.duration]), [[510, 50], [630, 50], [840, 105]]);
});

test('repeated imports are idempotent and do not mutate their input', () => {
  const tasks = getTasks();
  const before = JSON.stringify(tasks);
  const result = previewCourseImport(tasks, getTasks(), semesterKey, 'merge', semester.monday);
  assert.equal(result.valid, true);
  assert.equal(result.changes.length, 0);
  assert.equal(result.unchanged, 9);
  assert.equal(new Set(result.tasks.map(task => task.id)).size, 9);
  assert.equal(JSON.stringify(tasks), before);
  assert.equal(parseHitszCourses([...SAMPLE_ROWS, SAMPLE_ROWS[0]]).ignored, 1);
});

test('classroom changes update matching lessons; completed and manually moved lessons are protected', () => {
  const tasks = getTasks();
  tasks[0] = { ...tasks[0], completed: true };
  tasks[1] = { ...tasks[1], start: 700 };
  const next = getTasks().map(task => ({ ...task, notes: task.notes.replace('T2-203', 'T2-404') }));
  next.forEach(task => { task.courseImport = { ...task.courseImport!, fingerprint: courseFingerprint(task) }; });
  const result = previewCourseImport(tasks, next, semesterKey, 'merge', semester.monday);
  assert.equal(result.protected, 2);
  assert.equal(result.updated, 2);
  assert.equal(result.tasks[0].completed, true);
  assert.equal(result.tasks[1].start, 700);
  assert.ok(result.tasks[2].notes.includes('T2-404'));
  assert.notEqual(courseFingerprint(tasks[2]), courseFingerprint({ ...tasks[2], important: true }));
});

test('merge keeps missing classes; semester sync removes only unchanged imported lessons from that same source', () => {
  const tasks = getTasks();
  const other: Task = { ...tasks[0], id: 'personal', courseImport: undefined, date: '2026-10-01' };
  const otherSemester: Task = { ...tasks[0], id: 'other-semester', courseImport: { ...tasks[0].courseImport!, semester: '2025-2026/2' }, date: '2026-04-01' };
  tasks[0] = { ...tasks[0], completed: true };
  const original = [...tasks, other, otherSemester];
  const desired = tasks.filter(task => !task.title.includes('数学'));
  assert.equal(previewCourseImport(original, desired, semesterKey, 'merge', semester.monday).removed, 0);
  const sync = previewCourseImport(original, desired, semesterKey, 'sync', semester.monday);
  assert.equal(sync.removed, 3); assert.equal(sync.protected, 1);
  assert.ok(sync.tasks.some(task => task.id === 'personal'));
  assert.ok(sync.tasks.some(task => task.id === 'other-semester'));
  assert.ok(sync.tasks.some(task => task.id === tasks[0].id));
});

test('overlaps with existing tasks, incoming courses and overnight events are importable without moving either event', () => {
  const tasks = getTasks();
  const busy: Task = { ...tasks[0], id: 'existing', title: '已有预约', courseImport: undefined };
  const result = previewCourseImport([busy], tasks, semesterKey, 'merge', semester.monday);
  assert.equal(result.valid, true); assert.ok(result.conflicts[0].message.includes('已有预约'));
  assert.deepEqual(result.tasks.find(task => task.id === busy.id), busy);
  assert.deepEqual(result.tasks.filter(task => task.id !== busy.id), tasks);
  const duplicateSlot = { ...tasks[0], id: 'different', title: '另一课程', courseImport: { ...tasks[0].courseImport!, key: 'different' } };
  assert.equal(previewCourseImport([], [...tasks, duplicateSlot], semesterKey, 'merge', semester.monday).valid, true);
  const carry: Task = { ...busy, id: 'carry', date: '2026-08-30', start: 1410, duration: 600 };
  assert.equal(previewCourseImport([carry], tasks, semesterKey, 'merge', semester.monday).valid, true);
});

test('imported lessons are protected by existing scheduling and fixed-task drag confirmation', () => {
  const tasks = getTasks();
  const plan = createPlan(tasks, { dayStart: 540, dayEnd: 1080, buffer: 10 }, { date: semester.monday, now: 840, minutes: 30, reason: 'rebalance', mode: 'boundary' });
  assert.deepEqual(plan.tasks, tasks);
  const moved = moveTaskTo(tasks, tasks[0].id, { date: '2026-09-01', start: 510 }, { dayStart: 510, dayEnd: 1080, buffer: 10 }, semester.monday);
  assert.equal(moved.ok, false);
});

test('confirmed overlapping courses apply together, render in separate lanes, count shared time once and remain fixed during scheduling', () => {
  const first = getTasks()[0];
  const second = { ...first, id: 'parallel-course', title: '并行实验', courseImport: { ...first.courseImport!, key: 'parallel-course' } };
  second.courseImport.fingerprint = courseFingerprint(second);
  const incoming = [first, second];
  const initial = createEmpty({ dayStart: 480, dayEnd: 1080, buffer: 0 });
  const before = JSON.stringify(initial);
  const preview = previewCourseImport(initial.tasks, incoming, semesterKey, 'merge', semester.monday);
  const result = applyPlanToData(initial, preview, { id: 'import', date: semester.monday, createdAt: '2026-08-31T00:00:00', title: '导入课表' });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.data.tasks, incoming);
  assert.deepEqual(result.data.history[0].snapshot, []);
  assert.equal(layoutDay(result.data.tasks).every(item => item.lanes === 2), true);
  assert.equal(dayBudget(result.data.tasks, initial.settings, semester.monday, 480).occupied, first.duration);
  const pending: Task = { ...first, id: 'flexible', title: '新任务', start: null, fixed: false, duration: 60, courseImport: undefined };
  const plan = createPlan([...result.data.tasks, pending], initial.settings, { date: semester.monday, now: 480, minutes: 30, reason: 'rebalance', mode: 'boundary' });
  assert.equal(plan.valid, true);
  const scheduled = plan.tasks.find(task => task.id === 'flexible')!;
  assert.notEqual(scheduled.start, null);
  assert.ok(incoming.every(task => !overlaps(task, scheduled)));
  assert.deepEqual(plan.tasks.filter(task => task.fixed), incoming);
  assert.equal(previewCourseImport(result.data.tasks, incoming, semesterKey, 'merge', semester.monday).changes.length, 0);
  assert.equal(JSON.stringify(initial), before);
});

test('overlapping updates still respect manual edits and sync removals without shifting unrelated events', () => {
  const first = getTasks()[0];
  const busy: Task = { ...first, id: 'appointment', title: '个人预约', courseImport: undefined };
  const updated = { ...first, notes: '新教室 T2601', courseImport: { ...first.courseImport! } };
  updated.courseImport.fingerprint = courseFingerprint(updated);
  const result = previewCourseImport([first, busy], [updated], semesterKey, 'sync', semester.monday);
  assert.equal(result.valid, true); assert.equal(result.updated, 1);
  assert.equal(result.conflicts.length, 1); assert.deepEqual(result.tasks.find(task => task.id === busy.id), busy);
  assert.equal(result.tasks.find(task => task.id === first.id)!.notes, updated.notes);
  const edited = { ...first, start: first.start! + 15 };
  const protectedResult = previewCourseImport([edited, busy], [updated], semesterKey, 'sync', semester.monday);
  assert.equal(protectedResult.protected, 1); assert.deepEqual(protectedResult.tasks, [edited, busy]);
  const removed = previewCourseImport(result.tasks, [], semesterKey, 'sync', semester.monday);
  assert.deepEqual(removed.tasks, [busy]);
});

test('overlap permission does not bypass duplicate identifiers or stale preview protection', () => {
  const course = getTasks()[0];
  const existing: Task = { ...course, title: '同标识的个人任务', courseImport: undefined };
  const invalid = previewCourseImport([existing], [course], semesterKey, 'merge', semester.monday);
  assert.equal(invalid.valid, false); assert.equal(invalid.added, 0);
  assert.ok(invalid.warnings.some(warning => warning.includes('重复课程标识')));
  const initial = createEmpty();
  const preview = previewCourseImport(initial.tasks, [course], semesterKey, 'merge', semester.monday);
  const changed = { ...initial, tasks: [existing] };
  const result = applyPlanToData(changed, preview, { id: 'stale', date: semester.monday, createdAt: '2026-08-31T00:00:00', title: '导入课表' });
  assert.ok(result.error); assert.equal(result.data, changed);
});

test('overnight overlap reports every counterpart once and ignores point reminders', () => {
  const base = getTasks()[0];
  const course: Task = { ...base, start: 1410, duration: 120 };
  const carry: Task = { ...course, id: 'overnight', title: '跨夜会议', courseImport: undefined };
  const second: Task = { ...carry, id: 'other', title: '另一预约', start: 1420 };
  const point: Task = { ...carry, id: 'quick', title: '小事', kind: 'quick', duration: 0 };
  const preview = previewCourseImport([carry, second, point], [course], semesterKey, 'merge', semester.monday);
  assert.equal(preview.valid, true); assert.equal(preview.conflicts.length, 1);
  const message = preview.conflicts[0].message;
  assert.equal(message.split('跨夜会议').length - 1, 1);
  assert.ok(message.includes('另一预约')); assert.ok(!message.includes('小事'));
});

test('v16 completion is preserved while revised lessons remain accessible', () => {
  const previous = { ...freshGuideProgress(), revision: 16, completedRevision: 16, deferredRevision: 16 };
  assert.equal(guideStartStep(previous), 'completion');
  assert.equal(visitGuideStep(previous, 'preferences').completedRevision, 16);
});

test('sample and real course identifiers cannot replace one another', () => {
  const sample = expandCourses(parseHitszCourses(SAMPLE_ROWS).courses, semester, true);
  const real = getTasks();
  assert.ok(sample.every(task => task.courseImport?.sample));
  assert.ok(sample.every(task => !real.some(other => other.id === task.id)));
  const result = previewCourseImport(sample, [], semesterKey, 'sync', semester.monday);
  assert.equal(result.removed, 0);
});

test('read-only transport selects the requested semester and strips non-course data', async () => {
  const calls: { path: string; fields: Record<string, string> }[] = [];
  const read = await collectHitsz(async (path, fields) => {
    calls.push({ path, fields });
    const value = await sampleSchoolFetcher(semester.monday)(path, fields);
    return Array.isArray(value) ? value.map(row => ({ ...row, studentName: 'must not leave the page' })) : value;
  }, { year: semester.year, term: semester.term });
  assert.equal(read.monday, semester.monday);
  assert.deepEqual(calls.map(call => call.path), ['/component/queryRlZcSj', '/xszykb/queryxszykbzong']);
  assert.deepEqual(calls[0].fields, { xn: semester.year, xq: semester.term, djz: '1' });
  assert.ok(!JSON.stringify(read).includes('studentName'));
  assert.equal((await collectHitsz(async path => {
    if (path.includes('queryRl')) throw new Error('calendar unavailable');
    return SAMPLE_ROWS;
  }, { year: semester.year, term: semester.term })).monday, '');
  await assert.rejects(collectHitsz(async () => '<html>login</html>', { year: semester.year, term: semester.term }));
});

async function runBridge(handler: (path: string, options: Record<string, unknown>) => Promise<unknown>, hostname = 'jw.hitsz.edu.cn', request = { year: semester.year, term: semester.term }) {
  const calls: string[] = [];
  const message = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const context = { location: { hostname }, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
      window: { ReactNativeWebView: { postMessage: (value: string) => resolve(JSON.parse(value)) } },
      fetch: async (path: string, options: Record<string, unknown>) => {
        calls.push(path);
        return handler(path, options);
      } };
    try { vm.runInNewContext(buildSchoolReadScript(request, 'test-id'), context); }
    catch (error) { reject(error); }
  });
  return { message, calls };
}

test('the actual injected WebView script returns filtered course rows using same-origin POST without exposing session data', async () => {
  const result = await runBridge(async (path, options) => {
    assert.equal(options.credentials, 'same-origin'); assert.equal(options.method, 'POST');
    const body = new URLSearchParams(options.body as string);
    assert.equal(body.get('xn'), semester.year); assert.equal(body.get('xq'), semester.term);
    return { ok: true, url: `http://jw.hitsz.edu.cn${path}`, text: async () => JSON.stringify(path.includes('queryRl') ? { content: [{ rq: semester.monday }] } : SAMPLE_ROWS.map(row => ({ ...row, account: 'private' }))) };
  });
  assert.equal(result.message.ok, true); assert.equal(result.message.requestId, 'test-id');
  assert.equal(result.calls.length, 2);
  assert.ok(!JSON.stringify(result.message).includes('private'));
  const read = result.message.data as { rows: unknown };
  assert.equal(expandCourses(parseHitszCourses(read.rows).courses, semester).length, 9);
});

test('the injected reader fails on login pages, expired redirects and unapproved hosts', async () => {
  const html = await runBridge(async path => ({ ok: true, url: `http://jw.hitsz.edu.cn${path}`, text: async () => '<html>login</html>' }));
  assert.equal(html.message.ok, false);
  const redirect = await runBridge(async () => ({ ok: true, url: 'https://sso.hitsz.edu.cn/login', text: async () => JSON.stringify(SAMPLE_ROWS) }));
  assert.equal(redirect.message.ok, false);
  const wrongHost = await runBridge(async () => { throw new Error('must not fetch'); }, 'sso.hitsz.edu.cn');
  assert.equal(wrongHost.calls.length, 0); assert.equal(wrongHost.message.ok, false);
  assert.equal(schoolUrlAllowed('https://sso.hitsz.edu.cn:7002/cas/login'), true);
  for (const url of ['https://hitsz.edu.cn.evil.test', 'javascript:alert(1)', 'file:///data/private', 'https://evil.test', 'http://sso.hitsz.edu.cn']) assert.equal(schoolUrlAllowed(url), false);
});


test('selected historical and future years and all three terms reach both transport paths and imported course sources', async () => {
  for (const request of [{ year: '2024-2025', term: '1' }, { year: '2025-2026', term: '2' }, { year: '2027-2028', term: '3' }]) {
    const monday = weekDates(`${request.year.slice(0, 4)}-09-07`)[0];
    const fetcher = async (path: string, fields: Record<string, string>) => {
      assert.equal(fields.xn, request.year); assert.equal(fields.xq, request.term);
      return path.includes('queryRl') ? { content: [{ rq: monday }] } : SAMPLE_ROWS;
    };
    const read = await collectHitsz(fetcher, request);
    assert.equal(read.year, request.year); assert.equal(read.term, request.term);
    const bridge = await runBridge(async (path, options) => {
      const fields = Object.fromEntries(new URLSearchParams(options.body as string));
      const payload = await fetcher(path, fields);
      return { ok: true, url: `http://jw.hitsz.edu.cn${path}`, text: async () => JSON.stringify(payload) };
    }, 'jw.hitsz.edu.cn', request);
    assert.equal(bridge.message.ok, true);
    const result = bridge.message.data as { year: string; term: string; monday: string; rows: unknown };
    assert.equal(result.year, request.year); assert.equal(result.term, request.term);
    const tasks = expandCourses(parseHitszCourses(result.rows).courses, result);
    assert.ok(tasks.every(task => task.courseImport?.semester === `${request.year}/${request.term}`));
  }
});

test('v17 completion is preserved while revised completion and semester lessons remain accessible', () => {
  const previous = { ...freshGuideProgress(), revision: 17, completedRevision: 17, deferredRevision: 17 };
  assert.equal(guideStartStep(previous), 'completion');
  assert.equal(visitGuideStep(previous, 'preferences').completedRevision, 17);
});
