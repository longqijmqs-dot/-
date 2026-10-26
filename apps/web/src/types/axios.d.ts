import 'axios';

/**
 * 给 axios 的请求配置补两个自定义字段，
 * 这样调用处不用写 `as never` 这种破坏类型的强制转换。
 */
declare module 'axios' {
  interface AxiosRequestConfig {
    /** 该请求失败时不要触发静默刷新（登录、登出、刷新本身用） */
    skipAuthRefresh?: boolean;
    /** 内部标记：这个请求已经因 401 重放过一次，避免无限重试 */
    __retried?: boolean;
  }
}
