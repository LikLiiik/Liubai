export type Greeting = { id: string; title: string; message: string };
export const GREETING_STORAGE_KEY = 'liubai.greeting.v1';

const greetings = [
  [
    ['凌晨好', '夜深了，给自己留一点余地。'],
    ['夜里好', '没做完的事，也可以留给明天。'],
    ['夜色正静', '按自己的节奏，慢慢收尾。'],
    ['又见面了', '今晚的计划里，也给休息留个位置。'],
    ['夜深了', '此刻不必着急，先照顾好自己。'],
  ],
  [
    ['早上好', '今天的节奏，由你来定。'],
    ['早安', '从一件想做的事开始。'],
    ['早呀', '给新的一天，也留一点空白。'],
    ['迎接新一天', '重要的事，值得慢慢做好。'],
    ['新的一天，你好', '不用一下子想好所有事。'],
  ],
  [
    ['中午好', '忙碌之间，留一点时间给自己。'],
    ['午安', '歇一歇，再接着来。'],
    ['午间好', '下午的事，可以从容一点安排。'],
    ['午间见', '吃饭和休息，也值得认真对待。'],
    ['又到午间', '计划里可以有进展，也可以有留白。'],
  ],
  [
    ['下午好', '一件一件来，也是在向前。'],
    ['午后好', '给接下来的时间，留些弹性。'],
    ['午后见', '不必填满每一格，按自己的步调来。'],
    ['又见面了', '这个下午，先做你在意的事。'],
    ['下午也从容', '留一点空白，接住临时的变化。'],
  ],
  [
    ['晚上好', '今天辛苦了，接下来也留点时间给自己。'],
    ['晚间好', '给今晚留一点轻松的安排。'],
    ['晚上见', '一天的进展，不只有打完的勾。'],
    ['又见面了', '今晚想做什么，慢慢安排就好。'],
    ['给今晚留白', '重要的事慢慢做，休息也有位置。'],
  ],
] as const;

export function greetingPeriod(minute: number): number {
  return minute < 300 ? 0 : minute < 660 ? 1 : minute < 840 ? 2 : minute < 1080 ? 3 : 4;
}
export function greetingChoices(period: number): Greeting[] {
  return greetings[period].map(([title, message], index) => ({ id: `${period}:${index}`, title, message }));
}
export function chooseGreeting(period: number, previous: string | null, random = Math.random): Greeting {
  const choices = greetingChoices(period).filter(choice => choice.id !== previous);
  return choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))];
}
export function personalizeGreeting(nickname: string | undefined, title: string): string {
  return nickname ? `${nickname}，${title}` : title;
}

// Serialize focus/foreground requests so rapid navigation avoids adjacent repeats.
// Persistence errors only affect greetings; task and preference storage is independent.
export function createGreetingRotation(storage: { get: () => Promise<string | null>; set: (value: string) => Promise<void> }, random = Math.random) {
  let previous: string | null = null;
  let loaded = false;
  let queue = Promise.resolve();
  return (period: number): Promise<Greeting> => {
    const result = queue.then(async () => {
      if (!loaded) {
        try { previous = await storage.get(); } catch { /* Rotate in memory if storage is unavailable. */ }
        loaded = true;
      }
      const next = chooseGreeting(period, previous, random);
      previous = next.id;
      try { await storage.set(next.id); } catch { /* Retry persistence on the next visit. */ }
      return next;
    });
    queue = result.then(() => {});
    return result;
  };
}
