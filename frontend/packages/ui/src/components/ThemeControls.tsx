/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 顶栏主题切换控件（方案 §6.9）。
 *
 * 形态：图标按钮 + Dropdown 三选项（淺色 / 深色 / 跟隨系統），当前偏好由 selectedKeys 高亮。
 *
 * 复用 `PortalLocaleControls` 的双处挂载方式（HeaderBar 与 PortalTopBar 各引一次），
 * 而不是在门户与系统内各写一套：语言选择器当年就是因为两处各写一份，
 * 头像与偏好持久化逻辑漂过一段时间。
 *
 * 三条容易被忽略的约束：
 * 1. **flag 关闭时必须返回 null**。基础设施（CSS 令牌、Provider、antd 双套 token）可以先合主干，
 *    但入口不能提前露出——那时业务页面还有大量裸色值，切深色会看到白斑。
 * 2. **不弹 toast**。主题切换的效果是即时可见的，再弹一句「已切換為深色」只是噪声。
 * 3. **图标取解析后的主题**，不是取偏好：选「跟隨系統」时用户看到的应当是当前实际生效的那个，
 *    否则操作系统从浅色切到深色、图标却不动，用户会以为设置没生效。
 *
 * 为什么这里用 `useContext` 而不是 `useTheme()`：本控件挂在 HeaderBar / PortalTopBar 两个壳组件上，
 * 需要区分两个情形：
 *   - flag 关闭 → 返回 null，不要求 Provider（基础设施因此可以在无 Provider 的环境下安全存在）；
 *   - flag 开启但拿不到 Context → **显式抛错**，不能静默不渲染。
 * 后者若也静默返回 null，「主题切换没生效」会成一个没人发现的缺陷。
 *
 * ⚠ 历史假设已更正（2026-11-11）：本注释原先写「Portal.test.tsx 会直接渲染它们而不套 Provider」，
 * 那是 flag 关闭期的权宜口径。生产 `.env.production` 开启后，该假设让「开启态 + 整页装配」
 * 这条分支在 CI 从未被覆盖（CI 无 `.env.local` → flag 未定义 → 走 null 分支恒绿），
 * 而本地开灰度则因拿不到 Context 连带 38 例崩。现在 Portal.test.tsx 已套 ThemeProvider
 * 并显式 mock 开关，默认按生产的开启态跑；下面的防呆抛错保留不变，并由该文件的专门用例守住。
 */
import { useContext } from 'react'
import { Dropdown, type MenuProps } from 'antd'
import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { isThemeSwitchEnabled } from '@/theme/featureFlag'
import type { ThemePreference } from '@/theme'
import { ThemeContext } from '@/theme/ThemeContext'

export default function ThemeControls() {
  const { t } = useTranslation()
  const ctx = useContext(ThemeContext)

  // flag 未开启：不渲染任何入口，也不依赖 Provider 存在
  if (!isThemeSwitchEnabled()) return null
  if (!ctx) throw new Error('ThemeControls 需要 <ThemeProvider> 包裹：开关已开启却拿不到主题上下文，属装配缺失')

  const { preference, theme, setPreference } = ctx

  const labelOf = (value: ThemePreference): string => {
    if (value === 'light') return t('header.themeLight')
    if (value === 'dark') return t('header.themeDark')
    return t('header.themeSystem')
  }

  const items: MenuProps['items'] = (['light', 'dark', 'system'] as ThemePreference[]).map((value) => ({
    key: value,
    icon: value === 'light' ? <SunOutlined /> : value === 'dark' ? <MoonOutlined /> : <DesktopOutlined />,
    label: labelOf(value),
  }))

  const handleClick: MenuProps['onClick'] = ({ key }) => {
    setPreference(key as ThemePreference)
  }

  // 触发图标按解析后的主题选择；选「跟隨系統」时用显示器图标，明确表达"这不是我手动定的"
  const TriggerIcon = preference === 'system' ? DesktopOutlined : theme === 'dark' ? MoonOutlined : SunOutlined

  return (
    <Dropdown
      menu={{ items, onClick: handleClick, selectedKeys: [preference] }}
      trigger={['click']}
      placement="bottomRight"
      overlayClassName="header-theme-popover"
    >
      {/* 键盘可达：tabIndex + Enter/Space 手动触发，Dropdown 默认只处理指针事件 */}
      <span
        className="header-theme-toggle"
        role="button"
        tabIndex={0}
        aria-label={t('header.theme')}
        title={`${t('header.theme')}：${labelOf(preference)}`}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          setPreference(preference === 'light' ? 'dark' : preference === 'dark' ? 'system' : 'light')
        }}
      >
        <TriggerIcon />
      </span>
    </Dropdown>
  )
}
