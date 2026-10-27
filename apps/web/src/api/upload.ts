import { ErrorCode, type Attachment } from '@app/contract';
import { accessToken } from './token';

/**
 * 上传文件到后端。
 *
 * 为什么不用 axios？
 *   axios 默认会把 body 序列化成 JSON，但文件上传要用 multipart/form-data。
 *   虽然 axios 也能发 FormData，但 fetch 更直接——FormData 本身就是浏览器原生对象。
 *
 * ⚠️ 代价：裸 fetch 享受不到 axios 拦截器里的「token 过期自动续期」，
 *   所以下面必须自己处理 401/20002，否则页面开着超过 15 分钟（access token TTL）
 *   后，上传会突然全部失败。这种 bug 极隐蔽——刚登录时一切正常，
 *   放一会儿再传就挂，而且和文件本身毫无关系。
 */
export async function uploadFile(file: File, retried = false): Promise<Attachment> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/uploads', {
    method: 'POST',
    headers: {
      ...(accessToken.value ? { authorization: `Bearer ${accessToken.value}` } : {}),
      // 注意：不要设 content-type！浏览器会自动设成 multipart/form-data + boundary
    },
    body: formData,
  });

  if (!response.ok) {
    const envelope = (await response.json().catch(() => null)) as
      | { code: number; message: string }
      | null;

    // access token 过期 → 静默续期后重试一次（复用 http.ts 里的单飞刷新）
    if (response.status === 401 && envelope?.code === ErrorCode.TOKEN_EXPIRED && !retried) {
      const { refreshSession } = await import('./http');
      const session = await refreshSession();
      if (session) {
        return uploadFile(file, true);
      }
      // 续期失败说明登录态真的没了，交给全局处理器踢回登录页
      const { notifyUnauthorized } = await import('./token');
      notifyUnauthorized();
    }

    throw new Error(envelope?.message ?? `上传失败 (HTTP ${response.status})`);
  }

  const envelope = (await response.json()) as { code: number; message: string; data: Attachment };
  if (envelope.code !== 0) {
    throw new Error(envelope.message);
  }
  return envelope.data;
}

/** 判断是否是图片（前端用来决定渲染成预览还是文件图标） */
export function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/** 格式化文件大小（1024 → "1 KB"） */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
