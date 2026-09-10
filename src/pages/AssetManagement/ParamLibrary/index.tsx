/**
 * 參數庫管理（物資管理 - 基礎數據）
 *
 * 左右結構：左側參數類型列表 + 右側參數值列表
 */
import ParamLibraryList from './ParamLibraryList'

export default function ParamLibrary() {
  return (
    <div className="content-area">
      <ParamLibraryList />
    </div>
  )
}
