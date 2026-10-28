import { Tag } from 'antd'

interface Props {
  /** 报名分是否启用；减免运费/会员红包为固定规则，永远为 true */
  enabled?: boolean
}

/**
 * 自然流量各计分面板共用的报名状态标签。
 * 只读态统一用标签表达状态，避免有的面板显示禁用开关、有的显示标签、有的什么都没有；
 * 真正的报名分开关仍只在编辑态出现。
 * 文案不用「報名即給分」：门槛护欄（券类 guardMultiplier / 减免运费 guardThreshold）
 * 超限时报名分会一併停发，写「即给」会让运营误以为报名后就无条件得分。
 */
export default function EnrollmentScoreTag({ enabled = true }: Props) {
  return enabled
    ? <Tag color="success" style={{ margin: 0 }}>滿足條件才給分</Tag>
    : <Tag style={{ margin: 0 }}>報名分已停用</Tag>
}
