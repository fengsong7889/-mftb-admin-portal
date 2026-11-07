# 多语言（i18n）链路审计与修复 · 2026-11

> 触发：用户切换简体中文后，大量界面字段名变成英文兜底；并要求核对 6 种可选语言的翻译完成度
> 与各业务系统是否都对接了「翻译管理系统」。
> 本文是该次排查与修复的**唯一事实记录**（实测数据 + 判定口径 + 剩余项），后续复测前先读本文。

---

## 一、结论（一句话版）

- **不是「没去取翻译」**：前端拉取数据库语言包的链路一直是通的。
- **是「翻译库里根本没有那批词条」+「简体中文没有静态兜底包」**，两者叠加：
  库里只覆盖 8504/16540 个 key（51.4%），缺的那一半按 `fallbackLng='en'` 直接回退英文。
- 根因是后端启动同步器读的是一份**手工维护、已腐化一半**的前端语言包副本，
  而且这个环节**没有任何门禁**：`npm run check:i18n` 全绿、「翻译统计」页六语显示 100%。

修复后实测（`npm run i18n:report`，口径 = 静态包 ∪ `sys_translation`）：

| 语言 | 修复前 | 修复后 |
|------|--------|--------|
| zh-TW | 100.0% | 100.0% |
| **zh-CN** | **51.4%** | **100.0%** |
| en | 100.0%（3 个空量词） | 100.0%（同） |
| ja | 56.8% | 60.4%（机翻逐轮补空中，受额度限制） |
| ko | 56.8% | 60.4%（同上） |
| ru | 56.7% | 60.3%（同上） |

全量验证结果（L2，分两批）：

| 验证项 | 第一批（简中主链路） | 第二批（完成率口径 + 免登兜底） |
|---|---|---|
| 后端 `mvn test` | 2896 例全绿 | **2923 例全绿**（Failures 0 / Errors 0 / Skipped 23，BUILD SUCCESS） |
| 前端 `test:run` | 193 文件 / 1989 例 | **204 文件 / 2148 例** |
| 门禁 + `lint` + `typecheck` | 14 道全绿 / 0 error / 通过 | 全绿 / 0 error / 通过 |

全量跑当场发现两处真失败（都是第二批自己引入）：`check:registry` 缺 `I18n*` 归属、
`check:theme-tokens` inlineHex +6（新加的 6 个内联色字面量），均已修正而非上调基线。
后端 `/api/health/ready` 当前状态 UP（92 个结构契约全部就绪）。

浏览器端实测（本地 `http://localhost:3000/#/login`，**全程未登录**——就是在“拿不到数据库语言包”的场景下验证）：
- `zh-CN`：主标题 `您好！欢迎登录MFTB集团门户`、`登录工号`/`请输入工号`、`登录密码`/`请输入密码`、
  `登 录` 按钮、语言框 `🇨🇳 简体中文`、国家框 `🇺🇸 美国`——全部简体，**不再有「整页英文」**。
- `ja` / `ko`：主标题、工号与密码 label/placeholder、登录按钮、国家与语言框均为目标语言，
  **无英文兜底**；控制台无 `i18next::` / missing resource 报错（§五 第 6 项已关闭）。
- 仅剩 §五 第 8 项的长尾国名繁体，与 `MANUAL_TEXTS` 两条手写兜底待业务复核。

---

## 二、链路与根因

### 2.1 前端取翻译的链路（本来就正常）

| 环节 | 位置 |
|------|------|
| 注入远程加载器（i18n 包必须保持叶子，不能反向依赖 api 层） | `src/bootstrap.tsx` → `registerRemoteBundleLoader` |
| 登录态挂载时按持久化语言拉一次 | `src/App.tsx` → `ensureLanguageBundle(getSavedLanguage())` |
| 顶栏切语言时拉一次 | `frontend/packages/ui/src/components/PortalTopBar.tsx` → `handleLanguageChange` |
| 后端返回平铺 `{fieldKey: 译文}`，已应用回退链 | `TranslationServiceImpl#bundle` |
| 合并进 i18next（`overwrite=false`，静态优先） | `injectTranslationBundle` |

### 2.2 真正断掉的两处

**① `zh-CN` 没有静态语言包**

`frontend/packages/i18n/src/i18n/locales/` 下只有 `zh-TW / en / ja / ko / ru`，唯独没有 `zh-CN`；
`i18n.init` 的 `resources` 也没注册它，而 `fallbackLng = 'en'`（`en.json` 是 855KB 全量英文包）。
后果：

