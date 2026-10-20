import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { courseFingerprint, expandCourses, parseHitszCourses, parseNumbers, previewCourseImport, validSemester } from '../src/courses.ts';
import { buildSchoolReadScript, collectHitsz, sampleSchoolFetcher, SAMPLE_ROWS, schoolUrlAllowed } from '../src/hitsz.ts';
import { createPlan } from '../src/scheduler.ts';
import { moveTaskTo } from '../src/week.ts';
import type { Task } from '../src/types.ts';

const semester = { year: '2026-2027', term: '1', monday: '2026-08-31' };
const semesterKey = '2026-2027/1';
const getTasks = () => expandCourses(parseHitszCourses(SAMPLE_ROWS).courses, semester);

test('week and period expressions support odd/even weeks, ranges and discrete values without unbounded expansion', () => {
  assert.deepEqual(parseNumbers('第1-8周（单）', 30), [1, 3, 5, 7]);
  assert.deepEqual(parseNumbers('2—6周(双)', 30), [2, 4, 6]);
  assert.deepEqual(parseNumbers('1-2、4,6至8', 30), [1, 2, 4, 6, 7, 8]);
  for (const source of ['0-4', '3-2', '1-99999999', '单', '1-4单双', '1,,3']) assert.throws(() => parseNumbers(source, 30));
});

test('school rows parse text or HTML line breaks and report unsupported rows instead of silently losing classes', () => {
  const result = parseHitszCourses({ content: [SAMPLE_ROWS[0], { ...SAMPLE_ROWS[1], SKSJ: SAMPLE_ROWS[1].SKSJ.replaceAll('\n', '<br/>') }, { KEY: 'note', SKSJ: '备注：线上课程' }, { KEY: 'xq1', SKSJ: '不完整课程' }] });
  assert.equal(result.courses.length, 2);
  assert.equal(result.courses[0].room, 'T2-203');
  assert.deepEqual(result.courses[1].weeks, [1, 3]);
  assert.equal(result.ignored, 1);
  assert.equal(result.issues.length, 1);
  assert.throws(() => parseHitszCourses({ login: true }));
  assert.equal(parseHitszCourses([SAMPLE_ROWS[0], { ...SAMPLE_ROWS[0], SKSJ: SAMPLE_ROWS[0].SKSJ.replace('T2-203', 'T2-404') }]).issues.length, 1);
});

test('remarks after a course title are ignored only when no scheduled week or period is present', () => {
  const result = parseHitszCourses([
    { KEY: 'bz', SKSJ: '线上通识课<br/>备注：慕课，自主学习' },
    { ...SAMPLE_ROWS[0], SKSJ: `${SAMPLE_ROWS[0].SKSJ}\n备注：请按时上课` },
    { KEY: 'xq3', SKSJ: '时间待确认\n[1-4周]\n备注：节次待定' },
  ]);
  assert.equal(result.ignored, 1);
  assert.equal(result.courses.length, 1);
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0], /时间待确认.*节次未识别/);
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
  assert.equal(result.courses.length, 0);
  assert.equal(result.issues.length, rows.length);
  for (const [index, message] of ['星期未识别', '周次未识别', '周次「1-4,待定周」', '多组周次', '节次「1-99节」'].entries()) {
    assert.ok(result.issues[index].includes(message), result.issues[index]);
    assert.ok(result.issues[index].includes(rows[index].SKSJ.split('\n')[0]));
    assert.match(result.issues[index], /课表原文：/);
  }
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

test('conflicts block imports with existing tasks and with another incoming course', () => {
  const tasks = getTasks();
  const busy: Task = { ...tasks[0], id: 'existing', title: '已有预约', courseImport: undefined };
  const result = previewCourseImport([busy], tasks, semesterKey, 'merge', semester.monday);
  assert.equal(result.valid, false); assert.ok(result.conflicts[0].message.includes('已有预约'));
  const duplicateSlot = { ...tasks[0], id: 'different', title: '另一课程', courseImport: { ...tasks[0].courseImport!, key: 'different' } };
  assert.equal(previewCourseImport([], [...tasks, duplicateSlot], semesterKey, 'merge', semester.monday).valid, false);
  const carry: Task = { ...busy, id: 'carry', date: '2026-08-30', start: 1410, duration: 600 };
  assert.equal(previewCourseImport([carry], tasks, semesterKey, 'merge', semester.monday).valid, false);
});

test('imported lessons are protected by existing scheduling and fixed-task drag confirmation', () => {
  const tasks = getTasks();
  const plan = createPlan(tasks, { dayStart: 540, dayEnd: 1080, buffer: 10 }, { date: semester.monday, now: 840, minutes: 30, reason: 'rebalance', mode: 'boundary' });
  assert.deepEqual(plan.tasks, tasks);
  const moved = moveTaskTo(tasks, tasks[0].id, { date: '2026-09-01', start: 510 }, { dayStart: 510, dayEnd: 1080, buffer: 10 }, semester.monday);
  assert.equal(moved.ok, false);
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

async function runBridge(handler: (path: string, options: Record<string, unknown>) => Promise<unknown>, hostname = 'jw.hitsz.edu.cn') {
  const calls: string[] = [];
  const message = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const context = { location: { hostname }, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
      window: { ReactNativeWebView: { postMessage: (value: string) => resolve(JSON.parse(value)) } },
      fetch: async (path: string, options: Record<string, unknown>) => {
        calls.push(path);
        return handler(path, options);
      } };
    try { vm.runInNewContext(buildSchoolReadScript({ year: semester.year, term: semester.term }, 'test-id'), context); }
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
