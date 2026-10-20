// Keep tutorial content, revision and stable step IDs together when adding product features.
export const GUIDE_REVISION = 9;
export const GUIDE_STEPS = [
  { id: 'welcome', introduced: 2, icon: 'feather', title: '给计划留一点余地', summary: '用几步认识留白，按自己的节奏开始。',
    tips: ['教程中的示例可以放心尝试，不会写入你的日程。', '了解核心操作后，直接开始记录自己的安排。', '教程可随时退出，在「我的 → 新手指引」继续或重看。'] },
  { id: 'tasks', introduced: 6, icon: 'plus-circle', title: '先把想做的事记下来', summary: '在「今天」或「周览」点 ＋，添加一件事。',
    tips: ['填写名称和预计时长，需要时补充优先级、重点和截止日期。默认分类为工作、生活，可在分类旁点「添加分类」，以后继续使用。', '时间点按「时、分」选择，事件时长按「小时、分钟」填写数量；两栏都支持滑动选择，只接受范围内的数字，无需输入冒号。会议、预约可设为固定时间。', '今天、明天按实际日历选择；凌晨仍在昨晚偏好时段内时，可选「继续昨晚」。还没确定时间的事可先放进收集箱；普通任务自动寻找空位，放不下时保留待安排。'] },
  { id: 'quick', introduced: 7, icon: 'bell', title: '顺手小事，到点记得做', summary: '在「今天」点顺手小事，或添加时切换事项类型。',
    tips: ['填写名称、日期和提醒时刻，无需填写时长；小时、分钟均可填写或滑动选择。', '小事显示在今天和周览中，不占用时间，也不会被自动排程或救场挪动；同一时刻可以提醒多件小事。', '在小事表单或「我的」中开启日程提醒，允许手机通知后才会到点提醒。完成、删除或修改时刻后，旧提醒随之取消或更新。'] },
  { id: 'completion', introduced: 9, icon: 'check-square', title: '做完一件事，接下来由你决定', summary: '在今天勾选事项，或在周览详情中勾选「此事件已完成」。',
    tips: ['勾选后立即记录完成；有适合提前的后续任务时，展示调整预览。', '选「保持原安排」就保留空闲；选「确认提前」才按原顺序提前灵活任务，遵循偏好、缓冲和截止时间。会议、课程和顺手小事保持原时刻。', '今天或周览取消勾选，或在回顾的完成记录中点「撤销完成」。如果此前提前过后续任务，可选只撤销完成，或一并取消该次提前；后来改动、完成或出现冲突的事项会保留并提示。保留提前若产生重叠，需再次确认。'] },
  { id: 'week', introduced: 7, icon: 'calendar', title: '把一周摆在眼前', summary: '周览按课程表展示一周，滑动查看 00:00–24:00。',
    tips: ['手机长按卡片拖动，可调整时间或移到另一天；点击卡片也能精确填写时间。铃铛小卡片表示顺手小事，拖动只改变提醒时刻。', '固定事项先确认解锁，只允许移动一次。', '手动重叠或放到非偏好时段时先确认；自动排程仍避开占用时间。'] },
  { id: 'rescue', introduced: 4, icon: 'wind', title: '计划变了，也能接着来', summary: '在「今天」使用一键救场，安排好接下来。',
    tips: ['临时有事从当前时间预留；尚未结束时再次救场，会在当前临时事项后续加所选时长。任务超时则填写从现在起的剩余时长。', '比较保截止时间、保结束时间、保今日重点，查看哪些任务会移动或延期。', '确认采用后才改变日程；会议、课程和已完成事项保持原样，续加时仍检查冲突。之后可继续救场，也可在回顾中逐次撤销。'] },
  { id: 'explore', introduced: 6, icon: 'compass', title: '想做的事与走过的路', summary: '「探索」里有收集箱和回顾。',
    tips: ['收集箱保留尚未安排的待办，可按分类筛选，也能直接添加分类。选中分类后记事会沿用该分类，待办可安排到今天。', '开启空闲提醒后，有较长连续空档时会问你要不要做一件待办，每天最多一次。', '回顾可查看调整记录、撤销最近一次方案；之后又修改任务时，会保护新的修改。'] },
  { id: 'preferences', introduced: 5, icon: 'user', title: '把偏好设成你的节奏', summary: '在「我的」设置习惯，也可以导入课程。',
    tips: ['起止时刻分别选择时、分；结束可切换当天／次日，最晚到次日 6 时。缓冲与空闲提醒用小时、分钟的数量表示，均按各自范围选择。', '哈工大（深圳）本科课表：进入课表导入，在手机教务网页登录，核对学期第一周周一和课程后确认。', '学校账号和会话留在内置教务网页，课程作为固定事项参与日程。'] },
  { id: 'permissions', introduced: 7, icon: 'bell', title: '让提醒在合适的时候出现', summary: '通知权限用于任务开始、小事定时和收集箱空闲提醒；空闲提醒可独立选择。',
    tips: ['点击下面的按钮后，手机才会请求通知权限。', '暂不开启也能继续使用，之后可在「我的」调整。'] },
  { id: 'ready', introduced: 2, icon: 'check-circle', title: '准备好，开始自己的节奏', summary: '完成教程，直接进入自己的日程。',
    tips: ['示例只留在教程中。第一次使用从空白日程开始，已有任务和偏好会保留，重看教程也不会清空。', '在「我的 → 检查更新」获取已发布版本。下载后由系统确认安装，按需允许浏览器安装该更新包。', '重要日程可在「我的」导出备份；数据保存在本机，卸载或清除应用数据会移除记录。'] },
] as const;
export type GuideStepId = typeof GUIDE_STEPS[number]['id'];
export type GuideProgress = { version: 1; revision: number; stepId: GuideStepId; completedRevision: number; deferredRevision: number };
export const GUIDE_STORAGE_KEY = 'liubai.guide.v1';
export const freshGuideProgress = (): GuideProgress => ({ version: 1, revision: GUIDE_REVISION, stepId: 'welcome', completedRevision: 0, deferredRevision: 0 });