- 简体中文的**每一个字**只能来自数据库语言包；库里缺 → 英文。
- `/translations/bundle` 需要登录，所以**简体中文登录页整页英文**。
- 繁中/英文有完整静态包，**看不出这个缺陷**——这就是为什么它能长期存活。

**② 后端读的语言包镜像腐化了一半**

`TranslationDataInitializer.syncI18nKeys()` 读的是 `classpath:i18n/zh-TW.json`，
即 `backend/modules/legacy/src/main/resources/i18n/zh-TW.json` —— 一份靠**人手拷贝**的前端语言包副本：

| | key 数 |
|---|---|
| 前端真源 `frontend/packages/i18n/src/i18n/locales/zh-TW.json` | 16044 |
| 后端镜像（修复前） | 8007 |
| 因此永远同步不到库的 key | **8048** |

仓库里没有任何脚本或 CI 步骤做这份拷贝。除数量之外还有质量问题：

- 镜像与真源**同 key 但文案不同 167 条**（有些甚至是简体值，例如
  `aiQuotaAuth.selectDeptRequired` 镜像写的是「请选择至少一个部门」）。
- 镜像里有 **11 个前端已删除的 key**（`asset.repairByHp/Dell/Lenovo/Apple/Self` 等）。
- 旧同步器**只插不更**，所以这 167 条在库里永久停在旧值；`asset.colLocationName`
  在库里还是旧名「存放位置」，前端早已改成「存放倉庫」。

### 2.3 为什么没有任何环节报警

| 环节 | 为什么没拦住 |
|------|-------------|
| 「翻译统计」页 / 语言管理页完成率 | 分母是 `sys_translation` 里**已有**的记录（8504 条），没入库的 key 根本不在分母里 → 六语全部显示 ~100% |
| `npm run check:i18n` | `REQUIRED_LANGS = ['zh-TW','en']`，**zh-CN 不在校验语言里**；且只查「引用能否解析」，静态包能解析就绿，不查「库是否收录」 |
| `resolves()` | 只判「键在不在」，**空串当已翻译** → `en.json` 里 8 个空量词（含 `rdm.daily.unitItem/unitProject/unitTimes`）永远查不出来 |
| 后端同步器 | 旧实现整体包在 `try/catch` 里只 `log.warn`，镜像缺文件也是 warn 后继续，不阻断就绪 |

实测对照：门禁全绿（引用 12807 条 / 无法解析 0 条）的同一棵树，简体中文实际只有 51.4% 能解析。

---

## 三、已完成的修复

### 3.1 P0：让简体中文立刻不再掉英文

| # | 变更 | 位置 |
|---|------|------|
| 1 | 前端语言包 → 后端镜像的一条命令 + 一道门禁 | `scripts/sync-i18n-to-backend.mjs`；`npm run i18n:sync-backend` / `check:i18n-mirror` |
| 2 | 启动同步器改为读 `{zh-TW,en,zh-CN}.json` 三份镜像，**新字段一次写齐三语**（不再只塞繁中） | `TranslationDataInitializer#syncI18nKeys` |
| 3 | 「只插不更」→ **漂移回填**：`source='sync'` 且非 `menu.*` 的字段按镜像修正；其余只补空坑 | 同上，判定拆成纯函数 `planMirrorSync` |
| 4 | 新增静态简体中文包（ICU4J 繁→简，与后端同算法）并注册进 i18next | `scripts/gen-zh-cn-locale.mjs` → `locales/zh-CN.json`；`frontend/packages/i18n/src/i18n/index.ts` |
| 5 | `zh-cn-backfill` 从一次性版本门改为**每次启动补空**（幂等、不联网、只填空缺） | `TranslationDataInitializer#run` |
| 6 | 写入分批（500/批）：单批 8040 行一条 multi-value INSERT 有撞 `max_allowed_packet` 风险，逐条 UPDATE 又要 6000+ 次往返卡在启动期 | 同上 |

### 3.2 人工修订保护（实施中新发现的风险，已闭环）

第一轮全量同步跑了之后实测：**6384 条既有记录的 `en` 值被镜像改写**。
逐条回查改写前的 `updated_by`，分布是 `backfill-zh-CN` 6156 / `machine(null)` 422 / `machine(管理员)` 144，
**没有任何一条是人工在工作台里定的译名**，且新值都来自前端 `en.json`（质量更高：`Your brand → Brand`、`freeze → Frozen`），
所以这次改写是收益而不是损失。但 `updated_by` 不区分「人工」与「机翻」这件事本身是隐患，
因此补了一层判定：`isHumanEdited()` —— `updated_by` 不带 `machine(` / `backfill-zh-CN` / `i18n-sync` 前缀的
非空人名即视为人工修订，镜像**只补空、不回盖**（否则「工台里改了、下次启动被镜像打回去」会比不同步更难排查）。
库里现存的真实样本：`menu.home`（`updated_by='冯松'`）。

