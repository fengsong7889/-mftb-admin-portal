/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 主题令牌映射表与裸色值统计口径 —— codemod 与门禁共用的**单一真源**。
 *
 * 背景（方案：docs/design/深浅色主题切换_可落地实施方案_2026-11-03.md）：
 * 全站 CSS 有 3218 处裸色值（242 个独立值）、TSX 内联 style 有 9987 处，
 * 深色模式必须把它们收敛到语义令牌。两个 codemod（CSS / 内联）与门禁
 * `check-theme-tokens` 都从本文件读取映射与排除清单，禁止各自内嵌副本——
 * 三份映射表必然漂移，漂移的后果是同一色值在不同目录被替换成不同令牌。
 *
 * 两条硬判据（决定一个色值能否进 COLOR_TO_TOKEN）：
 *
 * 1. **严格等值**：色值必须与目标令牌的**浅色值完全相同**。
 *    因为 `:root` 的浅色令牌值 = 现状裸色值，等值替换在浅色主题下才是
 *    「视觉恒等变换」。像 `#CF1322`（深红）虽语义接近 `--danger`(#FF4D4F)，
 *    但替换后浅色下红会明显变浅 —— 这类一律进 REVIEW_REQUIRED，交人工判定。
 *
 * 2. **语义单一**：同一色值在全站只承担一种语义。
 *    反例 `#333333`：既是侧边栏菜单激活底（`Menu.itemActiveBg`），
 *    又是表头文字色（`Table.headerColor`），还散落在一批页面里当正文深色。
 *    机械替换无法区分上下文，错了就是跨模块的视觉回归，因此也进 REVIEW_REQUIRED。
 *
 * 属性上下文：白色 `#FFFFFF` 作卡片底是 `--surface-2`，作文字时却不能机械定为 `--on-brand`
 * （橙底该转深色，侧边栏/蓝横幅/登录页必须保持白色），因此白字不纳入自动映射。
 * 所以映射表按属性分 bg / fg / border 三段，
 * 由 classifyProperty() 判定当前声明属于哪一段，**不得**退化成单一色值映射。
 */

/**
 * 语义令牌清单（与 packages/ui/src/styles/theme.css 的 `:root` 一一对应）。
 * 门禁用它校验 theme.css 的 `:root` 与 `[data-theme='dark']` 两块 key 集合是否一致：
 * 漏定义深色值不会报错，只会静默 fallback 到浅色值，是最难发现的一类缺陷。
 */
export const SEMANTIC_TOKENS = [
  // 表面
  'surface-1', 'surface-2', 'surface-3', 'surface-hover', 'surface-sunken', 'header-glass', 'art-surface',
  // 插画角色表面（与纸面 --art-surface 语义不同，见 TOKEN_VALUES 里的实测对比度）
  'art-figure',
  // 文字
  'text-1', 'text-2', 'text-3', 'text-4', 'on-brand', 'on-brand-pill', 'text-brand', 'header-text',
  // antd v4 实色灰（与上面 v5 中性阶共存，存量共 229 处前景位）
  'text-hint', 'text-body',
  // 边框
  'border-1', 'border-2', 'border-3', 'border-input',
  // 语义色描边阶（antd 实色淡彩档；浅色严格等于站内字面量，深色沿用 brand-border 的 rgba 合成约定）
  'danger-border', 'warning-border', 'success-border', 'info-border', 'purple-border',
  // 品牌橙实底上的玻璃面板族（门户 hero；浅色值等于今天字面量，见 TOKEN_VALUES 里的实测 alpha 推导）
  'brand-glass', 'brand-glass-hover', 'brand-glass-border', 'on-brand-glass',
  // 奖牌金属色族（自然流量「商家權重分」页的排名徽章）+ 配套数字前景，理由见 TOKEN_VALUES 注释
  'medal-gold', 'medal-silver', 'medal-bronze', 'on-medal',
  // 同族第二档（#D9F7BE / #FFE7BA，用量 24 与 38 处，见 TOKEN_VALUES 里的理由）
  'success-border-soft', 'warning-border-soft',
  // geekblue 四件套补齐与两个前景/底色邻阶（详见 TOKEN_VALUES 里的实测注释）
  'info-deep', 'info-hover-border', 'brand-deep',
  // 品牌
  'brand', 'brand-hover', 'brand-active', 'brand-soft', 'brand-border',
  // 统计卡描边族（主色 + 13% alpha，不能由 var() 拼接得到）
  'stat-border-info', 'stat-border-brand', 'stat-border-success', 'stat-border-purple', 'stat-border-neutral',
  // 语义色
  'success', 'success-soft', 'info', 'info-soft',
  // 首页「今日會議」提示栏专用一族（渐变底 + 描边 + 内部分隔），理由见 TOKEN_VALUES 注释
  'info-bar-from', 'info-bar-border', 'info-bar-divider',
  'warning', 'warning-soft', 'danger', 'danger-soft', 'purple', 'purple-soft',
  // 语义色的补充阶：危险提示条底、深橙前景、蓝调 hover 底
  //（它们不是另一令牌的重复值，而是 antd 调色板上真实存在、与现有令牌差 1~15 个单位的邻阶）
  'danger-callout', 'warning-deep', 'info-hover-tint',
  // success 深字档（与 warning-deep 同角色，补对称缺口；#389E0D 全站 16 处）
  'success-deep',
  // 阴影与描边补偿
  'shadow-1', 'shadow-2', 'shadow-3', 'shadow-card-soft',
  'shadow-btn-hover', 'shadow-btn-active', 'shadow-popover',
  'shadow-brand', 'card-outline',
]

/** 组件层令牌：仅壳层组件自有 CSS 可引用，业务页面禁止使用 */
export const COMPONENT_TOKENS = [
  'sidebar-bg', 'sidebar-item-color', 'sidebar-item-hover-bg',
  'sidebar-item-active-bg', 'sidebar-shadow',
]

/**
 * 令牌的双主题取值 —— **唯一真源**。
 *
 * 为什么放在这里而不是只写在 theme.css：同一套值有三个消费方（theme.css 的
 * `:root`/`[data-theme='dark']`、themeTokens.ts 的 antd token、以及本文件映射表的
 * 「严格等值」判据）。写在 CSS 里就只能靠人眼逐项比对，三处必然漂移。
 * 以本表为真源后：Phase 1 可由它生成 theme.css，themeTokens.ts 由它派生，
 * 单测（theme-token-map.test.mjs）用它自动校验映射表的等值判据。
 *
 * 深色值均经 WCAG 相对亮度实测（方案 §4.5 矩阵），禁止凭估算修改。
 * 非颜色类令牌（shadow-* / card-outline / sidebar-shadow）不在此表，单独列于 NON_COLOR_TOKENS。
 */
export const TOKEN_VALUES = {
  'surface-1': { light: '#F5F5F5', dark: '#141414' },
  'surface-2': { light: '#FFFFFF', dark: '#1F1F1F' },
  'surface-3': { light: '#FAFAFA', dark: '#262626' },
  'surface-hover': { light: '#F5F5F5', dark: '#2A2A2A' },
  'surface-sunken': { light: '#FAFBFC', dark: '#0F0F0F' },
  // 顶栏毛玻璃：必须与 --header-text 成对改动。只令牌化文字而漏了背板会得到「白底白字」
  // （实踩：门户顶栏从 1.04 的「深字白底」变成同为 1.04 的「浅字白底」，看起来没修其实更糟）。
  // 两侧都保留 alpha 以维持 backdrop-filter 的毛玻璃质感，不换成不透明实底。
  'header-glass': { light: 'rgba(255,255,255,0.92)', dark: 'rgba(31,31,31,0.92)' },
  /*
   * 插画「纸面/屏幕」专用令牌。门户 SVG 插画内有 97 个 fill="#fff" 零件（纸张、屏幕、卡片内容区），
   * 它们就是深色下「一张白卡片浮在深界面上」的全部来源（卡片本身背景已经令牌化）。
   *
   * 不能换成 --surface-2（#1F1F1F）：那与卡片底同色，纸面会直接消失、插画变成一堆悬浮线条。
   * 取 #2E2E2E：比卡片底亮两档、比表头底（#262626）再亮一点，
   * 既能消除白斑，又保留「纸面 vs 卡片底」的层次，也让 scene 主色零件（如 #E8720C 对勾）仍有对比。
   */
  'art-surface': { light: '#FFFFFF', dark: '#2E2E2E' },
  /*
   * 插画里的**角色表面**（不是纸面）：机器人的脸板、眼白、眼部高光。
   * 与 --art-surface 的区别是语义而不是色值：
   *   --art-surface 给“纸/屏/卡片”这类 UI 表板，深色下必须不发光（#2E2E2E）；
   *   --art-figure 给“白色机器人”这类**角色本体**。
   * AI 场景的实际叠层（读 SystemArtwork 查实，不是猜）：白脸板 → 紫色面罩
   * `rect x=102 y=68 w=99 h=44 fill=currentColor` → 眼白在其上 → 瞳孔是紫色 currentColor。
   * 所以深色下用 --art-surface 时，眼白与瞳孔都变成 #2E2E2E / #722ED1 这一对：
   *   实测 眼白(#2E2E2E) on 紫面罩(#722ED1) = **1.9574**，瞳孔(#722ED1) on 眼白(#2E2E2E) = **1.9574**
   *   ——非文本图形需 3:1，两边都不达标；再加上 脸(#2E2E2E) on 卡片(#1F1F1F) = **1.2138** 甚至分不出轮廓。
   *   这就是用户报的图3「深色下有点恐怖」：一张没有轮廓的脸 + 两个发暗的眼洞。
   * 改用本令牌（深 #F5F5F5）后实测：瞳孔 on 眼白 = **6.3635**，脸 on 卡片 = **15.1188**，
   *   与浅色下的观感一致（浅色下瞳孔 on 眼白实测 6.9376）。
   * 深色取 #F5F5F5 而不是 #FFFFFF：避开 §17.1 当初担心的“发光白块”；
   * 角色是小面积且内部有紫色五官，不违反“纸面不能亮白”的初衷。
   * 浅色保持 #FFFFFF → 浅色逐像素不变。
   */
  'art-figure': { light: '#FFFFFF', dark: '#F5F5F5' },
  'text-1': { light: '#262626', dark: '#E8E8E8' },
  'text-2': { light: '#595959', dark: '#B0B0B0' },
  // 深色提亮：#8C8C8C 在 #262626 表头底实测仅 4.50:1 卡线，#9A9A9A 为 5.38:1
  'text-3': { light: '#8C8C8C', dark: '#9A9A9A' },
  // 深色不可沿用浅色低对比：#595959 实测仅 2.35:1，#737373 为 3.48:1
  'text-4': { light: '#BFBFBF', dark: '#737373' },
  // 品牌色实底之上的前景（文字**与图标**）：浅底上白字 3.07:1、黑字 6.00:1。
  // 命名取 Material 的 on-X 语义：它同时覆盖按钮文字、Checkbox 勾号、Radio 内圆点，
  // 而不只是文字（旧名 --text-inverse 只暗示文字，且「inverse」容易被读成「深色主题反色」）。
  // 深色取 #141414 而非纯黑 #000：纯黑在橙底上 6.84:1 虽更高，但与正文令牌体系（#141414）不一致，且 OLED 下偏硬。
  'on-brand': { light: '#FFFFFF', dark: '#141414' },
  /*
   * 品牌渐变胶囊（BrandTag / .ap-dual-label）上的前景，**两档都是深字**。
   *
   * 为什么不复用 --on-brand：它的浅色档是 #FFFFFF，而胶囊背景不是 --brand（#E8720C）
   * 而是更亮的琥珀/亮黄渐变。实测白字在这四个端点上：
   *   #FFB300 → 1.7949   #FB8C00 → 2.3721   #FF7A45 → 2.5857   #F5680C → 3.0577
   *   #FFC107 → 1.6300   #FF6B35 → 2.8354
   * §4.6 登记的「债务④」（#E8720C 上白字 3.07）靠的是「14px/500 字重勉强成立」，
   * 而 1.63 / 1.79 **连大字号的 3.0 门槛都撑不住**，那条理由在这里不适用。
   * 改用 #141414 后：10.264 / 7.766 / 7.125 / 6.025 / 11.302 / 6.497，全部 ≥ 4.5。
   *
   * 为什么两档同值：胶囊背景本身就是不翻面的品牌资产（见 --brand 的定版理由），
   * 前景跟着主题翻面只会让浅色下回到白字不达标的状态。
   *
   * 不进 COLOR_TO_TOKEN：#141414 在站内还兼任 --surface-1 的深色档与 --on-brand 的深色档，
   * 进了 fg 段会把无关站点的深色前景全刷成“胶囊专用”语义。
   * 这个令牌存在本身就是双重盲区的产物（背景在渐变串内不计数 + 前景 #FFFFFF 在 fg 段无映射），
   * 所以它只能人工落位，并靠下面的断言而不是棘轮来守。
   */
  'on-brand-pill': { light: '#141414', dark: '#141414' },
  'text-brand': { light: '#1890FF', dark: '#40A9FF' },
  // 顶栏文字族（系统名/用户名/页签）：全站 9 处用 #2D3436，与 --text-1 的 #262626 不等值。
  // 单独建令牌而不是收敛到 --text-1，是为了守住「替换不得改变浅色观感」这条硬约束。
  'header-text': { light: '#2D3436', dark: '#E8E8E8' },
  'border-1': { light: '#D9D9D9', dark: '#424242' },
  'border-2': { light: '#F0F0F0', dark: '#303030' },
  'border-3': { light: '#E8EAED', dark: '#303030' },
  'border-input': { light: '#D9D9D9', dark: '#5A5A5A' },
  /*
   * 语义色描边阶（第八批之后的专门一轮）。存量里这些淡彩实色大量出现在
   * `border: '1px solid #FFD591'` / `borderColor: '#FFCCC7'` 这类**描边位**上，
   * 与同族的 `*-soft` 底色不是一回事（底色用透明叠加就能自适应，描边取的是
   * antd 预设的实色档），所以既不能复用 `*-soft`，也不能复用中性 `border-*`。
   *
   * 取值口径：每个族取站内**描边位出现最多**的那一档（仅统计 border 段属性，
   * 不是全站用量）：#FFD591 63 处 > #FFE7BA 29 处；#B7EB8F 32 处 > #D9F7BE 18 处；
   * #91D5FF 14 处 > #ADC6FF 7 处；#D3ADF7 17 处 > #E8D5F5 4 处；#FFCCC7 35 处 > #FFA39E 10 处。
   * 少数档**不收敛也不建第二个令牌**：收敛会改变浅色外观（违反「浅色逐像素不变」），
   * 登记为待定项（见方案 §18.6）。
   *
   * 深色侧统一用「该族深色主色 + 32% alpha」（与 `brand-border` 一致）。
   * 可见性实测（描边不是文本也不是图形实体，以下数字只用作「不得比现状更差」的回归守卫，
   * 不是 WCAG 达标声明）：浅色 vs 白卡底 1.3731~1.8935；深色合成 vs 三个卡片背板最差 1.5833~1.9546。
   * 均不低于既有 `brand-border`（浅色 1.1930 / 深色 1.6212）。
   */
  'danger-border': { light: '#FFCCC7', dark: 'rgba(255,120,117,0.32)' },
  'warning-border': { light: '#FFD591', dark: 'rgba(250,160,61,0.32)' },
  'success-border': { light: '#B7EB8F', dark: 'rgba(106,190,57,0.32)' },
  'info-border': { light: '#91D5FF', dark: 'rgba(64,169,255,0.32)' },
  'purple-border': { light: '#D3ADF7', dark: 'rgba(163,113,231,0.32)' },
  /*
   * 品牌橙实底上的玻璃面板族（门户 hero 顶部搜索框是第一个使用者）。
   * 为何必须建族而不是在 CSS 里直接写 rgba(0,0,0,0.46)：
   *   ① 直接写黑 rgba 会让 `rgbaBlack` 棘轮 +1 而当场判红；
   *   ② Portal/index.css 里这类「橙底白玻璃」写法实测有 17 处 rgba + 7 处 #fff，
   *     它们需要同一个深色方向，不建族就是 24 处各自拍 alpha。
   * 浅色值逐个等于今天 CSS 里的字面量 → 浅色逐像素不变。
   * alpha 不是拍脑袋：搜索框在横幅**最右（最亮）端**，那里 hero 渐变走到 #FFB347；
   * 实测白字 on 黑玻璃0.46 = **5.4995**（0.40 才刚过 4.5 得 4.6745，所以留余量）；
   * hover 0.56 = 7.4280；中段 #E8720C 上分别是 8.1914 / 10.3786。
   * 合成口径：tint×alpha + 背板×(1-alpha)（写反会得出“深底变亮绿”的荒谬值，本轮实踩过）。
   *
   * `on-brand-glass` 是配套前景，不是可选项：实测 --text-3 图标在玻璃底上只有
   * **1.6355~2.4360**，连非文本 3:1 都不达——**只改背景会把图标弄没**。
   * 它的浅色值 #8C8C8C 等于今天的 --text-3，所以浅色侧图标也不变。
   */
  'brand-glass': { light: 'rgba(255,255,255,0.94)', dark: 'rgba(0,0,0,0.46)' },
  'brand-glass-hover': { light: '#FFFFFF', dark: 'rgba(0,0,0,0.56)' },
  'brand-glass-border': { light: 'rgba(255,255,255,0.40)', dark: 'rgba(255,255,255,0.34)' },
  'on-brand-glass': { light: '#8C8C8C', dark: '#FFFFFF' },
  /*
   * 奖牌金属色族（自然流量「商家權重分」页的排名徽章，organic.css）。
   *
   * 两个与主题无关、但必须一起处理的发现：
   * ① 金属色是**排名语义编码**而不是表面，所以深浅两档同值。不能为了“深色更柔和”
   *    去压暗：实测 #FA8C16 压到 #D48806 后，白字 2.87、#141414 字 6.19，两头都往坏走；
   *    而徽章是 26px 小面，不触发 §17.1「大面表板不得发光」那条约束。
   * ② 真正的缺陷在**数字前景**：原来三档金属底配的全是白字，实测
   *      gold #FA8C16 2.3789 / silver #8C8C8C 3.3627 / bronze #BB6C21 3.9773
   *    —— 全部不达 AA，而且**浅色主题下也一样不达标**，不是深色改造引入的。
   *    改用 #141414 后：7.7441 / 5.4785 / 4.6319，最小值仍 ≥ 4.5。
   *    这是本轮**唯一故意改变浅色观感**的地点，因为“令牌化”不能只是把缺陷搬进表里。
   *
   * 四个值都**不进** COLOR_TO_TOKEN：#FA8C16 在站内还兼任其他语义主色的深色档
   * （§廿四 故意没把它加进 bg 段），#8C8C8C 在 fg 段已是 --text-3。进了反向映射，
   * codemod 就会把这些无关站点刷成奖牌色。所以奖牌四处全走人工。
   */
  'medal-gold': { light: '#FA8C16', dark: '#FA8C16' },
  'medal-silver': { light: '#8C8C8C', dark: '#8C8C8C' },
  'medal-bronze': { light: '#BB6C21', dark: '#BB6C21' },
  'on-medal': { light: '#141414', dark: '#141414' },
  /*
   * 同族第二档（antd 调色板更浅一档：green-2 / orange-2）。建令牌的理由是用量，不是审美：
   * 本轮实测 #D9F7BE 24 处、#FFE7BA 38 处，且它们已经卡住真实界面的成对性
   * （首页空状态图标圈：背景已令牌化、描边只能钉裸值）。
   * 深色 alpha 取 0.24（比 canonical 档 0.32 弱一档）：浅色侧这一档本来就是「更柔的细线」，
   * 深色下跟同族的 tint 底（--success-soft / --warning-soft 均为 0.16）拉开但不至于消失。
   */
  'success-border-soft': { light: '#D9F7BE', dark: 'rgba(106,190,57,0.24)' },
  'warning-border-soft': { light: '#FFE7BA', dark: 'rgba(250,160,61,0.24)' },
  brand: { light: '#E8720C', dark: '#E8720C' },
  'brand-hover': { light: '#F59432', dark: '#F59432' },
  'brand-active': { light: '#CC6200', dark: '#D4670A' },
  'brand-soft': { light: '#FFF7F0', dark: 'rgba(232,114,12,0.14)' },
  'brand-border': { light: '#FFE7D1', dark: 'rgba(232,114,12,0.32)' },
  /*
   * 统计卡描边专用令牌族。它们存在的唯一理由：内联 style 里写的是
   * `borderColor: `${tone}22``——把主色字符串与 alpha 后缀拼接。
   * 一旦 tone 改成 var(--info)，拼出 `var(--info)22` 就是非法值，描边会静默消失。
   * 所以下列每个浅色值都严格等于「对应主色 + 13% alpha」，保证令牌化后浅色不变；
   * 深色侧不能沿用 13%（在深底上几乎不可见），一律提到 28~30%。
   * 不得复用 --brand-border：它是 #FFE7D1 实色浅橙，与 13% alpha 橙的合成结果不等值。
   */
  'stat-border-info': { light: 'rgba(24,144,255,0.13)', dark: 'rgba(64,169,255,0.30)' },
  'stat-border-brand': { light: 'rgba(232,114,12,0.13)', dark: 'rgba(232,114,12,0.30)' },
  'stat-border-success': { light: 'rgba(82,196,26,0.13)', dark: 'rgba(106,190,57,0.30)' },
  'stat-border-purple': { light: 'rgba(114,46,209,0.13)', dark: 'rgba(163,113,231,0.30)' },
  'stat-border-neutral': { light: 'rgba(191,191,191,0.13)', dark: 'rgba(115,115,115,0.34)' },
  success: { light: '#52C41A', dark: '#6ABE39' },
  'success-soft': { light: '#F6FFED', dark: 'rgba(82,196,26,0.16)' },
  info: { light: '#1890FF', dark: '#40A9FF' },
  'info-soft': { light: '#E6F7FF', dark: 'rgba(24,144,255,0.16)' },
  /*
   * 首页「今日會議」提示栏专用一族（TodayMeetingCard）。
   *
   * 为什么它们逃过了全部批次（这是本族存在的唯一理由）：三个色值都写在
   * **渐变串与 border 简写串内部**（`linear-gradient(90deg, #F0F7FF 0%, #FFFFFF 100%)`、
   * `border: '1px solid #E6F0FB'`），而：
   *   - codemod 对渐变内色值故意保守跳过（怕弄坏装饰渐变）；
   *   - `inlineHex` 只统计**引号紧邻**的 hex，串内部的 hex 根本不进计数。
   * 所以门禁看不见它们，批次跑了十几轮也没人碰到——直到用户拿截图报障。
   * 渐变右端直接复用 --surface-2（浅 #FFFFFF / 深 #1F1F1F），不另建档。
   *
   * 深色档不是拍脑袋：这条栏上实际承载四种前景，**瓶颈不是文字而是「查看我的會議」
   * 那条品牌橙链接**。取 tint=(24,144,255) 压在卡片底 #1F1F1F 上合成：
   *   α=0.10 → 合成底 #1E2A35：brand #E8720C **4.760**、text-3 5.190、text-2 6.735、info 5.799
   *   α=0.14 → 合成底 #1E2F3E：brand 跌到 **4.469**（AA 不达标）
   *   α=0.20 → 合成底 #1E364C：brand 仅 **4.056**
   * 所以 0.10 是「蓝色调仍可辨」与「最弱前景达 AA」交集里偏保守的一档。
   *
   * 描边取 0.32 与 --info-border 同档，**不为了凑 3.0 而开一个与全站不一致的强边**：
   * 实测描边压在页面底 #1F1F1F 上要 α≥0.60 才到 3.211，但那会让深色下的细边比浅色下还重；
   * 深色下这条栏的区分靠「底色蓝调 + 描边」共同作用，而描边可见性本来就不套 WCAG 3.0。
   *
   * 三个值都**不进** COLOR_TO_TOKEN：它们只在渐变/简写串内部，codemod 本来就扫不到，
   * 入了反向映射只会多三个永远用不上的条目（与奖牌族、玻璃族同处理）。
   */
  'info-bar-from': { light: '#F0F7FF', dark: 'rgba(24,144,255,0.10)' },
  'info-bar-border': { light: '#E6F0FB', dark: 'rgba(64,169,255,0.32)' },
  'info-bar-divider': { light: '#DCE7F2', dark: 'rgba(64,169,255,0.24)' },
  warning: { light: '#FA8C16', dark: '#FAA03D' },
  'warning-soft': { light: '#FFF7E6', dark: 'rgba(250,140,22,0.16)' },
  danger: { light: '#FF4D4F', dark: '#FF7875' },
  'danger-soft': { light: '#FFF1F0', dark: 'rgba(255,77,79,0.16)' },
  // 深色多提半档：antd 的 #9254DE 实测仅 3.57:1，作正文不达标；#A371E7 为 4.77:1
  purple: { light: '#722ED1', dark: '#A371E7' },
  'purple-soft': { light: '#F9F0FF', dark: 'rgba(114,46,209,0.18)' },
  /*
   * 危险提示条底色（antd v4 error-1 = #FFF2F0）。
   * 为什么不直接收敛到 --danger-soft(#FFF1F0)：两者差 1 个单位，映射过去会改变浅色观感，
   * 而「浅色侧逐像素不变」是整个分批推进的前提（见 §15.2 第 5 条）。
   * 深色沿用 *-soft 一族的 16% 混合约定：合成到 surface-2(#1F1F1F) 得 #432627，
   * 实测 --danger 深色 #FF7875 上为 **5.30:1**（达标 AA）。
   * 它是收敛候选：等哪次愿意接受 1 个单位的浅色偏移，就可以并回 --danger-soft。
   */
  'danger-callout': { light: '#FFF2F0', dark: 'rgba(255,77,79,0.16)' },
  /*
   * 深橙前景（antd orange-7 = #D46B08），用在 --warning-soft 底上作提示文字。
   * 原列在 REVIEW_REQUIRED（「RDM 深度测试报告已建议收敛到 #FF4D4F/#FA8C16 体系」），
   * 本次改为**建令牌表示**而非收敛：全站 46 处均作前景、语义单一，收敛会连带改掉 46 处浅色观感。
   * 深色取 antd orange-5 #FFA940：实测在 warning-soft 深色合成底 #42301E 上为 **6.58:1**（达标 AA）。
   * ⚠ 浅色侧 #D46B08 on #FFF7E6 实测只有 **3.34:1**，低于正文 AA 4.5——这是**存量债务**，
   *   令牌化不修复它（严格等值只保证不变差），已在单测里按 3.0 下限显式登记而不是假装达标。
   */
  'warning-deep': { light: '#D46B08', dark: '#FFA940' },
  /*
   * success 的深字档——补的是**对称缺口**，不是新语义：同一个首页空状态里，
   * warning 侧那个图标圈已经用 `var(--warning-deep)`，success 侧却钉着裸值 `#389E0D`（全站 16 处）。
   * 实测：浅色 `#389E0D` on `--success-soft(#F6FFED)` = **3.3712**（图标属非文本，门槛 3:1 达标）；
   * 深色取 green-5 `#73D13D`：on 合成后的 soft 底（rgba(82,196,26,0.16) 压 #1F1F1F = #27391E）
   * = **6.4585**，on 纯卡片 = 8.5684。合成口径：tint×alpha + 背板×(1-alpha)，
   * 写反会得出“深底变亮绿”的荒谬值（本轮实踩过一次，所以公式写在这里）。
   */
  'success-deep': { light: '#389E0D', dark: '#73D13D' },
  /*
   * 蓝调 hover 底色（antd geekblue-1 = #F0F5FF），用于业务频道侧栏未选中项的 hover 反馈。
   * 不能复用 --info-soft(#E6F7FF)：两者在蓝绿通道上差 8~15 个单位，观感不同（一个是淡蓝一个是青蓝）。
   * 深色取 rgba(24,144,255,0.16)（与 *-soft 一族同约定）：合成到侧栏底 surface-3(#262626)
   * 得 #243749，实测 --text-2 深色 #B0B0B0 上为 **5.64:1**（达标 AA）。
   * 背景是 hover，所以取 0.16 与其余 soft 持平而不是更淡；更淡会弱化 hover 反馈。
   */
  'info-hover-tint': { light: '#F0F5FF', dark: 'rgba(24,144,255,0.16)' },
  /*
   * geekblue 四件套的补齐（描边阶与深前景两个邻阶）。背景那一侧就是上面的 --info-hover-tint，
   * 前景与描边以前只能钉裸值，所以同块一侧令牌化、一侧不跟主题——深色下就是「暗图标坐浅底」。
   * 实测数字均采自 scripts/lib/theme-token-map.test.mjs 里的同一套合成算法，不是心算：
   *   info-deep        浅色 #2F54EB on 白卡 5.8518 / on --info-hover-tint 5.3530；
   *                    深色 #85A5FF 合成底 #1e3143 上 5.6001（均达 AA）。
   *                    不复用 --info：#2F54EB ≠ #1890FF，收敛会改浅色观感。
   *   info-hover-border 与 --info-hover-tint 成套的 geekblue-2 描边；浅色 vs 白卡 1.2804，
   *                    深色 rgba(64,169,255,0.32) 合成后 vs 三个卡片背板 1.7843~1.8073，
   *                    与同族 --info-border 同一量级（描边是 1.2~1.9 的细线，不套 WCAG）。
   */
  'info-deep': { light: '#2F54EB', dark: '#85A5FF' },
  'info-hover-border': { light: '#D6E4FF', dark: 'rgba(64,169,255,0.32)' },
  /*
   * 这里原来准备新建 --warning-callout（淡橙提示条底 #FFF7E6）——建完去核映射表才发现
   * **它就是上面 warning-soft 的浅色值**，在 bg 段里再建一个同值令牌是错的：对象字面量
   * 重复键会被后者静默覆盖，现有断言根看不出来（本轮靠 lint 的 no-dupe-keys + 一个新增单测抓出）。
   * 站内那 66 处 #FFF7E6 没被令牌化，不是「缺令牌」，而是它们在未跑过的目录里或写在渐变串内；
   * 前者留给各自批次（会自动换成 --warning-soft），后者归「渐变那一轮」。
   */
  /*
   * 品牌橙的深前景邻阶（antd 体系里的深橙棕 #AD4E00，全站 7 处均作 color 用，语义单一）。
   * 原列 REVIEW_REQUIRED（「接近 --brand-active(#CC6200) 但不等值」），本次按建令牌处理而非收敛。
   * 深色取 --brand-hover 的 #F59432：实测 on brand-soft 合成底 #3b2b1c 为 5.9192（达 AA）；
   * 浅色 #AD4E00 on brand-soft 为 5.1245（达 AA）。
   * 两个令牌共用一个深色值不是错误：#F59432 就是「品牌色的亮档」，深色下不需要再区分两档深橙。
   */
  'brand-deep': { light: '#AD4E00', dark: '#F59432' },
  /*
   * antd v4 灰阶文字三兄弟里的两个（#333 不进来：它在站内多语义——侧边栏激活底、
   * 表头色、正文深色，按§18.5「语义单一」继续留在 REVIEW_REQUIRED）。
   * 仓内共存着两套灰阶：本令牌的 v4 实色灰（#666/#999）与 text-1..4 的 v5 中性阶
   * （#262626/#595959/#8C8C8C/#BFBFBF）。收敛到一开会改 140+86 处浅色观感，所以先按角色各建令牌。
   * 取 antd v4 自己的角色名而不占 text-N 编号：#666/#999 在亮度上分别落在 text-2/text-3 之间，
   * 叫 text-25 / text-35 只会让人以为是编号笔误。
   * 深色保持与同族单调一致（越不重要越暗）：text-body #A6A6A6 > text-hint #8A8A8A，
   * 实测 on surface-2(#1F1F1F) 分别为 6.7710 / 4.7746（均过 AA 4.5；on surface-3 分别 6.2167 / 4.3837，
   * text-hint 在沉阴底上略低 4.5，已在断言里按实际背板分别卡而不是笼统写“达 AA”）。
   * ⚠ 浅色侧 text-hint 是**存量 a11y 欠标**（不是本次引入）：#999999 on #FFF = 2.8490，
   *   143 处都是这个观感；而 text-body 的 #666666 on #FFF = 5.7418 本就达 AA。
   *   严格等值只保证不变差，所以单测对 text-hint 按存量卡下限（2.8）而不是按 4.5 假装达标。
   */
  'text-hint': { light: '#999999', dark: '#8A8A8A' },
  'text-body': { light: '#666666', dark: '#A6A6A6' },
  // 组件层
  'sidebar-bg': { light: '#1E1E1E', dark: '#1A1A1A' },
  'sidebar-item-color': { light: '#B0B0B0', dark: '#A6A6A6' },
  'sidebar-item-hover-bg': { light: '#2A2A2A', dark: '#2E2E2E' },
  'sidebar-item-active-bg': { light: '#333333', dark: '#383838' },
}

/**
 * 有意让浅深两值都与另一令牌完全相同的别名对：[令牌A, 令牌B, 为什么保留两个名字]。
 *
 * 两个令牌浅深值全同时，codemod 映射到任一侧**渲染结果完全一样**（不同于 #333333 那种
 * 「一个色值对应多个不同深色值」的真歧义），所以不阻止，但必须显式登记：
 * 未登记的重复会被单测拦下，逼作者当场决定「合并」还是「做别名」——
 * 本次 --text-inverse 重命名为 --on-brand 就是因为没先做这一步，差点新增一个与现有令牌全同值的重复项。
 */
export const INTENTIONAL_VALUE_DUPLICATES = [
  [
    'info',
    'text-brand',
    '表单/详情页标题蓝（§C.2 / §D.1 规定的 #1890ff）与语义 info 色当前浅深全同；'
    + '保留两个名字是为了让标题规范不被后来人读成「信息色」而随手改动',
  ],
  [
    'on-brand-pill',
    'on-medal',
    '两者浅深两档都是 #141414，但压着的背板完全不同：前者是品牌渐变胶囊（琥珀/亮黄），'
    + '后者是排名金属底（金银铜）。合并成一个名字会让“不翻面”的理由从两处变成一处，'
    + '后来人改品牌胶囊时很容易连带弄坏奖牌数字（§33.2 / §28.2 各自的实测依据也会失效）。',
  ],
]

/**
 * 非颜色类令牌（阴影与描边补偿）。深色下阴影几乎不可见，
 * 因此 --card-outline 在深色必须给出 1px 描边，与 --shadow-* 成对使用（方案 §4.3 规则 4）。
 */
export const NON_COLOR_TOKENS = {
  'shadow-1': { light: '0 2px 8px rgba(0,0,0,0.06)', dark: '0 2px 8px rgba(0,0,0,0.45)' },
  'shadow-2': { light: '0 2px 12px rgba(0,0,0,0.06)', dark: '0 2px 12px rgba(0,0,0,0.5)' },
  'shadow-3': { light: '0 8px 24px rgba(0,0,0,0.1)', dark: '0 8px 24px rgba(0,0,0,0.6)' },
  // 以下四档由实测频次决定收录（规范 §A.2 里「0.04~0.06」是个范围，严格等值下必须拆成两个令牌，
  // 合并不仅会改浅色观感，还会让 codemod 的「只换完全相等项」判据失效）。
  'shadow-card-soft': { light: '0 2px 8px rgba(0,0,0,0.04)', dark: '0 2px 8px rgba(0,0,0,0.4)' },
  'shadow-btn-hover': { light: '0 2px 6px rgba(0,0,0,0.1)', dark: '0 2px 6px rgba(0,0,0,0.5)' },
  'shadow-btn-active': { light: '0 4px 12px rgba(0,0,0,0.12)', dark: '0 4px 12px rgba(0,0,0,0.6)' },
  'shadow-popover': { light: '0 6px 24px rgba(0,0,0,0.12)', dark: '0 6px 24px rgba(0,0,0,0.65)' },
  'shadow-brand': { light: '0 2px 4px rgba(232,114,12,0.25)', dark: '0 2px 6px rgba(232,114,12,0.35)' },
  /*
   * 描边补偿。必须写成 **可叠加的 box-shadow 形式**，不能写成 `1px solid ...` 的 border 简写：
   * border 会改变盒模型尺寸（+2px）造成布局位移；而 `0 0 0 1px` 作为 box-shadow 第二层
   * 叠在使用处（`box-shadow: var(--shadow-1), var(--card-outline)`）不改尺寸、不改事件区。
   * 浅色取 transparent 而不是 none：none 会让整条 box-shadow 声明非法，连前面的阴影一起丢弃。
   * 深色下 `rgba(0,0,0,x)` 阴影几乎不可见，卡片层次全靠这一层描边建立（方案 §4.3 规则 4）。
   */
  'card-outline': { light: '0 0 0 1px transparent', dark: '0 0 0 1px var(--border-2)' },
  'sidebar-shadow': { light: '2px 0 12px rgba(0,0,0,0.15)', dark: '2px 0 12px rgba(0,0,0,0.55)' },
}

/**
 * 严格等值 + 语义单一的映射表，按属性上下文分三段。
 * 键为归一化后的小写 6 位十六进制（不带 #），值为目标令牌名（不带 --）。
 */
export const COLOR_TO_TOKEN = {
  /** background / background-color / fill */
  bg: {
    ffffff: 'surface-2',
    fafafa: 'surface-3',
    f5f5f5: 'surface-1',
    fafbfc: 'surface-sunken',
    fff7f0: 'brand-soft',
    f6ffed: 'success-soft',
    e6f7ff: 'info-soft',
    fff7e6: 'warning-soft',
    fff1f0: 'danger-soft',
    // antd v4 error-1：与 danger-soft 差 1 个单位，不能归并（会动浅色）
    fff2f0: 'danger-callout',
    f9f0ff: 'purple-soft',
    // geekblue-1 淡蓝 hover 底（与 info-soft #E6F7FF 不同阶）
    f0f5ff: 'info-hover-tint',
    e8720c: 'brand',
  },
  /** color / -webkit-text-fill-color */
  fg: {
    '262626': 'text-1',
    '2d3436': 'header-text',
    '595959': 'text-2',
    '8c8c8c': 'text-3',
    bfbfbf: 'text-4',
    // ⚠️ 故意**不**映射 #ffffff：白字的语义取决于「背板是什么」，而属性名给不出这个信息。
    // 橙底白字该用 --on-brand（深色会变近黑），但深色侧边栏上的白字、蓝色渐变横幅、
    // 登录页毛玻璃上的白字都必须保持白色——机械替换会让这些字在深色主题下直接看不见。
    // 实测教训：首版 codemod 把 .logo-text / .home-welcome / 12 处登录页样式全刷成了 --on-brand。
    // 白字一律走人工判定（搜 `color: #fff` 逐处看背板）。
    e8720c: 'brand',
    f59432: 'brand-hover',
    '52c41a': 'success',
    '1890ff': 'info',
    fa8c16: 'warning',
    ff4d4f: 'danger',
    '722ed1': 'purple',
    // orange-7 深橙：只进 fg。它在全站 46 处均作前景，语义单一；
    // 不进 bg/border 段，避免把同色值的背景用法误映射成文字令牌。
    d46b08: 'warning-deep',
    '389e0d': 'success-deep',
    // 两个深前景邻阶。只进 fg 段：#2F54EB 站内有 2 处描边用法、#AD4E00 全 7 处均作前景，
    // 描边位不跟着换是故意的（geekblue 描边另有 --info-hover-border 表示）。
    '2f54eb': 'info-deep',
    ad4e00: 'brand-deep',
    // v4 实色灰：只进 fg。#999 全站 153 处里有 143 处在前景位，剩下的少量在描边位，
    // 不跟着换是故意的（描边另有 border 族令牌），不能让它被映射成文字色。
    '999999': 'text-hint',
    '666666': 'text-body',
  },
  /** border* / outline / stroke */
  border: {
    d9d9d9: 'border-1',
    f0f0f0: 'border-2',
    e8eaed: 'border-3',
    ffe7d1: 'brand-border',
    e8720c: 'brand',
    '52c41a': 'success',
    '1890ff': 'info',
    fa8c16: 'warning',
    ff4d4f: 'danger',
    '722ed1': 'purple',
    // 语义色描边阶。只进 border 段：同一个色值若被用在背景位（站内确实有，如
    // #FFCCC7 1 处 bg、#FFD591 1 处 bg）就不会被换——按段映射本身就是防误伤的守卫，
    // 仓内 `brand-border`（#FFE7D1，也有 2 处 bg 用法）已经是这个口径的先例。
    ffccc7: 'danger-border',
    ffd591: 'warning-border',
    // 同族第二档（只进 border 段，同上口径：背景位的同名值不会被换）
    d9f7be: 'success-border-soft',
    ffe7ba: 'warning-border-soft',
    b7eb8f: 'success-border',
    '91d5ff': 'info-border',
    d3adf7: 'purple-border',
    // geekblue-2 描边（站内 49 处描边位，其中 OrderDetail 一家占 48）：与 --info-hover-tint 成套
    d6e4ff: 'info-hover-border',
  },
}

/**
 * 需人工判定的色值：语义接近某令牌但**不严格等值**，或**同值多语义**。
 * 这些值不计入映射，codemod 会原样保留并计入 baseline 债务。
 * 值为「为什么不能机械替换」的理由，供 --report 输出与人工分批时参考。
 */
export const REVIEW_REQUIRED = {
  fff7ed: '接近 --brand-soft(#FFF7F0) 但不等值；它是 Table.rowHoverBg，需先定义 --brand-hover-soft 令牌再映射',
  '333333': '同值多语义：侧边栏 itemActiveBg / 表头 headerColor / 页面正文深色',
  // 666666 不再列在这里：已为它建 --text-body（浅色严格等值）并归入 COLOR_TO_TOKEN.fg。
  // 原登记理由「接近 --text-2(#595959) 但不等值」仍成立，但那是**收敛**决定（会改 86 处浅色观感），
  // 与建令牌是两个不同决定（同 --warning-deep / --brand-deep 的先例）。
  e8e8e8: '接近 --border-2(#F0F0F0) 但不等值',
  eef0f3: '接近 --surface-1(#F5F5F5) 但不等值',
  f58a2e: '接近 --brand-hover(#F59432) 但不等值；且它是 bootstrap.tsx 的 antd token，不应被 codemod 触碰',
  ffb347: '品牌渐变装饰条（headerGradientShift）专用色，深色下应保留以维持品牌识别',
  // ffe7ba 已于 2026-11-06 从本清单移除：它进了 `--warning-border-soft`（浅色严格等值，
  // 所以不违反「浅色逐像素不变」）。旧理由里“29 处 vs canonical 63 处”是 #42 已推翻的
  // 重复计数（实为 38 / 51）；“同族不建第二个令牌”当时是待决而非定论，现在它开始卡住
  // 首页空状态的成对性（背景已令牌化、描边只能钉裸值），所以按阶梯走“根治”那一步。
  faad14: 'antd gold，与 --warning(#FA8C16) 并存，需确认是否收敛',
  ff7875: 'danger hover 阶；注意它同时是 --danger 的**深色值**，跨主题同值需人工确认',
  // d46b08 已不再列在这里：本次为它建了 --warning-deep（浅色严格等值）并归入 COLOR_TO_TOKEN.fg。
  // 原登记理由「RDM 深度测试报告已建议收敛到 #FF4D4F/#FA8C16 体系」仍成立，但收敛与建令牌
  // 是两个不同决定：收敛会连带改掉 46 处浅色观感，建令牌不会。保留收敛作为后续可选清理。
  // （映射表与本清单必须互斥，同一色值不得既自动替换又待人工判定）
  cf1322: 'RDM 深度测试报告已建议收敛，属既有债务',
  // ad4e00 不再列在这里：本次为它建了 --brand-deep（浅色严格等值）并归入 COLOR_TO_TOKEN.fg。
  // 原登记理由「接近 --brand-active(#CC6200) 但不等值」仍成立，但收敛会改 7 处浅色观感，
  // 所以走建令牌面而不是收敛（与 --warning-deep 同一先例）。
  f39c12: '登录页品牌橙（登录页已整体排除，见 EXCLUDE_PATHS）',
  '9254de': '紫浅色阶；注意它同时是门户 iam 场景色，受 §A.1.1 唯一真源约束',
  '73d13d': 'success hover 阶（.btn-export hover），需新增 --success-hover 令牌后再映射',
  '40a9ff': 'info hover 阶；注意它同时是 --info/--text-brand 的**深色值**',
  '001529': '侧边栏遗留深色，与 #1E1E1E 并存，需确认收敛到哪一档',
  '1e1e1e': '侧边栏底色，属组件层 --sidebar-bg，只在壳层 CSS 内替换',
  '2a2a2a': '侧边栏 hover 底，属组件层 --sidebar-item-hover-bg',
}

/**
 * codemod 与统计都必须跳过的路径（相对仓库根，前缀匹配）。
 * 门禁第 4 条断言会反向校验：这些路径内不得出现 var(--surface / var(--text 的替换痕迹。
 */
export const EXCLUDE_PATHS = [
  // 主题令牌定义处本身允许裸色值
  'frontend/packages/ui/src/styles/theme.css',
  // 主题基础设施（TOKEN_VALUES 的 TS 侧消费地：antd token 必顶传真实色值，否则派生全错）
  'frontend/packages/ui/src/theme/',
  // 登录页保持品牌固定样式（决策：视频背景 + 毛玻璃 + 霓虹文字不参与主题切换）
  'src/pages/Login/',
  'frontend/packages/ui/src/components/SliderCaptcha',
  // 门户插画本体（scene 派生明度阶与 currentColor 零件）：整文件仍排除
  'src/pages/Portal/SystemArtwork.tsx',
  /*
   * 品牌资产与设备拟真外壳（决策口径同登录页：它们代的是「不可变的实物」，不是应用壳层）。
   * 为什么不能走令牌化而是必须排除：
   *   - 两个 Logo：品牌标识不随主题重画（登录页同理）；
   *   - 手机壳：`PhoneFrame.tsx` 全文只有 10 个 #000（机身），`PhoneMockup.tsx` 是
   *     `border: 10px solid #1a1a1a` + 灰色渐变壳 + 白屏。它们的屏内是**投放创意**（给客户看的 APP 画面），
   *     而 APP 端自已是浅色——若把白屏刷成 var(--surface-2)，深色后台里会预览出一台
   *     「黑屏手机」，直接毁掉预览的真实性（这类判断已写进 §16.5.1 的 inset 逐处表）。
   * 四个文件实测 var(--surface / var(--text 痕迹均为 0（门禁第 4 条反向断言会持续守这一点），
   * 所以排除不会与已令牌化的历史批次矛盾。
   *
   * 不包进来的：`src/pages/HintPreview`、`src/pages/waterfallConfig/WaterfallPreview`、
   * `src/pages/AppPreview/*`（除 PhoneFrame）—— 这些文件**同时含页面壳层与手机外壳**，
   * 整文件排除会重犯 §17.2 第 1 条「排除过粗，连卡片底/描边/文字也无法令牌化」，
   * 它们需要的是逐处人工判背板（已登记在 §十八 待办）。
   */
  'frontend/packages/ui/src/components/BrandLogo.tsx',
  'frontend/packages/ui/src/components/GroupLogo.tsx',
  'frontend/packages/ui/src/components/PhoneMockup.tsx',
  'src/pages/AppPreview/PhoneFrame.tsx',
  // 动效参数变量，非颜色
  'frontend/packages/ui/src/components/PetMascot.css',
  // 测试内的色值断言是防漂移锚点，需人工判断
  '.test.tsx',
  '.test.ts',
  // 构建产物与本机资产
  'dist/',
  'dist-apps/',
  'node_modules/',
  '.qoder/',
]

/**
 * 选择器块级排除前缀（决策：登录页保持品牌固定样式，不参与主题切换）。
 *
 * 为什么目录级 EXCLUDE_PATHS 不够：登录页样式并不全在 `src/pages/Login/`，
 * 相当一部分住在共享的 `components.css` 里（.login-card-v2 / .login-input /
 * .corner-triangle-* / .biz-* 插画区）。只排除目录的话，codemod 会把这些段刷成令牌，
 * 用户一开深色登录页就跟着变，直接违反已拍板的决策。
 * 实测教训：首版就漏了，把登录页的 caret-color 与 border-color 一起刷掉了。
 */
export const EXCLUDE_SELECTOR_PREFIXES = [
  '.login-',
  '.corner-triangle',
  '.back-to-pwd',
  '.captcha',
  '.slider-captcha',
  '.biz-',
  '.bee-',
  '.cyber-',
  // 门户插画 scene 色板：§A.1.1 的唯一真源，被 Portal.test.tsx 色调用例钉死，不得参主题切换。
  // 以前把整个 Portal/index.css 归入目录排除，结果连卡片底/描边/文字也无法令牌化（深色下满屏白斑）；
  // 改为只排除 `[data-scene=` 块，其余段正常令牌化，并由 SCENE_COLOR_BASELINE 守住 scene 色没被误改。
  '[data-scene=',
]

/**
 * 门户 16 个 scene 色的基线（与规则 §A.1.1 表格逐字对应）。
 * 门禁用它校验 scene 色板未被 codemod 或手改动过——比「整文件排除」更细且更强：
 * 排除只能防工具改，基线能同时防住人与工具。
 */
export const SCENE_COLOR_BASELINE = {
  ads: '#E8720C',
  search: '#3D5DDD',
  merchant: '#20B5B5',
  merchantWorkbench: '#DBA333',
  finance: '#52C41A',
  eam: '#BB6C21',
  hr: '#1890FF',
  attendance: '#1C9F9F',
  oa: '#FA8C16',
  rdm: '#DD3D95',
  meeting: '#225EC0',
  doc: '#2A6913',
  ai: '#722ED1',
  iam: '#9254DE',
  platform: '#096DD9',
  translation: '#19888B',
  // 以下两项是断言 6 上线当场从代码里扫出来的：门户实际已有 18 个 scene，
  // 而规则 §A.1.1 只登了 16 个（两个新场景色带「与考勤青/HR 天蓝/组织靛蓝互斥」的注释，
  // 说明是有心添加、只是没同步文档）。补录后两边回到一致。
  payroll: '#2BCA65',
  organization: '#5E46D8',
}

/**
 * 当前规则块的选择器是否属于排除区。
 * 用子串包含而不是前缀匹配：实际选择器多为 `.login-locale-corner .ant-select-selector` 这种复合形式，
 * 只要链上任一环落在排除区，整条规则就不该被令牌化。
 */
export function isExcludedSelector(selectorText) {
  const s = String(selectorText)
  return EXCLUDE_SELECTOR_PREFIXES.some((prefix) => s.includes(prefix))
}

/**
 * 完整阴影串 → 阴影令牌名的映射表。**严格等值到整个 box-shadow 值**，不是只看颜色。
 *
 * 为什么不复用 COLOR_TO_TOKEN：同一个 `rgba(0,0,0,0.06)` 既可能配 `0 2px 8px`（卡片）
 * 也可能配 `0 2px 12px`（页头），只替色值会把不同阴影档位弄混，而令牌的深色值是按档位定的。
 * 键为去空格后的小写完整值（CSS 里 `rgba(0, 0, 0, 0.04)` 与 `rgba(0,0,0,0.04)` 是同一个）。
 *
 * 收录标准：黑色阴影只要出现就收（深色必须改它们），彩色阴影**不收**——
 * 品牌橙/红/绿阴影在深色底上色相仍在，强行建令牌只会得到一堆浅深同值的无效令牌。
 */
export const SHADOW_VALUE_TO_TOKEN = {
  '0 2px 8px rgba(0,0,0,0.06)': 'shadow-1',
  '0 2px 12px rgba(0,0,0,0.06)': 'shadow-2',
  '0 8px 24px rgba(0,0,0,0.1)': 'shadow-3',
  '0 2px 8px rgba(0,0,0,0.04)': 'shadow-card-soft',
  '0 2px 6px rgba(0,0,0,0.1)': 'shadow-btn-hover',
  '0 4px 12px rgba(0,0,0,0.12)': 'shadow-btn-active',
  '0 6px 24px rgba(0,0,0,0.12)': 'shadow-popover',
  '0 2px 4px rgba(232,114,12,0.25)': 'shadow-brand',
  '2px 0 12px rgba(0,0,0,0.15)': 'sidebar-shadow',
}

/** 归一化阴影值：空格归一 + 去空格后的比对形式 + 小写 */
export function normalizeShadowValue(value) {
  return String(value).replace(/\s+/g, ' ').replace(/,\s*/g, ',').trim().toLowerCase()
}

/** 统计范围：只扫这些根目录下的源文件 */
export const SCAN_ROOTS = ['src', 'frontend/apps', 'frontend/packages']

const HEX_RE = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g
/** TSX 只匹配引号内的色值：注释里的色值通常不带引号，天然规避误计 */
const HEX_QUOTED_RE = /['"]#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})['"]/g
const RGBA_BLACK_RE = /rgba?\(\s*0\s*,\s*0\s*,\s*0\s*[,)]/g
const VAR_RE = /var\(\s*--/g
const CSS_COMMENT_RE = /\/\*[\s\S]*?\*\//g

/**
 * 归一化十六进制色值：去 #、转小写、3 位展开为 6 位、8 位（带 alpha）截前 6 位并标记。
 * 返回 { hex, hasAlpha }；非法输入返回 null。
 *
 * 3 位必须展开：`#FFF` 与 `#ffffff` 是同一个颜色，不展开会让同一语义色
 * 在统计里裂成两项，棘轮基线随之失真。
 */
export function normalizeHex(raw) {
  const body = String(raw).replace(/^#/, '')
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/.test(body)) return null
  let hex = body.toLowerCase()
  const hasAlpha = hex.length === 8
  if (hasAlpha) hex = hex.slice(0, 6)
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  return { hex, hasAlpha }
}

/**
 * 把 CSS 属性名或 React style 键归入 bg / fg / border 三段之一。
 * 返回 null 表示该属性不承载颜色语义（如 width、transition），调用方应跳过。
 *
 * box-shadow 归 border 段：阴影里的色值语义是「描边/分隔」而非填充或文字。
 *
 * 必须同时认 CSS 连字符式与 React 驼峰式：内联 style 写的是 `backgroundColor`、
 * `boxShadow`、`borderTopColor`。只做小写匹配会让它们全部落到 null 被跳过，
 * 表现为「codemod 跑完 0 报错、但 9042 处内联色值一处未改」的静默失效。
 * vendor 前缀（WebkitTextFillColor）需先补回前导连字符再转 kebab。
 */
export function classifyProperty(prop) {
  const name = String(prop)
    .replace(/^(Webkit|Moz|Ms|O)([A-Z])/, (_, prefix, head) => `-${prefix.toLowerCase()}-${head.toLowerCase()}`)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/^[-\s]+|[-\s]+$/g, '')
    .toLowerCase()
  if (/^(background|background-color|fill)$/.test(name)) return 'bg'
  // caret-color 不纳入自动映射：它承载的是「光标前景色」，与 background 语义无关；
  // 登录页输入框的 caret 是白色，归入 bg 段会被刷成 --surface-2、深色下变成几乎看不见。
  // 与白字同理，需人工判定。（实测教训：首版把它当作背景色处理过）
  // 前导连字符已被上面的修剪步骤剥除，故此处写 webkit-… 而非 -webkit-…（写带连字符的形式永远匹配不到）
  if (/^(color|webkit-text-fill-color)$/.test(name)) return 'fg'
  if (/^(outline|stroke|box-shadow)/.test(name)) return 'border'
  // border / border-top 等简写属性可含色值；border-radius 不含，不能归入本段（否则语义失真）
  if (/^border(-(top|right|bottom|left))?$/.test(name) || /-color$/.test(name)) return 'border'
  return null
}

/**
 * 路径是否落在排除清单内。
 *
 * 规则分两类，判法必须不同：
 * - 以 `.` 开头的是**扩展名/后缀规则**（如 `.test.tsx`），只能 endsWith。
 *   用 includes 会误伤：`'a.tsx'.includes('.ts')` 为 true，会让整个前端被排除、统计恒为 0。
 * - 其余是**路径片段规则**（目录或具体文件），用 includes 以便同时匹配相对/绝对写法。
 */
export function isExcluded(relPath) {
  const p = String(relPath).replace(/\\/g, '/')
  return EXCLUDE_PATHS.some((rule) => (rule.startsWith('.') ? p.endsWith(rule) : p.includes(rule)))
}

/**
 * WCAG 2.1 相对亮度（sRGB 线性化后按 0.2126 / 0.7152 / 0.0722 加权）。
 * 只接受十六进制色值；rgba() 类半透令牌需要背景合成，不在本函数职责内（那类令牌靠人工核底色）。
 */
export function relativeLuminance(hex) {
  const normalized = normalizeHex(hex)
  if (!normalized) return null
  const n = parseInt(normalized.hex, 16)
  const channel = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** WCAG 对比度比值；任一输入非法返回 null */
export function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground)
  const b = relativeLuminance(background)
  if (a === null || b === null) return null
  const [hi, lo] = a >= b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * 统计一段源码里的裸色值与已令牌化用量。
 *
 * @param text 文件内容
 * @param kind 'css' | 'inline'（决定用哪套正则：CSS 剥注释后全量匹配，TSX 只匹配引号内）
 * @returns {{hex:number, rgbaBlack:number, tokenized:number, hits:Map<string,number>, unmapped:Map<string,number>}}
 *
 * hits 是**归一化后**全部色值的计数（含重复），调用方由它派生各类报表，
 * 不要为了统计另一类而重新跑一轮正则：全仓数千个文件 × 数十个待查色值
 * 会让门禁从秒级退化到分钟级。
 *
 * unmapped 只收「不在任何映射段、且不在 REVIEW_REQUIRED 里」的值，
 * 用于 --report 找出映射表尚未覆盖的长尾色值；REVIEW_REQUIRED 已知需人工处理，
 * 混进来会把报告淹掉。
 */
export function countBareColors(text, kind) {
  const source = kind === 'css' ? String(text).replace(CSS_COMMENT_RE, '') : String(text)
  const re = kind === 'css' ? HEX_RE : HEX_QUOTED_RE
  const hits = new Map()
  const unmapped = new Map()
  let hex = 0

  for (const match of source.matchAll(re)) {
    const normalized = normalizeHex(match[1])
    if (!normalized) continue
    hex += 1
    const { hex: value } = normalized
    hits.set(value, (hits.get(value) ?? 0) + 1)
    const known =
      Object.values(COLOR_TO_TOKEN).some((seg) => value in seg) || value in REVIEW_REQUIRED
    if (!known) unmapped.set(value, (unmapped.get(value) ?? 0) + 1)
  }

  return {
    hex,
    rgbaBlack: (source.match(RGBA_BLACK_RE) ?? []).length,
    tokenized: (source.match(VAR_RE) ?? []).length,
    hits,
    unmapped,
  }
}
