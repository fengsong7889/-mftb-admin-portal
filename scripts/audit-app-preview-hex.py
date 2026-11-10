#!/usr/bin/env python3
# Copyright (c) 2026 fengsong7889. All Rights Reserved.
#
# 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
# 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
# 完整许可条款见仓库根目录 LICENSE 文件。

"""按 DOM 层级审计 appPreview.css 的裸色值归属：死样式 / 平台侧（壳外）/ 壳内模拟 APP。

为什么必须以 DOM 层级为判据、不能以类名为判据（本仓实测两个反例）：
  - `.apg-panel` 名字像平台面板，实际是 ConsumerGroupBuy 的**壳内筛选浮层**
    （ConsumerGroupBuy ← ConsumerApp ← PhoneFrame）；
  - `.apf-legend` 名字像壳外字段说明表，实际**没有任何组件在用**（死样式），
    给它建令牌是纯浪费。
判据来源：index.tsx 里与 <PhoneFrame> **同级**的 `.ap-spec-panel` / `.ap-dual-*` 才是平台侧。

两个已验证的判据前提（不要跳过复验）：
  1. 组件里不存在 `apc-feed-${variant}` 这类**把基类名切开**的模板拼接——否则字面搜索会系统性漏判，
     把活样式误报成死样式，按它建议删除会直接弄坏界面；
     （`apd-header${scrolled ? ' is-scrolled' : ''}` 这种只拼修饰类的不算危险，基类名仍是完整字面量）
  2. 死样式抽样须跨目录复核为 0 命中，只在 AppPreview 内搜不够——引用面已扩到**全仓源码**
     （.tsx/.ts/.jsx/.js/.html/.mjs），因为壳样式可能被别处拼进去。
  3. 类名可以只写词头再拼后缀（`apw-pill-${x}` 造出 `apw-pill-super`），所以「本名搜不到」
     推不出「死」。拼接判据见 composed_by()，命中它的条目进「可疑」而不是「死」。

为什么 `@keyframes` 必须单独成桶（2026-11-10 实测修掉的工具自身缺陷）：
  关键帧里的 `25% { box-shadow: … }` 也是「一行一括号」，早期的解析把它当普通选择器，
  于是 `25%` 被拿去搜组件——永远搜不到，**被误判成「死样式」**。按它建议去删就会删掉动效。
  现关键帧单独计量，既不进死样式也不进豁免，必须逐处人工定性。

用法：python3 scripts/audit-app-preview-hex.py [rev|WORKTREE] [--dead-list|--keyframes]
CSS 走 `git show <rev>:<path>` 不落地，因此不受并发会话未提交改动影响；
组件侧只能读工作区，脚本会打印它读了多少个文件，读数异常时先看这一行。
--dead-list 逐行输出「行号 TAB 选择器 TAB hex 数」（删死样式时要的就是这份表），
--keyframes 输出关键帧内的色值行；两个列表都不受默认输出的 top-20 截断。
"""
import os
import re
import subprocess
import sys
from collections import defaultdict

REV = 'HEAD'
REV_SET = False
DEAD_LIST = False
KEYFRAMES = False
SELFTEST = False
for arg in sys.argv[1:]:
    if arg == '--dead-list':
        DEAD_LIST = True
    elif arg == '--keyframes':
        KEYFRAMES = True
    elif arg == '--selftest':
        SELFTEST = True
    elif arg.startswith('-'):
        raise SystemExit(f'未知参数 {arg}（只接受 [rev] / --dead-list / --keyframes / --selftest）')
    elif REV == 'HEAD' and not REV_SET:
        REV = arg
        REV_SET = True
    else:
        raise SystemExit('只能给一个 rev')
CSS = 'src/pages/AppPreview/appPreview.css'
# 名单必须与 scripts/lib/theme-token-map.mjs 的 APP_PREVIEW_PLATFORM_ROOTS 逐个相等，
# 单测跨文件钉住；两边各改一半会让「平台侧优先」判定静默失效。
PLATFORM_ROOTS = ('.ap-spec-', '.ap-dual-', '.ap-stage', '.ap-exit', '.ap-preview-', '.ap-page', '.ap-toolbar')


def blob(rev, path):
    # WORKTREE/工作区：直接读磁盘。本批改完平台侧后需要「审计工作树」来确认死样式表，
    # 只给 git 对象库就会一直审计上一个提交（实测踩过：改完再跑仍报旧值，像门禁没生效）。
    if rev in ('WORKTREE', '工作区'):
        with open(path, encoding='utf-8') as fh:
            return fh.read()
    return subprocess.run(['git', 'show', f'{rev}:{path}'],
                          capture_output=True, text=True).stdout


src = blob(REV, CSS)
if not src:
    raise SystemExit(f'{REV} 下取不到 {CSS}，先确认 rev 是否正确')
# 先剥 CSS 注释（保留换行以维持行号）：注释里的取证数字如「#1F1F1F 上对比 16.48」不是声明值，
# 不剥就会把它们计进色值总数，并把木桶分类带偏（门禁 countBareColors 本身就是先剥注释的）。
src = re.sub(r'/\*[\s\S]*?\*/', lambda m: re.sub(r'[^\n]', ' ', m.group(0)), src)