另加一层**防丢译保护**：`translations_json` 非空但解不开的行，`readTranslations` 返回 `null` 而不是空 Map，
同步与机翻均**整行跳过**并记警告。当成空 Map 继续同步，会让已存在（只是格式脏）的 ja/ko/ru 被当空缺盖掉，
而原始内容不可追回——这比不同步严重得多。当前开发库实测该类行数：0（属于防御性保护）。

### 3.3 P1：让门禁能拦住复发

| 门禁 | 内容 |
|------|------|
| `check:i18n-zhcn` | `zh-CN.json` 必须存在、键集与 `zh-TW.json` 齐备、无陈旧键、繁中有值处简中不得为空 |
| `check:i18n-mirror` | 后端镜像与前端真源**逐字节一致**，漂移时打印缺/多/改写三类明细 |
| `check:i18n` 新增 | ① 空串不再算「已翻译」（`resolve_state` 返回 `None/blank/ok`，硬缺失与空值分开计数）；② **翻译库收录率棘轮** `_dbGapKeys`：前端静态包的每个 key 都必须在 `sys_translation` 快照里 |
| `backend-docker.yml` | 断言 `i18n/{zh-TW,en,zh-CN}.json` 已打进业务模块 JAR（缺文件旧实现只 warn 不失败） |
| `deploy.yml` | 依次执行 `check:i18n` → `check:i18n-fallback` → `check:i18n-zhcn` → `check:i18n-mirror` |

基线现值：`_refsMissing=0`、`_refsBlank=0`、`_dbGapKeys=0`（只降不升）。

### 3.4 P2：其它已修的缺陷

| 缺陷 | 修复 |
|------|------|
| 登录页与顶栏在简体中文下的语言/国家下拉：`SYS_LANG_ORDER` 只有 5 语，简中界面下 `indexOf('zh-CN') = -1` → 国家退成英文名（`United States`）、语言退成母语名 | `sysLangIndex()` 把 zh-CN 映射到中文列，并对**已注册的 6 语 + 5 国**给出简体名（浏览器实测：国家框 `🇺🇸 美国`、语言框 `🇨🇳 简体中文`，下拉前 6 项为繁体中文/简体中文/英文/日文/韩文/俄文）。长尾 55 国见 §五 第 8 项 |
| `ensureLanguageBundle` 只在抛异常时回滚去重标记，而 `fetchTranslationBundle` 在后端不可用时是**返回 null** → 后端重启窗口内切一次语言，本次会话永不重试 | 返回 null 也复位标志（`frontend/packages/i18n/src/i18n/index.ts`） |
| 机翻只喂「本次新增」的 id，MyMemory 匿名日额度耗尽后剩下的缺口无人接手（实测同步后 ja/ko/ru 停在 51.8% 且一条机翻日志都没有） | 改为**全表缺口驱动**：`selectIdsWithTranslationGap()` 按 id 升序取前 N 条，每轮启动从上次断点继续；新增开关 `TRANSLATION_AUTO_MT_ENABLED` 与上限 `TRANSLATION_AUTO_MT_BATCH_LIMIT`（默认 2000） |
| 没有「六语真实完成度」的查询入口 | `npm run i18n:report`（静态包 ∪ 库，附缺失最多的命名空间） |
| **完成率分母本身是假的**（后端 coverage 与两个页面各自拿 `sys_translation` 记录数当分母） | 见 §3.7：分母改成「镜像 key ∪ 库字段」，并新增免登界面静态兜底门禁 |
| 登录页语言下拉铺全 60 种 `LANG_INFO`，其中 54 种是**死选项** | 收敛为 `SUPPORTED_LANGUAGES`（6 种）。`applyLoginLanguage` 本来只对 SUPPORTED_LANGUAGES 里的代码调 `changeAppLanguage`，所以选泰文/法文时：下拉选中了、`login_language` 也写了，界面却纹丝不动，登录后还是原语言——用户只能当成「切换坏了」。同时历史脏值（`login_language='th'`）不再被恢复 |

