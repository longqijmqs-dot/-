/**
 * 极简 Markdown 渲染器。
 *
 * 为什么自己写而不引 markdown-it？
 *   - 体积：这个场景只需要代码块、行内代码、加粗、链接
 *   - 安全：先整体转义 HTML，再做替换，天然免疫 XSS（不依赖第三方配置是否正确）
 *
 * 支持：``` 代码块、`行内代码`、**加粗**、[文字](链接)
 * 不支持：表格、列表嵌套、原始 HTML —— 会把它们当普通文本显示
 */

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPE_MAP[char] ?? char);
}

function renderInline(text: string): string {
  return text
    // 行内代码优先，避免里面的 * 被当成加粗
    .replace(/`([^`\n]+)`/g, (_m, code: string) => `<code>${code}</code>`)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export interface RenderResult {
  html: string;
  /** 末尾是否有未闭合的代码块（用于前端加「生成中」的视觉提示） */
  hasOpenFence: boolean;
}

export function renderMarkdown(raw: string): RenderResult {
  const escaped = escapeHtml(raw);
  const parts = escaped.split(/```/);

  // 偶数段是普通文本，奇数段是代码块内容
  const htmlParts: string[] = [];
  let hasOpenFence = false;

  parts.forEach((segment, index) => {
    const isCode = index % 2 === 1;
    if (!isCode) {
      // 普通文本：保留换行
      const withBreaks = renderInline(segment).replace(/\n/g, '<br>');
      htmlParts.push(withBreaks);
      return;
    }

    // 代码块：第一行可能是语言标记
    const newlineAt = segment.indexOf('\n');
    const firstLine = newlineAt === -1 ? segment : segment.slice(0, newlineAt);
    const looksLikeLanguage = /^[a-zA-Z0-9+#-]{0,16}$/.test(firstLine.trim());
    const code = looksLikeLanguage && newlineAt !== -1 ? segment.slice(newlineAt + 1) : segment;

    // 最后一个奇数段若没有被后面的 ``` 闭合成偶数段，说明代码块还没写完
    const isLast = index === parts.length - 1;
    if (isLast) {
      hasOpenFence = true;
    }

    htmlParts.push(
      `<pre class="md-code"${isLast ? ' data-streaming="true"' : ''}><code>${code.replace(/\n$/, '')}</code></pre>`,
    );
  });

  return { html: htmlParts.join(''), hasOpenFence };
}
