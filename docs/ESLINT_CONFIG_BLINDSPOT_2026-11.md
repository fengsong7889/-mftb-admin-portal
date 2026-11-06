# ESLint / tsc 对根配置文件的委托空档（2026-11-06 立项）

> 状态：**已修一半**。重复别名键已清除、`no-dupe-keys` 已显式接管、配置文件已纳入 lint 面
> （提交 `ccfd7e44` 与本文档所在提交）。剩余缺口见文末「仍未覆盖」，需按批次推进。
>
> 本文档同时是一次方法论复盘：中途得出过一个**错误结论并已推送**，第五节完整记录它是怎么
> 产生、又是怎么被发现的。

## 一、症状

`vitest.config.ts` 的 `resolve.alias` 里 7 个别名键各写了两遍，每次跑测试都刷 esbuild 的
`Duplicate key "@/api" is here` 一类 WARNING。`vite.config.ts` 第 552-570 段是**同一组 7 个**
重复键（两份配置各抄了一遍，缺陷成对出现）。

JS 对象字面量重复键不报错、不告警，静默以后写的为准。两份映射一旦分叉，表现就是
「改了不生效」——构建读的是后写那份。

## 二、真正的因果链：三方都以为别人在管

| 环节 | 事实 | 后果 |
|---|---|---|
| ESLint ignores | `eslint.config.js` 全局忽略 `*.config.ts` / `*.config.js` | 配置文件不进 lint |
| lint 命令 | `lint` 脚本只跑 `eslint src frontend` | 即使不 ignore 也不会被扫到 |
| tsc 覆盖面 | `tsconfig.json` 的 `include` = `src`、`frontend/apps/*/src/main.tsx`、`frontend/packages/{contracts,i18n,platform-client,ui}/src` | 根配置文件不在类型检查内 |
| typescript-eslint | recommended **故意关掉 22 条**它认为「tsc 会报」的核心规则，`no-dupe-keys` 在名单里 | 重复键交给 tsc |

⇒ ESLint 把重复键委托给 tsc，tsc 从不打开这些文件，而 lint 命令连文件都不传。
三方各管一段、接缝处没人管，这就是缺陷能长期存活的机制，不是某个人漏配了一条规则。

## 三、取证命令与读数

```bash
# 1) recommended 到底配了什么（64 条，含 no-dupe-keys:no-undef:no-const-assign = error）
node -e "import('@eslint/js').then(m=>{const r=m.default.configs.recommended;
  console.log(Object.keys(r), Object.keys(r.rules).length, r.rules['no-dupe-keys'])})"

# 2) typescript-eslint 关掉的核心规则（22 条）
node -e "import('typescript-eslint').then(m=>{const off=new Set();
  for(const c of m.default.configs.recommended)
    for(const [k,v] of Object.entries(c.rules||{}))
      if(!k.startsWith('@typescript') && (v===0||v==='off')) off.add(k);
  console.log([...off].sort().join(', '))})"
```

关掉名单（实测原文）：

```
constructor-super, getter-return, no-array-constructor, no-class-assign, no-const-assign,
no-dupe-args, no-dupe-class-members, no-dupe-keys, no-func-assign, no-import-assign,
no-new-native-nonconstructor, no-new-symbol, no-obj-calls, no-redeclare, no-setter-return,
no-this-before-super, no-undef, no-unreachable, no-unsafe-negation, no-unused-expressions,
no-unused-vars, no-with
```

开启的核心规则只有 4 条：`no-var, prefer-const, prefer-rest-params, prefer-spread`。

环境读数：`eslint@10.7.0`、`@eslint/js@10.0.1`、`typescript-eslint@8.65.0`、
`eslint-plugin-react-hooks@7.1.1`（注意 AGENTS.md 原写「ESLint 9」，已同步更正）。

## 四、本次已落地的修复

1. `eslint.config.js`：`ignores` 摘掉 `*.config.ts` / `*.config.js`；显式
   `'no-dupe-keys': 'error'`（把委托给 tsc 的责任接回来）；另加一块 `**/*.config.{js,cjs,mjs}`
   的规则，专门覆盖 `eslint.config.js` 自己（「同一条规则写两遍」最容易发生在它的 rules 里）。