> 登录页的语言下拉不用 `sys_language` 真值，是因为 `/translations/languages` 不在白名单（需登录），
> 登录前拿不到；而门户/系统内的 `PortalLocaleControls` 仍按后端已启用语言渲染，动态注册语言在那边依旧可选。
> 「语言管理」「翻译工作台」里的 60 种候选**保持不动**——那是管理员注册新语言用的，本来就该给全量。

### 3.5 后续两项（2026-11-06，树稳定后重做）

#### A. 修掉完成率的假绿分母

三处各自发明分母，全部只算 `sys_translation` 已有记录：后端 `coverage()`、`Dashboard`
的 `totalFields = fields.length`、`LanguageConfig` 的同名计算。前端有、但尚未同步入库的
词条根本不入分母。

**要把口径说确**：修复前库内确实是 100%（8504 条六语全翻完），错的是“库内完成”不等于
“全站完成”——当时全站真实解析率只有 51.4%。所以页面读数不是算错了除法，而是
**量错了东西**；只要同步链路一断，它就会立刻变成谎告。新口径把分母钉在“全站需译”，
并额外报出 `missingInDb`，让“链路断了”本身变成一个可见数字。

实测（开发库，2026-11-07）：同步链路完好时两种口径重合，这正是它们应当重合的状态：

| 语言 | 新口径（镜像 ∪ 库 = 16550） | 旧口径（库记录 = 16550） | 状态（阈值 60%） |
|---|---|---|---|
| zh-TW / zh-CN | 100.0% | 100.0% | ready |
| en | 100.0%（16547） | 100.0% | ready |
| ja / ko | 58.4%（9660） | 58.4% | partial |
| ru | 58.3%（9651） | 58.3% | partial |
| 未同步入库 | **0**（新字段，>0 就是链路断了） | 不可见 | — |

对比修复前的事故现场：旧口径报 100%，而 `i18n:report` 的真实解析率是 51.4%。

| 改动 | 说明 |
|---|---|
| 新增 `I18nLocaleMirror` | 镜像的唯一解析入口（展平文案 key / 数组 key 判定都只此一处），启动同步器与统计共用 |
| `coverage()` 分母 = 镜像 key ∪ 库字段 | 新增 `dbTotal` / `mirrorTotal` / `missingInDb` 三个解释性字段；`missingInDb > 0` 就是“加了文案没跑同步” |
| 镜像不可用时退回旧口径 | 不能把分母拍成 0（那会把 100% 翻成 0%，比虚高更容易误读）；同时打 WARN |
| 前端新增 `utils/coverageRows.ts` | 两个页面不再自算分母；后端取不到时走兜底并带 `estimated: true`，页面直接标注“此读数偏高” |
| 平均值改成按 key 加权 | 旧的行均值会把 100% 和 10% 平均成 55% |
| 状态不再由页面重推 | 直接用后端 `status`，阈值只留一处定义 |
| 删掉 `translationConfig.ts` 里 120 行死代码 | `getLanguageCoverage`/`validateLanguageConfigured`/`getFieldTranslation` 全仓引用数为 0，而且**会凭空造数**：库里没数据时给 zh-TW/en 返回 rate=1、给其它任何语言返回 rate=0.5（既不查语言包也不查库）。第三套完成率算法就此消除 |

测试：`TranslationCoverageDenominatorTest` 5 例（含“旧口径报 ready → 全站口径必报 partial”
这条决定性断言）+ `coverageRows.test.ts` 6 例。

#### B. 免登界面（登录页）六语静态兜底

`/translations/bundle` 需要登录，所以登录页只能靠静态包；ja/ko/ru 当初只覆盖门户文案，
**一条 `login.*` 都没有** → 日语登录页整片英文。库里其实早有译文，补进静态包不耗机翻额度。

- 免登 key 由脚本扫源码得出（现 20 个：`login.*` 17 + `app.logoGroup` + `portal.country/language`），
  18 个从库取既有译文落进 `locales/{ja,ko,ru}.json`（所有权规则见 §3.5 D.1：库里非空以库为准）。
- 库里也没有的 2 个（`login.captchaRequiredHint`、`app.logoGroup`）走了脚本的
  `MANUAL_TEXTS` 手写兜底：它们分属安全提示与品牌读屏标签，无业务含义且词形沿用库里
  `app.logoMain` 已定型的写法。**这两条待业务复核**，且故意不回写数据库，所以下列完成率不会因此虚高。
- 新门禁 `npm run check:i18n-preauth`（不连库，CI 必跑）：免登页面新加一句文案而没补外语，直接红。
  已做变异验证：删掉 `ja.json` 一个 key → 报“ja.json 缺 login.welcomeTitle”，恢复后转绿。