rules, cur = [], None
# 逐行扫描要带花括号深度：`@keyframes` 块内部的 `25% { … }` 不是选择器（见顶部说明）。
# 深度在算完「本行开于什么」之后才累加，所以 kf_depth 记的是关键帧开括号前的深度。
depth, kf_depth = 0, None
for lineno, line in enumerate(src.split('\n'), 1):
    head = line.split('{')[0].strip() if '{' in line else ''
    is_kf = head.startswith('@keyframes') or head.startswith('@-webkit-keyframes')
    if is_kf:
        kf_depth = depth
    elif head and kf_depth is None:
        cur = head
    n = len(re.findall(r'#[0-9a-fA-F]{3,8}\b', line))
    if n:
        if kf_depth is not None:
            rules.append((f'@keyframes-step L{lineno}', n, True, lineno))
        elif cur:
            rules.append((cur, n, False, lineno))
    depth += line.count('{') - line.count('}')
    if kf_depth is not None and depth <= kf_depth:
        kf_depth = None

# 引用面必须是**全仓应用源码**而不是只 AppPreview 目录：壳样式可能被外部组件拼进 className。
# ⚠ 但只能算 src/ 与 frontend/ 下的代码：`--selftest` 上线当场拓过这个坑——把 scripts/**.mjs
# 也扫进来后，单测里写的 `.apcs-channel--groupbuy` 夹具会让该名字「被引用」，
# 于是拼接可疑项被洗成壳内、从删除候选里静默消失（工具自己的测试不应该是它的事实输入）。
USAGE_EXT = ('.tsx', '.ts', '.jsx', '.js', '.html', '.mjs')
USAGE_DIRS = ('src/', 'frontend/')
comps = [p for p in subprocess.run(['git', 'ls-files'], capture_output=True, text=True).stdout.splitlines()
         if p.endswith(USAGE_EXT) and p.startswith(USAGE_DIRS) and os.path.exists(p)]
used_text = '\n'.join(open(p, encoding='utf-8', errors='ignore').read() for p in comps)
# 拼接类名会让字面判据失效，这里主动报警而不是静默给出可疑结论。
# ⚠ 只把「基类名被切开」当危险：`apc-feed-${variant}` 会造出字面搜不到的真活样式；
#   而 `apd-header${scrolled ? ' is-scrolled' : ''}` 这种基类名完整、只拼修饰类的，
#   字面判据仍然命中，不应该报警。本仓实测前者 0 处、后者 22 处，
#   正则写成 `ap[a-z]*-[a-z0-9]*\$\{` 会把 22 处安全形式误报成危险，判据本身要能自证。
if re.search(r'`ap[a-z]+-[a-z0-9]*-\$\{', used_text):
    print('⚠ 检测到基类名被模板拼接切开（`ap…-${x}`），死样式判定不可信，请先人工核对')

print(f'引用面判据读了 {len(comps)} 个应用源码文件（src/ 与 frontend/，工作区当前内容）\n')

KIND_PLAT = '平台侧（壳外，应令牌化）'
KIND_SHELL = '壳内模拟 APP（应豁免）'
KIND_DEAD = '死样式（全仓无引用，应删或先定性）'
KIND_SUSPECT = '可疑（本名无引用但有拼接词头命中，可能是拼出来的，不得直接删）'
KIND_KF = '关键帧内色值（逐处人工定性，不得当死样式删）'
KIND_NOCLASS = '无类名规则（选择器里抽不出类，字面判据无效，必须人工定性）'


def first_class(sel):
    """取选择器里第一个类名（不带点）。

    早先的正则是 `\.(ap[a-z]*-[a-z0-9-]+)`，**要求类名里必须有 `-`**：
    `.apcs`（搜索原型局部令牌块，里面定着 `--apcs-pink` 等 10 个局部变量）因此没命中，
    走到 `sel[:24]` 兜底时保留了前导点，拿 `.apcs` 去搜源码永远搜不到——
    **被误判成死样式**。按它建议删除会直接弄坏搜索覆盖层。
    """
    m = re.search(r'\.([A-Za-z_][\w-]*)', sel)
    return m.group(1) if m else None


# 手算对照表：本工具驱动过破坏性删除，所以它自己必须能自证（--selftest）。
# 每一条都对应一个**已经踩过并修好**的误判形态；将来谁把判据改坏，这里先红。
SELFTEST_CASES = [
    # (选择器, 期望归类, 为什么钉这条)
    ('.apcs', KIND_SHELL, '局部令牌定义块，旧正则因类名无 - 而误判成死样式'),
    ('.apw-pill-super', KIND_SUSPECT, '由 `apw-pill-${x}` 拼出，不是死样式'),
    ('.apcs-channel--groupbuy', KIND_SUSPECT, '由 `apcs-channel--${k}` 拼出'),
    ('.apc-group-banner', KIND_DEAD, '类名迁移后无人引用的真死样式'),
    ('.ap-spec-panel', KIND_PLAT, '壳外平台侧，不得被当成壳内豁免'),
    ('.ap-stage', KIND_PLAT, '舞台底属平台侧（旧名单漏了它）'),
    ('.ap-dual-label', KIND_PLAT, '并排标签在 index.tsx 里与手机壳同级'),
    ('.apf-card', KIND_SHELL, '壳内模拟 APP 内容（团购卡，两个壳共用）'),
    ('.ap-phone', KIND_SHELL, '设备外壳，不跟随主题'),
]