2. `package.json`：`lint` / `lint:fix` 纳入 `vite.config.ts`、`vitest.config.ts`、
   `vite-build-meta.ts`、`eslint.config.js`。
3. 两份配置的 7+7 个重复别名键删除。**删除前先按值比对**，确认重复项的值逐字符相同
   （值不同时段位会改变解析结果，删错一份就是行为变更）。
4. 阳性对照：临时探针 `{alpha:1, alpha:2}` 在项目自身配置下报 `Duplicate key 'alpha'`，
   证明规则真的生效而非又写一条摆设；探针验完即删。

成本先量再开：`npx eslint src frontend --rule '{"no-dupe-keys":"error"}' --quiet` 在业务代码
新增错误数 **0**，所以能直接定 error 而不给 CI 添欠债。现存 warning 621 条（不阻断门禁）。

## 五、复盘：我得出过一个错误结论，且它曾被推送

**错误结论**（写在提交 `ccfd7e44` 的说明里）：「`extends` 的两套 recommended 整块没有生效，
仓库实际只跑 6 条显式规则，AGENTS.md 与实况不符」。

**它错在哪**：我做的「阳性对照」探针违规项是 `const x=1; x=2`（`no-const-assign`）与重复键
（`no-dupe-keys`）——**恰好全部落在 typescript-eslint 那 22 条关闭名单上**。这些规则不报是
设计如此，不是 `extends` 失效。我用一个「本来就不会报」的样本去证明「配置没生效」，
对照组从选取那一刻就是无效的。

**怎么被抓出来的**：为了验证「不用 `extends` 的原生数组写法能不能生效」，我写了 B 组实验，
发现 `no-dupe-keys` 在 B 组**同样不报**——如果结论成立，B 组应该报。两个对照组同时不绿，
说明问题在名单机制而不在配置写法。随后换一条**不在关闭名单上**的 `no-sparse-arrays` 重测，
项目自身配置立刻报错 ⇒ `extends` 一直是好的。

**可复用教训**（与本仓库既有经验同源，此处再钉一次）：
- 断言「某能力不存在」之前，必须先证明**对照组能绿**：选样本时要确认该样本在预期机制下
  必然触发，而不是「看起来应该触发」。
- 一条规则查出来 severity=0 / 不报，有至少三种成因：配置未生效、被上游 preset 故意关闭、
  文件根本没进检查面。要用「换一个不受上游影响的样本」来区分，而不是直接归因到第一种。
- 结论进了 commit message 就等于进了公开历史；本次以本文档 + 后续提交做更正记录，
  不改写已推送的历史。

## 六、仍未覆盖（需按批次立项，勿顺手夹带）

| 缺口 | 现状 | 建议处置 |
|---|---|---|
| `scripts/*.mjs`、`scripts/lib/*.mjs` | 门禁脚本自身不在 lint 面（`lint` 只跑 src/frontend + 4 个根配置） | 单独一批：先量 `eslint scripts` 的存量问题数，再决定是否纳入并配 baseline |
| `mcp/`、`backend/**/*.java` 的静态检查 | 不在前端 lint 面（后端另有 mvn 链路） | 维持现状，避免与后端门禁重复 |
| 根配置文件的类型检查 | 仍不在 `tsconfig.include`；`no-dupe-keys` 已补住重复键，但别的路径/类型错误无人管 | 评估把 4 个根配置纳入一次独立 `tsc --noEmit`（注意本仓 tsc 堆上限问题，见 ENVIRONMENT-REFERENCE §4.3.1） |
| recommended 里其余 60+ 条规则 | 对 src/frontend 已生效，只是历史 warning 量大 | 不做「一次性开全集」；按规则逐条评估，每条给出新增问题数再决定 error/warn |

## 七、自检清单（改动 lint 面时执行）

```bash
npm run lint                  # 必须 0 error；配置文件已在检查面内
npx eslint --print-config vite.config.ts | python3 -c "import json,sys; r=json.load(sys.stdin)['rules']; print('no-dupe-keys severity =', r['no-dupe-keys'][0])"
# 阳性对照：临时给某个 .config.ts 加一个重复键 → 必须判红；验完删除
```

---

Copyright (c) 2026 fengsong7889. All Rights Reserved.
本文档属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