- 新免登页必须登记进 `PREAUTH_SURFACES`；清单里的路径不存在时脚本直接报错（本次就靠这条
  发现 `SliderCaptcha` 已被重构成目录，路径写错不会静默少扫）。

#### C. 门禁自身的两处口径对齐（数组型 key 退库带出来的）

- `npm run i18n:snapshot` 的 SQL 原本不带 `deleted = 0`：§3.5 B 之前数组 key 被
  `translation:array-keys-cleanup-v1` 逻辑删除后，这批行仍会留在免检名单里，
  于是门禁对它们**永久失明**（既不计入未入库、也不逐键解析）。已加 `deleted = 0`：
  快照 16558 → 16550（正好剔除 8 个已退库 key）。
- `check:i18n` 的收录率分母原本只排 dict、没排 list：等退库在生产生效，会凭空多
  8 个永远填不上的假缺口。两处必须同时改，否则一边真、一边假。

#### D. 实施过程中又暴露的三个缺陷（前两个靠浏览器实测发现）

1. **生成器不能把库里的修正传导回来**（我自己写的错法）：`i18n-preauth-locale.py` 最初是
   「静态已有值一律不覆盖」。看起来是保守，实际上把这批 key 变成了**一次性导入**：
   库里 `login.wechat` 的 ja 值是残缺串 `WeCh`，改成 `WeChat` 后重跑生成器，静态包纹丝不动
   （新增 0）——这正好是本轮一直在修的「两套真源、其中一套永不更新」形状。
   现改为明确的所有权规则：**库里非空 → 以库为准；库里为空而静态有值 → 保留手写值；
   两边都空 → `MANUAL_TEXTS` 兜底**。实测输出 `ja.json login.wechat：'WeCh' → 'WeChat'（跟库内修正）`。
   口径同时写进 AGENTS.md：在翻译工作台改完这批 key 的外语后，**必须重跑 `i18n:gen-preauth`**。
2. **antd/dayjs 内置文案与 `<html lang>` 从不跟随语言**（浏览器实测发现）：
   `src/bootstrap.tsx` 只分「en 用英文，其余一律繁中」——于是简体中文的 antd 分页/清空文案与
   dayjs 星期表头一直是繁体（週日），与已是简体的正文同一屏两种字形；ja/ko/ru 也拿到繁体内置文案。
   `document.documentElement.lang` 则一直停在 index.html 写死的 `zh-TW`，读屏器按繁体中文播报。
   修法：映射口径集中到新纯函数 `@/i18n/localeMapping`（antd/dayjs/html lang 三个选择器），
   入口只把字符串换成 import 进来的 locale 对象；未登记语言仍回退繁中，保持历史行为。
   无新增依赖（antd/dayjs 自带 6 套 locale）。测试：`localeMapping.test.ts` 5 例。
3. `isHumanEdited()` 从枚举名字改成前缀规则（`machine(` / `i18n-` / `backfill-zh-CN` 以外才算人工）：
   枚举名单会漏掉下一个系统写入方，漏了就等于系统把自己当人工修订保护起来、永远不再被修正
   （本次新加的 `i18n-preauth-fix` 就是现实例子）。

### 3.6 测试

- `backend/.../config/TranslationMirrorSyncTest.java`：13 例（一次写齐三语、漂移回填、
  `menu.*` 不盖值、`manual` 不盖值、人工修订不回退、机翻输出可被镜像修正、一致时零写入、
  空繁中不入库、缺整份镜像时降级、解不开的行整行不动、`field_name`/`category` 截断口径）。
- `frontend/packages/i18n/src/i18n/index.test.ts`：9 例（zh-CN 键集齐备、繁中有值处不得为空、
  无陈旧键、探针键取简体值并以 `ja` 作回退基准、冒号 ns 写法、bundle 不覆盖静态、
  登录页文案有静态兜底、null 返回可重试）。
- `scripts/lib/i18n-db-namespace.test.mjs`（已有回归）因本次改动被连带修复，见 §3.7。
- `frontend/packages/platform-client/src/utils/translationConfig.test.ts`：6 例（zh-CN 下 6 语 + 5 国的简体名、
  长尾语言回退母语名、长尾国家回退中文列而非英文列、另外 5 语取列口径逐列不变）。

- `src/pages/Login/Login.locale.test.tsx`：4 例（下拉只有 6 种且无 `ภาษาไทย/Français` 等长尾项、
  选简体中文真的切语言并同时落 `login_language` + `app_language`、历史脏值 `th` 不再被恢复、
  两个下拉的无障碍标签）。
