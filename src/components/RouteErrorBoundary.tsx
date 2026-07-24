import { Component, type ReactNode } from 'react'
import { Button, Result } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'

interface RouteErrorBoundaryProps {
  children: ReactNode
}

interface RouteErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/** 懒加载 chunk 加载失败的错误特征（部署更新后旧 chunk 404 时抛出） */
function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false
  const msg = `${error.name} ${error.message}`
  return (
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  )
}

const RELOAD_FLAG = 'route-chunk-reloaded'

/**
 * 路由级错误边界
 * - 捕获页面渲染异常与懒加载 chunk 加载失败，避免整屏白屏
 * - chunk 加载失败时自动重载一次（sessionStorage 标记防止循环刷新）
 * - 其它错误展示可读的错误信息与「重新加載」按钮
 */
export default class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    // chunk 加载失败：多为部署更新导致旧资源失效，自动重载一次拉取新资源
    if (isChunkLoadError(error) && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1')
      window.location.reload()
      return
    }
    // 记录错误便于排查
    console.error('[RouteErrorBoundary] 页面加载/渲染异常:', error)
  }

  handleReload = () => {
    sessionStorage.removeItem(RELOAD_FLAG)
    window.location.reload()
  }

  render() {
    const { hasError, error } = this.state
    if (!hasError) return this.props.children

    const chunkError = isChunkLoadError(error)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Result
          status={chunkError ? 'warning' : 'error'}
          title={chunkError ? '頁面資源加載失敗' : '頁面出現異常'}
          subTitle={
            chunkError
              ? '可能是版本已更新，請重新加載頁面獲取最新資源。'
              : error?.message || '頁面渲染時發生錯誤，請重新加載或聯繫技術支持。'
          }
          extra={
            <Button type="primary" icon={<ReloadOutlined />} onClick={this.handleReload}>
              重新加載
            </Button>
          }
        />
      </div>
    )
  }
}
