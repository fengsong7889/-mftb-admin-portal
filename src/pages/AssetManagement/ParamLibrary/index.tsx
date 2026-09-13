/**
 * 参数库管理（物资管理 - 基础数据）
 *
 * 左右结构：左侧参数类型列表 + 右侧参数值列表
 */
import ParamLibraryList from './ParamLibraryList'

/** 参数库管理页面入口 */
export default function ParamLibrary() {
  return (
    <div className="content-area">
      <ParamLibraryList />
    </div>
  )
}
