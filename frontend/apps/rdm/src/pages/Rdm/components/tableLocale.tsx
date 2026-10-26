/**
 * RDM 列表空态统一口径：加载中绝不渲染「暫無數據」。
 *
 * <p>antd Table 在 loading 时仍会显示 locale.emptyText，历史缺陷是首帧先闪
 * 「無此資料」再出数据，用户会误判为没有数据。这里把 loading 与 empty 分开：
 * 加载中给 Spin，请求落地且结果为空才给 Empty。
 */
import { Empty, Spin } from 'antd'

export function rdmTableLocale(loading: boolean, emptyText: string) {
  return {
    emptyText: loading
      ? <div style={{ padding: 16 }}><Spin size="small" /></div>
      : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />,
  }
}
