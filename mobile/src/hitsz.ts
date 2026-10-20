export const HITSZ_ENTRY = 'http://jw.hitsz.edu.cn';
export const HITSZ_HELP = 'https://nic.hitsz.edu.cn/info/1030/1461.htm';
export type SchoolRequest = { year: string; term: string };
export type SchoolRead = { year: string; term: string; monday: string; rows: { KEY: string; SKSJ: string }[] };
export type SchoolLoginProps = { visible: boolean; request: SchoolRequest; onRead: (value: SchoolRead) => void; onClose: () => void };
export type SchoolFetcher = (path: string, fields: Record<string, string>) => Promise<unknown>;

// The transport only exposes the school's two read-only course endpoints.
export async function collectHitsz(fetcher: SchoolFetcher, request: SchoolRequest): Promise<SchoolRead> {
  let year = request.year, term = request.term;
  if (!year || !term) {
    const current = await fetcher('/component/querydangqianxnxq', {}) as { XN?: unknown; XQ?: unknown };
    year = String(current?.XN ?? ''); term = String(current?.XQ ?? '');
  }
  if (!/^\d{4}-\d{4}$/.test(year) || !['1', '2', '3'].includes(term)) throw new Error('无法识别学期，请手动选择学年和学期。');
  let monday = '';
  try {
    const calendar = await fetcher('/component/queryRlZcSj', { xn: year, xq: term, djz: '1' }) as { content?: { rq?: unknown }[] };
    const candidate = calendar?.content?.[0]?.rq;
    if (typeof candidate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(candidate)) monday = candidate;
  } catch { /* A manually confirmed first Monday is allowed; never guess it. */ }
  const payload = await fetcher('/xszykb/queryxszykbzong', { xn: year, xq: term });
  const object = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const rows = Array.isArray(payload) ? payload : Array.isArray(object.content) ? object.content : Array.isArray(object.data) ? object.data : null;
  if (!rows || rows.length > 1000) throw new Error('未读取到有效课表，请确认已登录教务系统并打开个人课表。');
  if (!rows.every(row => row && typeof row.KEY === 'string' && typeof row.SKSJ === 'string' && row.KEY.length < 200 && row.SKSJ.length <= 10000)) throw new Error('课表结构与当前适配不一致，请保留页面并稍后重试。');
  // Only course fields cross the bridge. Never return account, headers, cookies or HTML pages.
  return { year, term, monday, rows: rows.map(row => ({ KEY: row.KEY, SKSJ: row.SKSJ })) };
}

export function schoolUrlAllowed(value: string): boolean {
  try {
    const url = new URL(value);
    const school = ['hitsz.edu.cn', 'hit.edu.cn'].some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
    return school && (url.protocol === 'https:' || url.protocol === 'http:' && url.hostname === 'jw.hitsz.edu.cn');
  } catch { return false; }
}

export function buildSchoolReadScript(request: SchoolRequest, requestId: string): string {
  return `(async function () {
    const send = value => window.ReactNativeWebView.postMessage(JSON.stringify({requestId:${JSON.stringify(requestId)},...value}));
    try {
      if (location.hostname !== 'jw.hitsz.edu.cn') throw new Error('请完成登录，并从学校门户进入教务系统的个人课表。');
      const fetcher = async (path, fields) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
          const response = await fetch(path, {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams(fields).toString(),signal:controller.signal});
          if (!response.ok || !response.url || new URL(response.url).hostname !== 'jw.hitsz.edu.cn') throw new Error('教务会话已失效，请重新登录后读取。');
          const raw = await response.text();
          if (raw.length > 2000000 || /^\\s*</.test(raw)) throw new Error('请在教务页面完成登录后重试。');
          try { return JSON.parse(raw); } catch { throw new Error('课表响应无法识别，请重新打开个人课表。'); }
        } finally { clearTimeout(timer); }
      };
      const request = ${JSON.stringify(request)};
      if (!/^\\d{4}-\\d{4}$/.test(request.year) || !['1','2','3'].includes(request.term)) throw new Error('请选择有效学期。');
      const fields = {xn:request.year,xq:request.term};
      let monday = '';
      try {
        const calendar = await fetcher('/component/queryRlZcSj',{...fields,djz:'1'});
        const candidate = calendar && calendar.content && calendar.content[0] && calendar.content[0].rq;
        if (typeof candidate === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(candidate)) monday = candidate;
      } catch (_) {}
      const payload = await fetcher('/xszykb/queryxszykbzong',fields);
      const rows = Array.isArray(payload) ? payload : payload && Array.isArray(payload.content) ? payload.content : payload && Array.isArray(payload.data) ? payload.data : null;
      if (!rows || rows.length > 1000 || !rows.every(row => row && typeof row.KEY === 'string' && row.KEY.length < 200 && typeof row.SKSJ === 'string' && row.SKSJ.length <= 10000)) throw new Error('未读取到有效课表，请确认已登录教务系统并打开个人课表。');
      const data = {year:request.year,term:request.term,monday,rows:rows.map(row => ({KEY:row.KEY,SKSJ:row.SKSJ}))};
      send({ok:true,data});
    } catch (error) { send({ok:false,error:error && error.name === 'AbortError' ? '读取超时，请检查校园网络或安校通连接。' : error instanceof Error ? error.message : '读取失败，请重试。'}); }
  })(); true;`;
}

export const SAMPLE_ROWS = [
  { KEY: 'xq1_jc1', SKSJ: '高等数学（示例）\n[1-4周]\n[第1-2节]\n[示例教师][T2-203]' },
  { KEY: 'xq3_jc3', SKSJ: '大学英语（示例）\n[1-4周(单)]\n[第3-4节]\n[示例教师][T3-301]' },
  { KEY: 'xq5_jc7', SKSJ: '体育（示例）\n[1-2,4周]\n[第7-8节]\n[示例教师][体育馆]' },
];

export function sampleSchoolFetcher(monday: string): SchoolFetcher {
  return async path => {
    if (path === '/component/querydangqianxnxq') return { XN: '2026-2027', XQ: '1' };
    if (path === '/component/queryRlZcSj') return { content: [{ rq: monday }] };
    if (path === '/xszykb/queryxszykbzong') return SAMPLE_ROWS;
    throw new Error('未适配的查询');
  };
}