def composed_by(name):
    """本名是否可能由插值/拼接造出来——是的话字面搜索就系统性漏判。

    实测两类形态：
      - `apcs-channel apcs-channel--${entry.channel}`（BEM 修饰拼接）
      - `apw-pill-${x}`（**单连字符就断开**，能造出 `apw-pill-super`）
    早先只看 `--`，于是 `.apw-pill-super` 被误判成死样式——按它删会弄坏红包药丸配色。
    返回命中的词头（供人工核对），没命中返回 None。
    """
    parts = name.split('-')
    for i in range(1, len(parts)):
        stem = '-'.join(parts[:i]) + '-'
        for tail in ('${', "' +", '" +', '` +'):
            if stem + tail in used_text:
                return stem
    return None


buckets = defaultdict(lambda: [0, 0])
detail = defaultdict(list)
dead_rows, kf_rows = [], []


def classify(sel):
    """单条选择器的归类。主循环与 --selftest 共用这一份判据，**不得另写第二份**。"""
    name = first_class(sel)
    if name is None:
        return KIND_NOCLASS, sel[:32]
    if any(p in sel for p in PLATFORM_ROOTS):
        return KIND_PLAT, name
    if name in used_text:
        return KIND_SHELL, name
    return (KIND_SUSPECT if composed_by(name) else KIND_DEAD), name


for sel, n, is_kf, lineno in rules:
    if is_kf:
        kind, name = KIND_KF, sel
    else:
        kind, name = classify(sel)
    buckets[kind][0] += n
    buckets[kind][1] += 1
    if kind != KIND_SHELL:
        detail[kind].append((name, n))
    if kind in (KIND_DEAD, KIND_SUSPECT, KIND_NOCLASS):
        # 复合选择器要能逐环审计：删一条规则只在「其中一环确实进不了 DOM」时才安全。
        rings = []
        for c in re.findall(r'\.([A-Za-z_][\w-]*)', sel):
            if c in used_text:
                rings.append(f'{c}:活')
            elif composed_by(c):
                rings.append(f'{c}:拼({composed_by(c)})')
            else:
                rings.append(f'{c}:死')
        dead_rows.append((lineno, sel, n, kind, ' '.join(rings)))
    if is_kf:
        kf_rows.append((lineno, sel, n))

def classify_probe(sel):
    """给 --selftest 用的入口：只返归类，不返名字。"""
    return classify(sel)[0]


if SELFTEST:
    fails = []
    for sel, want, why in SELFTEST_CASES:
        got = classify_probe(sel)
        if got != want:
            fails.append(f'{sel}: 期望 {want}，实得 {got}（{why}）')
    # 不变式：各桶合计必须等于总数，否则说明有行被静默丢弃
    if sum(v[0] for v in buckets.values()) != sum(n for _, n, _k, _l in rules):
        fails.append('分桶合计 ≠ 色值总数，有行被静默丢弃')
    # 关键帧不得进死样式桶（旧版把 `25%` 当选择器搜组件）
    if any('keyframes' in n for n, _c in detail.get(KIND_DEAD, [])):
        fails.append('关键帧步又被当成死样式')
    if fails:
        for f in fails:
            print('✗', f)
        raise SystemExit(1)
    print(f'✓ --selftest 通过：{len(SELFTEST_CASES)} 条手算对照 + 分桶合计不变式'
          f'（总数 {sum(v[0] for v in buckets.values())}）')
    sys.exit(0)

print(f'{REV} 的 {CSS}：共 {sum(v[0] for v in buckets.values())} 处 hex，{len(rules)} 条规则\n')
for k, (n, r) in sorted(buckets.items(), key=lambda x: -x[1][0]):
    print(f'  {n:>4} 处 / {r:>3} 条规则  {k}')

if DEAD_LIST:
    print('\n—— 逐行删除候选表（行号 TAB hex TAB 定性 TAB 选择器 TAB 逐环活性）')
    for lineno, sel, n, kind, rings in sorted(dead_rows):
        tag = {KIND_DEAD: '死', KIND_SUSPECT: '可疑', KIND_NOCLASS: '无类名'}[kind]
        print(f'{lineno}\t{n}\t{tag}\t{sel}\t{rings}')
if KEYFRAMES:
    print('\n—— 关键帧内色值行')
    for lineno, sel, n in sorted(kf_rows):
        print(f'{lineno}\t{n}\t{src.split(chr(10))[lineno - 1].strip()}')
for k, items in detail.items():
    if DEAD_LIST or KEYFRAMES:
        break
    print(f'\n—— {k}')
    for name, n in sorted(items, key=lambda x: -x[1])[:20]:
        print(f'   {n:>3}  .{name}')
