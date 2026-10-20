import assert from 'node:assert/strict';
import test from 'node:test';
import { addCategoryToData, categoriesFor, knownCategory, validCategories } from '../src/categories.ts';
import { createDemo, createEmpty, personalData } from '../src/seed.ts';
import { validSettings } from '../src/time.ts';
import { saveTaskDraft, type TaskDraft } from '../src/taskDraft.ts';

test('new users have only work and life categories, and an untouched old demo does not add health', () => {
  assert.deepEqual(categoriesFor(createEmpty()), [{ id: 'work', name: '工作' }, { id: 'life', name: '生活' }]);
  assert.deepEqual(categoriesFor(personalData(createDemo())), categoriesFor(createEmpty()));
});

test('custom categories survive serialization and reset independently of tasks', () => {
  const original = createEmpty();
  const next = addCategoryToData(original, ' 学习 ', 'study');
  assert.equal(next.result.category?.name, '学习');
  const restored = JSON.parse(JSON.stringify(next.data));
  assert.equal(validSettings(restored.settings), true);
  assert.equal(knownCategory('custom-study', restored.settings), true);
  assert.deepEqual(categoriesFor(restored).map(item => item.name), ['工作', '生活', '学习']);
  assert.deepEqual(categoriesFor(createEmpty(restored.settings)), categoriesFor(restored));
  assert.deepEqual(categoriesFor(original).map(item => item.name), ['工作', '生活']);
  assert.strictEqual(next.data.tasks, original.tasks);
  assert.strictEqual(next.data.history, original.history);
});

test('adding validates names, normalizes duplicates and never overwrites existing categories', () => {
  const first = addCategoryToData(createEmpty(), 'Ｐｒｏｊｅｃｔ', 'one').data;
  for (const name of ['', '   ', 'x'.repeat(21), '学习\n工作', ' 工作 ', '生活', 'project']) {
    const next = addCategoryToData(first, name, 'two');
    assert.ok(next.result.error, name);
    assert.strictEqual(next.data, first);
  }
  const second = addCategoryToData(first, '学习', 'two');
  assert.ok(second.result.category);
  assert.equal(categoriesFor(second.data).length, 4);
  assert.ok(addCategoryToData(second.data, '运动', 'two').result.error, 'ID collisions must not overwrite a category');
});

test('legacy health remains selectable for existing tasks and undo history without changing their data', () => {
  const demo = createDemo();
  const health = demo.tasks.find(task => task.category === 'health')!;
  const data = createEmpty();
  data.tasks = [health];
  const before = JSON.stringify(data);
  assert.equal(categoriesFor(data).at(-1)?.name, '健康');
  assert.equal(JSON.stringify(data), before);
  data.tasks = [];
  data.history = [{ id: 'undo', title: '调整', date: '2026-10-21', createdAt: '', changes: [], snapshot: [health], appliedTasks: [] }];
  assert.equal(categoriesFor(data).at(-1)?.id, 'health');
  assert.ok(addCategoryToData(data, '健康', 'duplicate').result.error);
  assert.deepEqual(categoriesFor(addCategoryToData(data, '学习', 'study').data).map(item => item.name), ['工作', '生活', '学习', '健康']);
});

test('users can explicitly add health without creating duplicate legacy categories', () => {
  const next = addCategoryToData(createEmpty(), '健康', 'health');
  assert.equal(next.result.category?.id, 'health');
  assert.equal(validSettings(next.data.settings), true);
  assert.equal(categoriesFor(next.data).filter(item => item.name === '健康').length, 1);
  assert.ok(addCategoryToData(next.data, '健康', 'again').result.error);
});

test('malformed stored definitions and task references are rejected while old settings remain valid', () => {
  assert.equal(validCategories(undefined), true);
  for (const categories of [null, {}, [{ id: 'custom-test', name: '' }], [{ id: 'work', name: '其他' }],
    [{ id: 'custom-test', name: '工作' }], [{ id: 'custom-test', name: '健康' }], [{ id: 'custom-<script>', name: '学习' }],
    [{ id: 'custom-one', name: '学习' }, { id: 'custom-two', name: '学习' }]]) assert.equal(validCategories(categories), false);
  assert.equal(knownCategory('custom-missing', createEmpty().settings), false);
  assert.equal(knownCategory('health', createEmpty().settings), true, 'legacy task references remain readable');
});

test('task creation and editing preserve custom categories and block missing category IDs', () => {
  const data = addCategoryToData(createEmpty(), '学习', 'study').data;
  const context = { today: '2026-10-21', now: 840, calendarToday: '2026-10-21', calendarNow: 840 };
  const draft: TaskDraft = { id: 'reading', title: '阅读', notes: '', duration: '30', category: 'custom-study', priority: 'normal',
    important: false, fixed: false, date: null, time: '1400', deadline: '' };
  const saved = saveTaskDraft([], data.settings, draft, context);
  assert.equal(saved.kind, 'saved');
  if (saved.kind !== 'saved') throw new Error('Task not saved');
  const original = saved.tasks[0];
  assert.equal(original.category, 'custom-study');
  const edited = saveTaskDraft(saved.tasks, data.settings, { ...draft, title: '阅读并做笔记' }, context, original);
  assert.equal(edited.kind, 'saved');
  if (edited.kind === 'saved') assert.equal(edited.tasks[0].category, 'custom-study');
  assert.equal(saveTaskDraft([], data.settings, { ...draft, category: 'custom-missing' }, context).kind, 'error');
});