- `TranslationCoverageDenominatorTest`（5 例）+ `coverageRows.test.ts`（6 例）：见 §3.5 A。
- `scripts/i18n-preauth-locale.py`：免登界面六语兜底生成与校验（`--keys` / `--check`），见 §3.5 B。
- `frontend/packages/i18n/src/i18n/localeMapping.test.ts`：5 例（六语各自落到对应 antd/dayjs locale、
  简中不得拿到繁体内置文案、区域后缀识别、未知语言回退口径、`<html lang>` 如实透传）。

### 3.7 本次改动连带暴露的两个现有问题

1. **`scripts/lib/i18n-db-namespace.test.mjs` 夹具把语言列表硬编码成 5 语**。
   本修复把 `ALL_LANGS` 加了 `zh-CN` 后，该套件直接 `FileNotFoundError` 而挂掉（跑全量 `npm run test:run` 才暴露）。
   现在改为**从真脚本源码解析 `ALL_LANGS`**，语言集跟着被测脚本走；解析不到就判失败，
   避免退化成“一个语言都不写 → 脚本没跑起来 → 所有断言空过”的假绿。
2. **`flatten(node, '')` 从根节点调用会产出带先导点的键**（`.accountBalance.colBrand`）。
   它是专门给“传一个命名空间当 prefix”的调用方设计的；新写的收录率检查直接复用它
   会得到“16048 个 key 全部未入库”的错结论（刚好等于“什么都没比对”）。已拆出 `flatten_root()` 改正。

> 这两个问题都是同一种形态：**门禁看起来在工作，实际比对的是空集**。所以本次交付的三道新门禁
> 全部做了变异验证（见下表），不靠“跑绿了”判定它们有效。

### 3.8 门禁变异验证（对“不应该发生”型断言必做）

| 注入的缺陷 | 预期 | 实测 |
|---|---|---|
| 从 `locales/zh-CN.json` 删一个 `rdm.import.colRowNo` | `check:i18n-zhcn` 失败 + vitest 红 | ✅ exit 1（报“缺 1 个 key”与“繁中有值但简中为空”）；5 个用例失败 |
| 从后端镜像 `zh-TW.json` 删同一个 key | `check:i18n-mirror` 失败 | ✅ exit 1（“真源 16048 / 副本 16047，缺 1 个”） |
| 从 `scripts/i18n-db-keys.json` 删同一个 key | `check:i18n` 的 `_dbGapKeys` 棘轮失败 | ✅ exit 1（“未收录 1 个，超过基线 0”，并列出 key） |
| 恢复后三处 | 全部转绿 | ✅ 三道门禁均 exit 0 |
| 从 `locales/ja.json` 删 `login.welcomeTitle` | `check:i18n-preauth` 失败 | ✅ exit 1（逐条报“ja.json 缺 login.welcomeTitle”），恢复后转绿 |
| 把 `PREAUTH_SURFACES` 里一个路径写错 | 脚本不得静默少扫 | ✅ 直接报错退出（实际靠这条发现 SliderCaptcha 已改成目录） |
| 快照去掉 `deleted = 0` 过滤 vs 加回 | 已退库 key 不得仍留在免检名单 | ✅ 16558 → 16550，8 个数组 key 不再在名单里 |

---

## 四、验收口径与命令

```bash
npm run i18n:report          # 六语真实完成度（唯一验收口径）
npm run check:i18n           # 引用完整性 + 插值 + 硬编码棘轮 + 翻译库收录率棘轮
npm run check:i18n-zhcn      # 简中静态包结构
npm run check:i18n-mirror    # 后端镜像 == 前端真源
npm run check:i18n-preauth   # 免登界面（登录页）六语静态兜底
npm run i18n:snapshot        # 改了文案并重启后端后，刷新 field_key 快照
```

**新增/修改一条前端文案的固定动作**（顺序不能换）：

1. 改 `locales/zh-TW.json` + `locales/en.json`（真源）
2. `npm run i18n:gen-zhcn` → 生成 `locales/zh-CN.json`
3. `npm run i18n:sync-backend` → 刷三份镜像
4. 改的是**免登界面**（登录页等）文案时：`npm run i18n:gen-preauth` → 把 ja/ko/ru 兜底补齐
5. 重启后端（`npm run restart:backend`）触发同步入库
6. `npm run i18n:snapshot` + 跑上面六道 check

