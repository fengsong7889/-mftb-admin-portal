/**
 * RDM 页面「返回 / 保存后」的统一导航落点。
 *
 * 背景：需求详情是需求跟进清单 / 提需求 / 工作台 / 看板共用的落地页，任务、PRD、评审、
 * 变更又是被详情页 push 出来的独立表单页。表单保存后若直接 navigate(`/rdm-detail?id=…`)，
 * 历史栈会多出一条「详情 → 表单 → 详情」：用户点一次返回先落回表单页，再点才回到更早的详情页；
 * 连续新建任务时历史记录还会无限往返（需求跟进清单「返回穿越」bug）。
 *
 * 因此能回退时一律 go(-1)：复用进入时那条来源页记录，栈不增长；来源页因 pathname 变化
 * 会整树 remount 并重新取数，新建/修改的数据照样可见，from 也天然保留（侧栏高亮不跳菜单）。
 *
 * 直接打开页面（location.key === 'default'，例如钉钉通知深链、收藏夹）没有站内上一页，
 * 回退会退出整个站点，此时 replace 到语义落点。
 */
import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/** React Router 初次加载的 location.key 固定为 'default'：说明这一页是直接打开的，栈里没有站内上一页 */
export const INITIAL_LOCATION_KEY = 'default'

/** 是否存在可回退的站内历史（抽成纯函数，便于单测覆盖两种入口） */
export function hasInAppHistory(locationKey: string): boolean {
  return locationKey !== INITIAL_LOCATION_KEY
}

/**
 * @param fallbackPath 无站内历史时的语义落点（如需求详情 / 交付看板），必须是站内路径
 */
export function useRdmBack(fallbackPath: string) {
  const navigate = useNavigate()
  const { key } = useLocation()
  return useCallback(() => {
    if (hasInAppHistory(key)) {
      navigate(-1)
      return
    }
    // 深链/直接打开没有上一页：replace 到语义落点，避免在历史栈里多留一条无效记录
    navigate(fallbackPath, { replace: true })
  }, [navigate, key, fallbackPath])
}
