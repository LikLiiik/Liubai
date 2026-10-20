import type { AppData, Category, CategoryDefinition, Settings } from './types.ts';

export const DEFAULT_CATEGORIES: readonly CategoryDefinition[] = [{ id: 'work', name: '工作' }, { id: 'life', name: '生活' }];
export const CATEGORY_NAME_LIMIT = 20;
export type CategoryAddResult = { category: CategoryDefinition; error?: never } | { category?: never; error: string };

function normalizedName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ');
}
function nameKey(name: string): string { return normalizedName(name).toLowerCase(); }
function validName(name: unknown): name is string {
  return typeof name === 'string' && name.length > 0 && name.length <= CATEGORY_NAME_LIMIT
    && name === normalizedName(name) && !/\p{Cc}/u.test(name);
}
function customId(id: unknown): id is `custom-${string}` {
  return typeof id === 'string' && /^custom-[a-zA-Z0-9-]{1,80}$/.test(id);
}

// Additional categories are optional so old installations remain readable.
export function validCategories(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>(['work', 'life']);
  const names = new Set(DEFAULT_CATEGORIES.map(item => nameKey(item.name)));
  return value.every(item => {
    if (!item || !validName(item.name) || !(customId(item.id) || item.id === 'health' && item.name === '健康')
      || ids.has(item.id) || names.has(nameKey(item.name)) || item.name === '健康' && item.id !== 'health') return false;
    ids.add(item.id); names.add(nameKey(item.name)); return true;
  });
}

export function knownCategory(value: unknown, settings: Settings): value is Category {
  return value === 'work' || value === 'life' || value === 'health'
    || customId(value) && !!settings.categories?.some(item => item.id === value);
}

export function categoriesFor(data: Pick<AppData, 'settings' | 'tasks' | 'history'>): CategoryDefinition[] {
  const categories = [...DEFAULT_CATEGORIES, ...(data.settings.categories ?? [])];
  // Keep legacy health tasks and undo snapshots selectable, without making health a new default.
  const legacyHealth = data.tasks.some(task => task.category === 'health')
    || data.history.some(entry => entry.snapshot?.some(task => task.category === 'health')
      || entry.appliedTasks?.some(task => task.category === 'health'));
  if (legacyHealth && !categories.some(item => item.id === 'health')) categories.push({ id: 'health', name: '健康' });
  return categories;
}

export function addCategoryToData(data: AppData, rawName: string, id: string): { data: AppData; result: CategoryAddResult } {
  const name = normalizedName(rawName);
  const error = (message: string) => ({ data, result: { error: message } });
  if (/\p{Cc}/u.test(rawName) || !validName(name)) return error(`分类名称应为 1–${CATEGORY_NAME_LIMIT} 字。`);
  const categories = categoriesFor(data);
  if (categories.some(item => nameKey(item.name) === nameKey(name))) return error('这个分类已存在。');
  const category: CategoryDefinition = { id: name === '健康' ? 'health' : `custom-${id}`, name };
  if (!customId(category.id) && category.id !== 'health' || categories.some(item => item.id === category.id)) return error('未能添加分类，请重试。');
  return { data: { ...data, settings: { ...data.settings, categories: [...(data.settings.categories ?? []), category] } }, result: { category } };
}