export function parseGuideProgress(raw: string | null): GuideProgress {
  try {
    if (!raw) return freshGuideProgress();
    const value = JSON.parse(raw) as GuideProgress;
    const revision = (number: unknown) => Number.isSafeInteger(number) && (number as number) >= 0 && (number as number) <= 10000;
    if (!value || value.version !== 1 || !revision(value.revision) || value.revision < 1
      || !revision(value.completedRevision) || !revision(value.deferredRevision)) return freshGuideProgress();
    return { version: 1, revision: value.revision, completedRevision: value.completedRevision, deferredRevision: value.deferredRevision,
      stepId: GUIDE_STEPS.some(step => step.id === value.stepId) ? value.stepId : 'welcome' };
  } catch { return freshGuideProgress(); }
}

export function shouldShowGuide(progress: GuideProgress, revision = GUIDE_REVISION): boolean {
  return progress.completedRevision < revision && progress.deferredRevision < revision;
}
export function guideStartStep(progress: GuideProgress, revision = GUIDE_REVISION,
  steps: readonly { id: GuideStepId; introduced: number }[] = GUIDE_STEPS): GuideStepId {
  if (progress.completedRevision >= revision) return steps[0].id;
  if (progress.revision !== revision) return steps.find(step => step.introduced > progress.completedRevision)?.id ?? steps[0].id;
  return steps.some(step => step.id === progress.stepId) ? progress.stepId : steps[0].id;
}
export function visitGuideStep(progress: GuideProgress, stepId: GuideStepId): GuideProgress {
  return { ...progress, revision: GUIDE_REVISION, stepId };
}
export function deferGuide(progress: GuideProgress): GuideProgress {
  return { ...progress, revision: GUIDE_REVISION, deferredRevision: Math.max(progress.deferredRevision, GUIDE_REVISION) };
}
export function completeGuide(progress: GuideProgress): GuideProgress {
  return { ...progress, revision: GUIDE_REVISION, stepId: GUIDE_STEPS[GUIDE_STEPS.length - 1].id,
    completedRevision: Math.max(progress.completedRevision, GUIDE_REVISION), deferredRevision: Math.max(progress.deferredRevision, GUIDE_REVISION) };
}
export function createGuideWriter(write: (value: string) => Promise<void>): (progress: GuideProgress) => Promise<void> {
  let queue = Promise.resolve();
  return progress => { const encoded = JSON.stringify(progress); queue = queue.catch(() => {}).then(() => write(encoded)); return queue; };
}
