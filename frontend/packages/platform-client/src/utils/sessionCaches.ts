/**
 * 会话级本机缓存清理注册表。
 *
 * 为什么需要：列表场景、未保存草稿等数据存在 sessionStorage / 模块级 Map 里，
 * 登录用户切换后如果只是换 key，旧数据仍留在浏览器中；主动登出时更应一并清掉。
 * 这里提供一个与业务无关的注册点，避免 AuthContext 反过来 import 具体页面模块。
 *
 * 约束：
 * - 注册的清理函数必须幂等、不得抛异常、不得依赖登录态；
 * - 只清理本机会话缓存，不发起网络请求，不处理服务端撤销。
 */
type Cleaner = () => void

const cleaners = new Set<Cleaner>()

/** 注册一个会话缓存清理函数；返回注销函数 */
export function registerSessionCleaner(cleaner: Cleaner): () => void {
  cleaners.add(cleaner)
  return () => cleaners.delete(cleaner)
}

/** 清理全部已注册的会话缓存（登出 / 登录态失效 / 账号切换时调用） */
export function clearSessionCaches(): void {
  cleaners.forEach(cleaner => {
    try {
      cleaner()
    } catch {
      // 单个缓存清理失败不能阻断登录/登出主流程
    }
  })
}