第 2~4 步漏做会被 `check:i18n-zhcn` / `check:i18n-mirror` / `check:i18n-preauth` 挡住；
第 5~6 步漏做会被 `check:i18n` 的 `_dbGapKeys` 棘轮挡住。

> ⚠️ 另有一条不属 i18n、但会被同一批改动触发的坑：**`check:registry` 只统计已被 git 跟踪的后端类**。
> 新增带新前缀的 Java 文件（本次是 `I18nLocaleMirror` → 前缀 `I18n*`）时，未 `git add` 前跑
> `engineering/generate-systems.py` 会报“跳过不存在的后端前缀”并不把它写进登记表，
> 于是本地门禁看着是红的、登记表就永远缺这一项。必须先 stage（或提交）再重跑生成器；
> 前缀声明写在 `generate-systems.py` 的 `BACKEND_PREFIXES`，不要手改生成物 `systems.json`。

### 实测副作用（首次全量同步，开发库）

| 项 | 实测值 |
|---|---|
| 新增入库字段 | 8040 条 |
| 按镜像修正既有字段 | 6756 条（含 6384 条 `en` 被更高质量的镜像文案替换，无一条来自人工修订） |
| 首次同步耗时 | 约 9 分钟（SQLPub 开发库；含在启动期，期间 `/api/health/ready` 为 503） |
| 第二次启动 | 新增 0 / 修正 0 / 触碰 0，**幂等成立**，耗时 < 1 秒 |
| 备份 | `.local/backup-sys_translation-pre-i18n-sync.json`（8504 行全表，仓库外） |

> ⚠️ 生产首次部署会重演那一次 ~9 分钟的启动期同步。生产 RDS 延迟更低但仍需按分钟计，
> `maxUnavailable: 0` + 就绪探针会保住旧实例接流量，不会造成中断，但要预留发布窗口。

---

## 五、剩余项（按建议处置）

| # | 剩余问题 | 数据 | 建议 | 是否阻塞 |
|---|---------|------|------|---------|
| 1 | ja/ko/ru 未完成 | 各缺 ~6550 key（约 60.4%，仍随启动轮次上升） | **实测吞吐**：本轮递交 2000 个字段，因 `MyMemory 每日字符配额已用尽 (5002/5000)` 提前停下，实际只填 474 条。按此速率匿名额度需 ~40 轮重启才能填完剩余 ~19700 条；配 `MYMEMORY_EMAIL`（提至 50000）约 4 天；或在「机翻引擎」给 `openai` 填可用 Key（三行 `api_key` 全为 NULL，deepl/openai 均 `status=0`）。额度守卫本身工作正常：超额时服务端仍返 200 + 警告文案，`looksLikeQuotaWarning` 识别后把本地计数置满并停止外呼 | 否 |
| 2 | 机翻质量 | ja/ko 与繁中共用汉字，MyMemory 常返回与源文本相同的结果；`isCJKTargetLang` 会放行 | 若要正式对外交付外语版，建议改用 LLM 引擎重跑 ja/ko | 否 |
| 3 | `en.json` 3 个空量词 | `rdm.daily.unitItem/unitProject/unitTimes` = `''` | 英文按「无单位」处理是可接受的；已计入 `_refsBlank=0`（未被 `t()` 直接引用）。若产品要求显示 `items/projects/times`，改前端文案后走 §四 流程 | 否 |
| 4 | `zh-TW.json` 2 个空文案 | `asset.alertMsg`、`adSales.tierUnit` | 繁中本身就是空洞（`asset.alertMsg` 的英文有整句而繁中为空），属业务定稿，不能自动编造；已同步器跳过 + 门禁告警 | 否 |
| 5 | 库里 11 个前端已删的 key + 2 个裸键脏数据（`aiAccessApply`/`aiEmpPermission`，无点号、`en` 为空） | 见 `scripts/i18n-db-keys.json` 与镜像 diff | bundle 仍会返回它们但无人引用，属**惰性数据**。删除是不可逆操作且无法区分「历史 key」与「后端专用 key」，本轮**不删**，留待业务确认 | 否 |
| 6 | ~~登录页 ja/ko/ru 仍是英文~~ **已修（§3.5 B）** | 免登 20 个 key 已全部落进六份静态包，并有 `check:i18n-preauth` 守卫 | 无需再决策；仅 `MANUAL_TEXTS` 那 2 条手写兜底待业务复核 | 否 |
| 7 | 工作台改 zh-TW/en/zh-CN 对已入静态包的 key 不生效 | 静态包 `overwrite=false` 优先 | **这是既有设计**（防止后端回退链的英文/字段名盖掉已本地化文案），已在 `AGENTS.md`「多语言文案三处同步」第 3 条写明：改 UI 文案请改前端 | 否 |
| 8 | 国家下拉的 55 个长尾国名仍是繁体 | 登录页语言下拉已收敛到 6 种（长尾语言的繁体/母语标签随之消失）；国家下拉仍是 57 项，只有中/美/日/韩/俄给了简体名（已用浏览器实测确认） | **不要把 ICU4J 繁→简转换直接当成国名简中名单**：那只是字形转换，不等于大陆标准译名（实测会产出 `义大利`、`沙乌地阿拉伯`、`波士尼亚`、`寮国`、`肯亚`、`克罗埃西亚`、`亚塞拜然` 这类港台用词，比繁体更难接受）。补齐需要一份大陆标准国名简中译名表（属用词定稿），应先在 `NAME_ZH_CN_COUNTRY` 里逐个录入正名，而不是批量转换 | 否 |
| 9 | 本地开发库的机翻额度仍为匿名 5000 字符/天 | `backend/.env.local` 实测未设 `MYMEMORY_EMAIL`（只查有无，不回显值）；生产侧用户已配置 | 本地要推进开发库的 ja/ko/ru，需把同一个 email 写进 `backend/.env.local`（口令/邮箱类值不得入库）。额度上限切换已被 `TranslationQuotaGuardTest` 钉住：配了 email 才是 50000 | 否 |

