/**
 * HCM 十系統藍圖數據（階段 B 界面預覽的唯一數據源）
 *
 * 為什麼單獨成文件：階段 B 只做界面骨架，十系統的編碼、四字定名、模塊分組與原型示例
 * 需要一處集中維護，後續階段 C 登記 SystemCode / sys_system / MENU_SEED 時逐條對照本文件，
 * 避免「文檔寫組織編制、庫裡寫組織與編制」兩種寫法共存（見方案第十三節 13.5 第 3 步）。
 *
 * 階段 B 約束（方案第十節 + 高效開發模式）：
 * - 純 UI：不調後端接口、不寫數據庫、不新增 i18n key（文案為繁中臨時字面量，待第二階段接 t()）。
 * - 所有示範數據寫死在本文件，頁面統一標註「預覽 · 未接通」。
 */

export type HcmSystemCode =
  | 'organization'
  | 'hr'
  | 'recruitment'
  | 'attendance'
  | 'payroll'
  | 'performance'
  | 'talent'
  | 'learning'
  | 'hr-service'
  | 'hr-analytics'

/** 系統落地狀態：existing = 已在 SystemCode / sys_system 註冊；new = 擬新增 */
export type HcmOrigin = 'existing' | 'new'

/** 內部模塊分組：一組對應側欄一個可展開目錄 */
export interface HcmModuleGroup {
  key: string
  name: string
  leaves: string[]
}

/** 原型示例：列表列 / 示範行 / 表單字段 / 詳情鍵值 */
export interface HcmDemo {
  entity: string
  columns: string[]
  rows: string[][]
  formFields: string[]
  detailPairs: Array<{ label: string; value: string }>
}

export interface HcmSystemBlueprint {
  code: HcmSystemCode
  /** 四字域名 + 系統（方案 13.5 第 3 步的顯示名規則） */
  name: string
  /** 四位域名，供門戶卡片副標題與側欄品牌使用 */
  domain: string
  origin: HcmOrigin
  /** 圖標名必須已登記在 MenuIcon 的 ICON_COMPONENTS，否則渲染空 */
  icon: string
  /**
   * 卡片主色與底色。只取自 §A.1 已登記令牌；
   * 正式註冊門戶卡片時須按 §A.1.1 補 scene 行並保證同組不重色（此處為骨架暫用）。
   */
  tone: { color: string; bg: string }
  /** 來源與拆分方式（方案第四節） */
  ownership: string
  /** 唯一寫入方的表前綴（方案 13.3） */
  tablePrefix: string
  modules: HcmModuleGroup[]
  demo: HcmDemo
}

const BLUE = { color: '#1890FF', bg: '#E6F7FF' }
const ORANGE = { color: '#E8720C', bg: '#FFF7E6' }
const GREEN = { color: '#52C41A', bg: '#F6FFED' }
const PURPLE = { color: '#722ED1', bg: '#F9F0FF' }
const AMBER = { color: '#FA8C16', bg: '#FFF7E6' }

