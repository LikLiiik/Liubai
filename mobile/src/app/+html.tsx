import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();
  return <html {...htmlAttributes} lang="zh-CN"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#F7F8FA" /><meta name="description" content="留白：计划被打乱时，帮你安排好接下来。离线日程、一键救场、清晰的取舍预览。" />
    <title>留白 · 给今天留一点余地</title><ScrollViewStyleReset />
    <style dangerouslySetInnerHTML={{ __html: `body{background:#F7F8FA}*{box-sizing:border-box}button,input,textarea{font:inherit}input:focus,textarea:focus{outline:2px solid #c5b7ee;outline-offset:2px}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-thumb{background:#dedde6;border-radius:8px}::selection{background:#e5dcfa}` }} />
    {headNodes}
  </head><body {...bodyAttributes}>{children}{bodyNodes}</body></html>;
}
