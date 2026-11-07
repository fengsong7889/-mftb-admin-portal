/**
 * 团购券卡片 · 字段规范（唯一真源）
 *
 * 本文件是瀑布流卡片所有字段的规范定义，同时驱动：
 * - 手机壳内的 SpecField 高亮联动（方案B）
 * - 壳外说明表格的渲染（方案B）
 * - GroupBuyItem 接口的 JSDoc（方案D）
 *
 * 增删字段：只需修改本文件数组 + 在卡片 JSX 里加/去 <SpecField id={N}> 包裹。
 * 编辑说明：表格双击可原地编辑，存 localStorage 覆盖默认值。
 */

/* ─── 字段规范接口 ─── */
export interface SpecEntry {
  id: number
  label: string
  desc: string
  source: string
  /** 展示品牌：both=双品牌（缺省）、bee=仅閃蜂、mfood=仅MFOOD */
  brand?: 'both' | 'bee' | 'mfood'
  /** 重点提示（醒目色展示，如旧系统遗留/仅某品牌有等注意项） */
  note?: string
}

/* ─── 默认规范（代码即文档，描述对齐设计稿逐字） ─── */
export const DEFAULT_SPECS: SpecEntry[] = [
  { id: 1, label: '品牌名称', desc: '【展示】金色高亮加粗字体 + 竖线分隔符「魚-日本料理大王大三巴店」。\n数据来源：取当前门店配置的品牌名称展示', source: '商家后台 → 门店配置 → 品牌名称' },
  { id: 2, label: '商品封面图', desc: '管理后台→创建/编辑商品--商品配置中商品封面图', source: '商家后台 → 商品配置中商品封面图' },
  { id: 3, label: '新品角标', desc: '【触发规则】自商品「有效开售」后30天内，系统自动标识为「新品」标签。\n3项硬性前置条件：①已上架；②处于有效销售时间段内；③当前有库存（未售罄），任一不满足则自动隐藏。\n30天生命周期：有效开售满30天后（第31天零点起）自动移除', source: '系统自动计算（第31天零点起移除）' },
  { id: 4, label: '类型标签', desc: '右下角半透明标签（如「酒」）。管理后台→创建/编辑商品→商品配置是否酒类，是则展示该标签', source: '商家后台 → 商品配置是否酒类' },
  { id: 5, label: '商品名称', desc: '【展示】黑色粗体文字「200蚊代250蚊券 葉林極上日料放題💕炒...」，支持 Emoji 显示。\n排版截断：单行展示（或与门店名同行），超出可用宽度尾部自动以省略号「...」截断，确保卡片整齐统一。\n交互行为：点击标题文字直接跳转至「商品详情页」', source: '商家配置的商品标题' },
  { id: 6, label: '半年售+标签', desc: '【展示】横向平铺展示：数据标签、榜单标签与商品自定义标签。\n销量标签「半年售1000+」：虚假销量+真实销量；<100直接展示；100≤销量<200展示为100+；200≤销量<300展示为200+；以此类推；万位以上，1万≤销量<1.1万展示为1万+；1.1万≤销量<1.2万则显示为1.1万+，以此类推，大于9.9万都显示为9.9万+\n自定义标签：管理后台配置（如「人气热卖」「性价比之选」），超出1行不展示', source: '管理后台配置' },
  { id: 7, label: '销售价/原价', desc: '【展示】红色大粗体现价「$240」+ 灰色划线门市价「$90」。\n销售价如有积分抵扣，读取积分抵扣后的价格并显示积分价标签。\n货币符号：默认展示门店所属币种（如 MOP / HKD / CNY）', source: '商家后台 → 商品配置中销售价和原价' },
  { id: 8, label: '降价提示', desc: '【展示】淡黄底框内展示下降图標与优惠说明「↓ 降價超20%，勁慳$20」。\n限時優惠商品顯示：降價超×%，省y元；x=（原價-現價）/原價*100%，不保留小數點後的小數；y=原價-現價，只保留小數點後一位，第二位直接捨掉', source: '前端根据价格实时计算' },
  { id: 9, label: '定位距离', desc: '根据用户 GPS 与最近分店计算距离；小于1公里的门店显示单位是 m', source: '用户定位 + 门店坐标' },
  { id: 10, label: '行政区', desc: '标示该门店所属行政商圈（如「筷子基」）', source: '门店配置 → 所属区域' },
  { id: 11, label: '门店名称', desc: '显示距离用户最近的适用门店', source: '商家后台 → 门店配置 → 商家名称' },
  { id: 12, label: '搶購 CTA', desc: '【展示】高饱和度红色切角胶囊按钮，白字加粗「搶購」+ 右箭头「▸」。\n以下场景不能展示：1、商品已下架；2、商品已售罄；3、未在销售时间内；4、商品配置不在该页面展示', source: '商品状态+销售时间+页面配置联合判断' },
  { id: 13, label: '秒殺', desc: '图片角落「秒殺」红标 + 倒计时文字：閃蜂展示在图片左上角，MFOOD 展示在图片底部横条。\n进度条：MFOOD 图片下方库存进度条（如「剩餘50份」，按总量100取剩余数填充）；閃蜂卡片下方已搶进度条（如「已搶30%」）', source: '商家配置秒殺活动 + 库存/抢购数据实时计算', brand: 'both' },
  { id: 14, label: '评分', desc: '门店评分（如「4.5分」），展示在距离/行政区之前。', note: '仅閃蜂展示，MFOOD 无此字段；最新设计图已不展示，此为旧系统所展示的标签', source: '门店配置 → 评分', brand: 'bee' },
]

/* ─── localStorage 读写（版本号变更时自动失效旧缓存） ─── */
const SPEC_VERSION = 6
const STORAGE_KEY = 'app-preview:group-buy-specs'

export function loadSpecs(): SpecEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const verRaw = localStorage.getItem(STORAGE_KEY + ':v')
    if (!raw || verRaw !== String(SPEC_VERSION)) return DEFAULT_SPECS
    const saved: SpecEntry[] = JSON.parse(raw)
    return saved.length > 0 ? saved : DEFAULT_SPECS
  } catch {
    return DEFAULT_SPECS
  }
}

export function saveSpecs(specs: SpecEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(specs))
  localStorage.setItem(STORAGE_KEY + ':v', String(SPEC_VERSION))
}

export function resetSpecs() {
  localStorage.removeItem(STORAGE_KEY)
}