export const HCM_BLUEPRINTS: HcmSystemBlueprint[] = [
  {
    code: 'organization',
    name: '組織編制系統',
    domain: '組織編制',
    origin: 'new',
    icon: 'ApartmentOutlined',
    tone: BLUE,
    ownership: '遷出 org-center / org-structure / position-management，升級部門樹與職位字典',
    tablePrefix: 'org_',
    modules: [
      { key: 'legal', name: '法人與地點', leaves: ['法人主體', '工作地點', '成本中心映射'] },
      { key: 'org', name: '組織結構', leaves: ['管理組織', '業務單元', '組織版本與調整模擬'] },
      { key: 'job', name: '職位體系', leaves: ['職務族', '職位職級', '職位字典'] },
      { key: 'position', name: '崗位與編制', leaves: ['崗位實例', '編制預算', '崗位佔用'] },
    ],
    demo: {
      entity: '崗位實例',
      columns: ['崗位編碼', '崗位名稱', '所屬組織', '職級', '編制數', '在崗數'],
      rows: [
        ['POS-CN-0001', '薪酬核算專員', '人力資源部', 'P5', '2', '2'],
        ['POS-CN-0002', '招聘顧問', '人力資源部', 'P4', '3', '1'],
        ['POS-HK-0001', 'HR Officer', '香港人事部', 'P3', '1', '1'],
      ],
      formFields: ['崗位編碼', '崗位名稱', '所屬法人', '所屬組織', '職位職級', '編制數'],
      detailPairs: [
        { label: '崗位編碼', value: 'POS-CN-0001' },
        { label: '崗位名稱', value: '薪酬核算專員' },
        { label: '所屬法人', value: '閃蜂科技（深圳）有限公司' },
        { label: '所屬組織', value: '人力資源部 / 薪酬組' },
        { label: '職位職級', value: '薪酬核算 / P5' },
        { label: '編制數', value: '2（在崗 2，可用 0）' },
      ],
    },
  },
  {
    code: 'hr',
    name: '人事管理系統',
    domain: '人事管理',
    origin: 'existing',
    icon: 'TeamOutlined',
    tone: ORANGE,
    ownership: '重構現有 hr：員工、生命週期、合同、證明與人事字典，不再包攬全部 HCM',
    tablePrefix: 'hr_ / emp_',
    modules: [
      { key: 'roster', name: '花名冊與檔案', leaves: ['員工花名冊', '員工檔案', '擴展檔案'] },
      { key: 'employment', name: '僱傭與任職', leaves: ['僱傭期間', '任職記錄', '兼崗與跨法人'] },
      { key: 'lifecycle', name: '入轉調離返聘', leaves: ['入職辦理', '轉正', '調動', '離職', '返聘'] },
      { key: 'contract', name: '合同與證明', leaves: ['合同台賬', '證明材料', '到期預警'] },
      { key: 'relation', name: '員工關係', leaves: ['獎懲記錄', '工作許可與簽證', '人事事件'] },
    ],
    demo: {
      entity: '員工花名冊',
      columns: ['工號', '姓名', '僱主法人', '部門', '職位', '僱傭類型', '狀態'],
      rows: [
        ['MF00032', '陳嘉明', '閃蜂科技（深圳）', '人力資源部', '薪酬核算專員', '全職', '在職'],
        ['MF00033', '李慧敏', '閃蜂科技（香港）', '香港人事部', 'HR Officer', '全職', '試用期'],
        ['MF00034', '黃志強', '閃蜂科技（澳門）', '澳門營運部', '店務主管', '全職', '在職'],
      ],
      formFields: ['工號', '姓名', '僱主法人', '法域', '一級部門', '主任職崗位'],
      detailPairs: [
        { label: '工號', value: 'MF00032' },
        { label: '姓名', value: '陳嘉明' },
        { label: '僱主法人', value: '閃蜂科技（深圳）有限公司' },
        { label: '僱傭類型', value: '全職 · 無固定期限' },
        { label: '入職日期', value: '2025-04-01' },
        { label: '帳號映射', value: '已有 IAM 帳號（sys_user.id 10032）' },
      ],
    },
  },
  {
    code: 'recruitment',
    name: '招聘管理系統',
    domain: '招聘管理',
    origin: 'new',
    icon: 'UserAddOutlined',
    tone: PURPLE,
    ownership: '新建 ATS；候選人不等于員工，Offer 接受後進入待入職交接',
    tablePrefix: 'recruit_',
    modules: [
      { key: 'demand', name: '需求與職位', leaves: ['招聘需求', '編制佔用', '職位發布', '招聘渠道'] },
      { key: 'candidate', name: '候選人', leaves: ['候選人庫', '簡歷管理', '內推', '人才庫'] },
      { key: 'interview', name: '面試與錄用', leaves: ['面試評價', '錄用審批', 'Offer 管理', '背景核驗'] },
      { key: 'analysis', name: '招聘分析', leaves: ['漏斗分析', '渠道效果', '到崗週期'] },
    ],
    demo: {
      entity: '候選人',
      columns: ['候選人編號', '姓名', '應聘職位', '渠道', '面試階段', '負責人'],
      rows: [
        ['RC-2026-0182', '張文軒', '薪酬核算專員', '內推', '複試', '李慧敏'],
        ['RC-2026-0183', '何静怡', 'HR Officer', '獵頭', 'Offer 審批', '李慧敏'],
        ['RC-2026-0184', '周家豪', '店務主管', '招聘網站', '初試', '黃志強'],
      ],
      formFields: ['候選人編號', '姓名', '應聘職位', '來源渠道', '期望薪資', '負責人'],
      detailPairs: [
        { label: '候選人編號', value: 'RC-2026-0182' },
        { label: '姓名', value: '張文軒' },
        { label: '應聘職位', value: '薪酬核算專員（POS-CN-0001）' },
        { label: '來源渠道', value: '員工內推 · 陳嘉明' },
        { label: '當前階段', value: '複試（待評價）' },
        { label: '關聯需求', value: 'REQ-RC-2026-0042' },
      ],
    },
  },
  {
    code: 'attendance',
    name: '考勤假勤系統',
    domain: '考勤假勤',
    origin: 'existing',
    icon: 'ClockCircleOutlined',
    tone: GREEN,
    ownership: '保持獨立，改造多法域及交數模型；請假唯一帳本留在考勤',
    tablePrefix: 'att_',
    modules: [
      { key: 'base', name: '規則基礎', leaves: ['考勤組', '班次', '節假日', '排班'] },
      { key: 'punch', name: '打卡與異常', leaves: ['打卡記錄', '補卡申請', '異常處理', '出差外勤'] },
      { key: 'leave', name: '假期', leaves: ['請假申請', '假期額度', '加班申請'] },
      { key: 'summary', name: '匯總與交數', leaves: ['日匯總', '週期匯總', '凍結批次', '交數版本'] },
    ],
    demo: {
      entity: '考勤日匯總',
      columns: ['工號', '姓名', '考勤日期', '班次', '應出勤', '實際', '異常'],
      rows: [
        ['MF00032', '陳嘉明', '2026-10-22', '深圳常日班', '8.0', '8.0', '無'],
        ['MF00033', '李慧敏', '2026-10-22', '香港常日班', '8.0', '7.5', '遲到 10 分'],
        ['MF00034', '黃志強', '2026-10-22', '澳門店班', '9.0', '9.0', '無'],
      ],
      formFields: ['工號', '考勤日期', '班次', '補卡類型', '補卡時間', '原因'],
      detailPairs: [
        { label: '工號', value: 'MF00032' },
        { label: '姓名', value: '陳嘉明' },
        { label: '計薪週期', value: '2026-10（未凍結）' },
        { label: '出勤天數', value: '18.0 / 21.0' },
        { label: '請假扣減', value: '年假 1.0 天' },
        { label: '交數狀態', value: '未交數（薪酬系統待接收）' },
      ],
    },
  },
  {
    code: 'payroll',
    name: '薪酬福利系統',
    domain: '薪酬福利',
    origin: 'new',
    icon: 'MoneyCollectOutlined',
    tone: AMBER,
    ownership: '遷出員工詳情的收入/扣除/銀行資料，新建核算引擎與三地規則包',
    tablePrefix: 'payroll_',
    modules: [
      { key: 'structure', name: '薪酬結構', leaves: ['薪資項目', '定調薪', '獎金激勵'] },
      { key: 'benefit', name: '福利與稅務', leaves: ['福利計劃', '參保管理', '稅務配置'] },
      { key: 'calc', name: '核算', leaves: ['計薪週期', '規則與試算', '核算批次', '複核與鎖定'] },
      { key: 'payslip', name: '工資單與發放', leaves: ['工資單', '支付與申報', '回執與對賬'] },
      { key: 'rule', name: '三地規則包', leaves: ['內地規則', '香港規則', '澳門規則', '規則發布記錄'] },
    ],
    demo: {
      entity: '工資單',
      columns: ['工資單號', '姓名', '計薪週期', '幣種', '應發', '實發', '狀態'],
      rows: [
        ['PS-202610-0032', '陳嘉明', '2026-10', 'CNY', '18,500.00', '15,240.60', '已鎖定'],
        ['PS-202610-0033', '李慧敏', '2026-10', 'HKD', '32,000.00', '29,650.00', '待複核'],
        ['PS-202610-0034', '黃志強', '2026-10', 'MOP', '21,000.00', '20,180.00', '試算'],
      ],
      formFields: ['工資單號', '工號', '計薪週期', '幣種', '規則包版本', '備註'],
      detailPairs: [
        { label: '工資單號', value: 'PS-202610-0032' },
        { label: '姓名', value: '陳嘉明' },
        { label: '計薪週期', value: '2026-10-01 ~ 2026-10-31' },
        { label: '規則包', value: 'CN-2026-v3（已批准）' },
        { label: '應發 / 實發', value: 'CNY 18,500.00 / CNY 15,240.60' },
        { label: '發放狀態', value: '已鎖定，待支付通道回執' },
      ],
    },
  },
  {
    code: 'performance',
    name: '績效管理系統',
    domain: '績效管理',
    origin: 'new',
    icon: 'TrophyOutlined',
    tone: BLUE,
    ownership: '遷出 perf-center / perf-report-center 與 hr-perf-*；執行與台賬同域，內部權限分開',
    tablePrefix: 'perf_',
    modules: [
      { key: 'goal', name: '目標與模板', leaves: ['目標指標', '考核模板', '週期設置'] },
      { key: 'plan', name: '考核執行', leaves: ['考核計劃', '自評', '經理評價', '多方評價'] },
      { key: 'calibrate', name: '校準與確認', leaves: ['校準會', '結果確認', '申訴處理', '績效改進'] },
      { key: 'apply', name: '結果應用', leaves: ['結果台賬', '獎金關聯', '人才下游'] },
    ],
    demo: {
      entity: '考核計劃',
      columns: ['計劃編號', '週期', '考核模板', '參與人數', '自評進度', '狀態'],
      rows: [
        ['PF-2026-Q4-01', '2026 Q4', '職能崗通用模板', '128', '86%', '進行中'],
        ['PF-2026-Q4-02', '2026 Q4', '門店營運模板', '64', '72%', '進行中'],
        ['PF-2026-Q3-01', '2026 Q3', '職能崗通用模板', '120', '100%', '已確認'],
      ],
      formFields: ['計劃編號', '考核週期', '考核模板', '適用範圍', '自評截止', '負責人'],
      detailPairs: [
        { label: '計劃編號', value: 'PF-2026-Q4-01' },
        { label: '考核週期', value: '2026-10-01 ~ 2026-12-31' },
        { label: '考核模板', value: '職能崗通用模板（v2）' },
        { label: '適用範圍', value: '集團職能部門（不含門店）' },
        { label: '參與人數', value: '128（已提交 110）' },
        { label: '狀態', value: '進行中 · 待經理評價' },
      ],
    },
  },
  {
    code: 'talent',
    name: '人才發展系統',
    domain: '人才發展',
    origin: 'new',
    icon: 'BulbOutlined',
    tone: PURPLE,
    ownership: '新建；消費績效與學習事實，不另維護評分或培訓成績',
    tablePrefix: 'talent_',
    modules: [
      { key: 'model', name: '能力模型', leaves: ['能力技能庫', '職位能力要求'] },
      { key: 'review', name: '人才盤點', leaves: ['盤點批次', '九宮格', '關鍵崗位', '繼任梯隊'] },
      { key: 'develop', name: '發展', leaves: ['個人發展計劃', '晉升評審', '內部流動'] },
    ],
    demo: {
      entity: '盤點批次',
      columns: ['批次編號', '盤點範圍', '參與人數', '已評定', '校準狀態', '狀態'],
      rows: [
        ['TL-2026-02', '集團職能 + 門店主管', '192', '160', '待校準', '進行中'],
        ['TL-2026-01', '集團職能', '128', '128', '已校準', '已封存'],
        ['TL-2025-02', '全集團', '176', '176', '已校準', '已封存'],
      ],
      formFields: ['批次編號', '盤點範圍', '評定維度', '校準會議日期', '負責人'],
      detailPairs: [
        { label: '批次編號', value: 'TL-2026-02' },
        { label: '盤點範圍', value: '集團職能 + 門店主管' },
        { label: '參與人數', value: '192（已評定 160）' },
        { label: '九宮格分佈', value: '高潛 24 · 核心 96 · 待發展 40' },
        { label: '繼任覆蓋', value: '關鍵崗位 12，已備 1 人以上者 7' },
        { label: '狀態', value: '進行中 · 待校準' },
      ],
    },
  },
  {
    code: 'learning',
    name: '學習培訓系統',
    domain: '學習培訓',
    origin: 'new',
    icon: 'ReadOutlined',
    tone: GREEN,
    ownership: '新建 LMS，複用文檔內容引用；「打開文檔」不代表課程通過',
    tablePrefix: 'learn_',
    modules: [
      { key: 'content', name: '內容與講師', leaves: ['課程內容', '講師管理', '課程分類'] },
      { key: 'plan', name: '培訓計劃', leaves: ['培訓需求', '培訓計劃', '報名與班級'] },
      { key: 'exam', name: '考試與證書', leaves: ['簽到', '考試', '證書管理', '合規必修'] },
      { key: 'budget', name: '預算與效果', leaves: ['培訓預算', '效果評估'] },
    ],
    demo: {
      entity: '培訓計劃',
      columns: ['計劃編號', '課程名稱', '培訓形式', '開班日期', '報名人數', '狀態'],
      rows: [
        ['LN-2026-041', '新員工合規必修', '線上', '2026-10-28', '36 / 40', '報名中'],
        ['LN-2026-042', '薪酬核算實務', '線下', '2026-11-05', '18 / 20', '報名中'],
        ['LN-2026-038', '門店服務標準', '線上+線下', '2026-09-18', '52 / 60', '已結業'],
      ],
      formFields: ['計劃編號', '課程名稱', '培訓形式', '開班日期', '計劃人數', '講師'],
      detailPairs: [
        { label: '計劃編號', value: 'LN-2026-041' },
        { label: '課程名稱', value: '新員工合規必修' },
        { label: '培訓形式', value: '線上 · 2 學時' },
        { label: '開班日期', value: '2026-10-28 ~ 2026-10-31' },
        { label: '報名 / 計劃', value: '36 / 40' },
        { label: '結業條件', value: '看完 4 節 + 考試 ≥ 80 分' },
      ],
    },
  },
  {
    code: 'hr-service',
    name: '員工服務系統',
    domain: '員工服務',
    origin: 'new',
    // 圖標名必須已登記在 MenuIcon.ICON_COMPONENTS（CustomerServiceOutlined 未登記，退回 MessageOutlined）
    icon: 'MessageOutlined',
    tone: ORANGE,
    ownership: '遷出 ess-center / ess-*，作為跨域服務入口，不複製賬本或審批引擎',
    tablePrefix: 'hrsvc_',
    modules: [
      { key: 'self', name: '員工工作台', leaves: ['我的資料', '我的工資單', '我的假勤', '我的績效', '我的學習'] },
      { key: 'manager', name: '經理工作台', leaves: ['團隊事務', '團隊考勤', '待辦審批'] },
      { key: 'support', name: '服務支撐', leaves: ['人事諮詢工單', '知識導航', '滿意度調查'] },
    ],
    demo: {
      entity: '人事諮詢工單',
      columns: ['工單號', '提交人', '問題分類', '受理人', '提交時間', '狀態'],
      rows: [
        ['SV-2026-0311', '陳嘉明', '工資單疑問', '李慧敏', '2026-10-22 10:12', '處理中'],
        ['SV-2026-0312', '黃志強', '假期額度', 'HR 共享服務', '2026-10-22 14:40', '待受理'],
        ['SV-2026-0308', '張文軒', '入職材料', 'HR 共享服務', '2026-10-20 09:05', '已關閉'],
      ],
      formFields: ['問題分類', '涉及週期', '問題描述', '期望回覆方式', '附件'],
      detailPairs: [
        { label: '工單號', value: 'SV-2026-0311' },
        { label: '提交人', value: '陳嘉明（MF00032）' },
        { label: '問題分類', value: '工資單疑問' },
        { label: '關聯工資單', value: 'PS-202610-0032' },
        { label: '受理人', value: '李慧敏' },
        { label: '狀態', value: '處理中' },
      ],
    },
  },
  {
    code: 'hr-analytics',
    name: '人力分析系統',
    domain: '人力分析',
    origin: 'new',
    icon: 'BarChartOutlined',
    tone: PURPLE,
    ownership: '新建受控分析讀模型，事實來自各域，不反寫業務主表',
    tablePrefix: 'stat_',
    modules: [
      { key: 'headcount', name: '人數與編制', leaves: ['人數與 FTE', '編制執行', '人員結構'] },
      { key: 'cost', name: '成本', leaves: ['人力成本', '預算對比', '成本分攤'] },
      { key: 'flow', name: '流動與招聘', leaves: ['招聘漏斗', '流失分析', '到崗週期'] },
      { key: 'talent', name: '人才與學習', leaves: ['績效分佈', '人才學習分析', '繼任覆蓋'] },
      { key: 'govern', name: '口徑治理', leaves: ['指標口徑', '情景分析', '小樣本保護'] },
    ],
    demo: {
      entity: '指標口徑',
      columns: ['指標編碼', '指標名稱', '來源域', '統計口徑', '更新頻率', '狀態'],
      rows: [
        ['HC-001', '期末在職人數', 'organization + hr', '按 Person 去重', '每日', '啟用'],
        ['HC-014', 'FTE', 'organization', '按 Assignment 加總', '每日', '啟用'],
        ['CT-002', '人力成本', 'payroll', '按計薪批次鎖定值', '每月', '啟用'],
      ],
      formFields: ['指標編碼', '指標名稱', '來源域', '統計口徑', '更新頻率', '負責人'],
      detailPairs: [
        { label: '指標編碼', value: 'HC-001' },
        { label: '指標名稱', value: '期末在職人數' },
        { label: '來源域', value: 'organization + hr' },
        { label: '統計口徑', value: '按 Person 去重，剔除停用帳號的服務帳號' },
        { label: '更新頻率', value: '每日 02:00 重算' },
        { label: '保護規則', value: '小於 5 人的分組不下鑽' },
      ],
    },
  },
]