---

## 六、回滚方案

| 层 | 回滚动作 |
|----|---------|
| 代码 | revert 本次提交（前端 i18n 包、后端 `TranslationDataInitializer`、三份脚本、两条 workflow、`package.json`） |
| 数据 | 无需回滚：本次只向 `sys_translation` **新增** 8040 条并把镜像值对齐前端。全表备份在 `.local/backup-sys_translation-pre-i18n-sync.json`（仓库外），需要时可按 `field_key` 逐条还原 `translations_json` |
| 结构 | 未改任何表结构与索引；`translation:base-v1` 版本门不受影响 |
| 配置 | `TRANSLATION_AUTO_MT_ENABLED=false` 可立刻停掉启动期外呼；`check:i18n-mirror` 只读，不影响构建产物 |

---

## 七、2026-11-06 后续（推送之后的增量）

1. **生产前端已实测带简中静态包**：拉线上产物 `assets/index-BMmAWf3D.js`（last-modified 就是本次
   Pages 部署），其中同时存在 `登录工号`/`欢迎登录`（简中）与 `登錄工號`（繁中）。
   即：**不依赖后端镜像是否已重部，线上站点切简体中文已经是对的。**
2. **生产后端镜像是否已跑过那次全量同步仍未确认**：无集群凭据，查不到 pod 状态。
   可用登录后的 1 分钟判据：在「翻译工作台」搜 `rdm.import.colRowNo`，搜得到 = 已同步。
3. 本地 `main` 已快进到 origin（含主题系列 PR #43~#45），合并后的树上重跑：
   14 道门禁全绿 + `npm run test:run` **195 文件 / 2035 例全绿**（含新增登录页 4 例），
   `lint` 0 error、`typecheck` 通过。
4. 按决定执行了「收敛可见选项」：登录页语言下拉从 60 种收到 6 种，并修掉其中
   54 个死选项（选了不生效）；实现与回归见 `src/pages/Login/Login.locale.test.tsx`。
5. 开发库的 ja/ko/ru 仍停在 60.4%：当前跑着的实例已把本轮匿名额度用完（474 条）且后台线程已结束；
   本地 `MYMEMORY_EMAIL` 未配（见 §五 第 9 项），每重启一次只会再多推 ~470 条。

---

## 八、顺带发现（与本需求无关，已登记）

- 本次工作期间仓库内出现**并发写入**：`src/pages/MeetingManagement/RoomBooking/MeetingBookingForm.tsx`
  在我未接触的情况下被修改（`git status` 由净变为已修改），`locales/en.json`/`zh-TW.json` 也在
  我未写入的前提下被重写了一次（内容与 HEAD 相同）。多语言修复链路上的文件我做了逐个校验，
  但**后续提交仍需人工确认工作区里那笔非本任务的改动**。
- `backend-docker.yml` 的 verify 作业只有 JDK、没有 Node；这是本次选择「镜像入库 + CI 校验」
  而不是「构建期生成镜像」的直接原因（见 `scripts/sync-i18n-to-backend.mjs` 头注释）。

---

Copyright (c) 2026 fengsong7889. All Rights Reserved.
本文档属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
