import { Component, type ReactNode } from 'react'
import { Button, Result } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import i18n from '../i18n'

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

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // chunk 加载失败：多为部署更新导致旧资源失效，自动重载一次拉取新资源
    if (isChunkLoadError(error) && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1')
      window.location.reload()
      return
    }
    // 记录错误及组件堆栈便于排查
    console.error('[RouteErrorBoundary] 页面加载/渲染异常:', error)
    if (info.componentStack) {
      console.error('[RouteErrorBoundary] 组件堆栈:', info.componentStack)
    }
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
          title={chunkError ? i18n.t('errorBoundary.chunkFailed') : i18n.t('errorBoundary.pageError')}
          subTitle={
            chunkError
              ? i18n.t('errorBoundary.chunkSub')
              : error?.message || i18n.t('errorBoundary.errorSub')
          }
          extra={
            <Button type="primary" icon={<ReloadOutlined />} onClick={this.handleReload}>
              {i18n.t('errorBoundary.reload')}
            </Button>
          }
        />
      </div>
    )
  }
}
