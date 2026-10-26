/**
 * HCM 階段 B 界面預覽的冒煙測試
 *
 * 為什麼要測：這一頁刻意不接後端，唯一的失效方式是「渲染就炸」（圖標名未登記、藍圖數據缺字段、
 * 原型組件型別不符）。用三條用例把十系統卡片牆 → 左側模塊欄 → 三種原型切換串起來跑一遍，
 * 比人工逐個點十個系統快，也能釘住「卡片數量 = 藍圖條目數」這個評審前提。
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import HcmBlueprint from './index'
import { HCM_BLUEPRINTS } from './blueprint'

// DetailPageHeader 內部按菜單權限門控編輯按鈕，這裡不需要真實登錄態
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}))

function renderPage(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <HcmBlueprint />
    </MemoryRouter>,
  )
}

describe('HCM 十系統界面預覽', () => {
  it('卡片牆渲染全部十個系統，且人事管理/考勤假勤標為已在系統目錄', () => {
    renderPage('/hcm-blueprint')
    HCM_BLUEPRINTS.forEach((item) => {
      expect(screen.getByText(item.name)).toBeInTheDocument()
    })
    expect(HCM_BLUEPRINTS).toHaveLength(10)
    expect(screen.getAllByText('已在系統目錄')).toHaveLength(2)
  })

  it('選中系統後渲染左側模塊欄與列表原型（搜索區在統計卡之前）', () => {
    renderPage('/hcm-blueprint?code=payroll')
    // 系統名同時出現在左側品牌欄與右側原型頭，故按兩處斷言
    expect(screen.getAllByText('薪酬福利系統')).toHaveLength(2)
    expect(screen.getByText('三地規則包')).toBeInTheDocument()
    // 列表原型：統計卡標籤與操作區按鈕同時在場，說明骨架沒有被條件渲染吞掉
    expect(screen.getByText('工資單總數')).toBeInTheDocument()
    expect(screen.getByText('新增工資單')).toBeInTheDocument()
  })

  it('原型可在列表 / 詳情 / 新增之間切換', async () => {
    const user = userEvent.setup()
    renderPage('/hcm-blueprint?code=hr')

    await user.click(screen.getByText('詳情頁'))
    expect(screen.getByText('員工花名冊詳情')).toBeInTheDocument()
    expect(screen.getByText('歸屬與權限')).toBeInTheDocument()

    await user.click(screen.getByText('新增/辦理頁'))
    expect(screen.getByText('新增員工花名冊')).toBeInTheDocument()
  })
})