/** 依編碼取藍圖；未登記編碼返回 undefined，由頁面顯示兜底而不是拋錯 */
export function findBlueprint(code: string | null | undefined): HcmSystemBlueprint | undefined {
  if (!code) return undefined
  return HCM_BLUEPRINTS.find((item) => item.code === code)
}

/**
 * 階段 B 待確認事項：與方案正文存在多種可選寫法、必須由業務/架構拍板的點。
 * 為什麼放在頁面而不是只寫在文檔：骨架評審時逐條過，避免口頭確認後無據可查。
 */
export const HCM_OPEN_QUESTIONS: Array<{ topic: string; detail: string; decision: string }> = [
  {
    topic: '系統定名',
    detail: '方案第四節寫「組織與編制」（五字），13.5 要求收斂為四字域名 + 「系統」',
    decision: '暫定「組織編制系統」，需產品負責人書面確認後同步 inventory.md 與 i18n',
  },
  {
    topic: '考勤歸屬',
    detail: '考勤假勤已獨立成系統，方案要求請假帳本留在考勤、薪酬只讀結果',
    decision: '本骨架按此渲染；若改為「假勤留在人事」，員工服務與薪酬取數路徑需重排',
  },
  {
    topic: '員工服務入口',
    detail: '員工端與經理端是同一個系統的兩個工作台，還是兩個獨立入口',
    decision: '暫按同系統雙工作台（員工 / 經理），權限靠字段與範圍區分',
  },
  {
    topic: '人事管理範圍',
    detail: '合同、證明、獎懲提升為獨立台賬後，員工詳情是否仍保留維護入口',
    decision: '暫定員工詳情只讀聚合 + 跳轉台賬，不再作為唯一維護入口',
  },
  {
    topic: '門戶卡片色',
    detail: '十系統需在門戶卡片牆並排展示，方案要求同組互斥且不得近黑',
    decision: '骨架暫用現有令牌色，正式註冊時按 §A.1.1 補 10 個 scene 行並跑色調回歸用例',
  },
]
