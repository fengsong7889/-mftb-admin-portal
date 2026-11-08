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
  2. 死样式抽样须跨目录（src + frontend/apps）复核为 0 命中，只在 AppPreview 内搜不够。

用法：python3 scripts/audit-app-preview-hex.py [rev]   # 默认 HEAD
CSS 走 `git show <rev>:<path>` 不落地，因此不受并发会话未提交改动影响；
组件侧只能读工作区，脚本会打印它读了多少个文件，读数异常时先看这一行。
"""
import os
import re
import subprocess
import sys
from collections import defaultdict

REV = sys.argv[1] if len(sys.argv) > 1 else 'HEAD'
CSS = 'src/pages/AppPreview/appPreview.css'
PLATFORM_ROOTS = ('.ap-spec-', '.ap-dual-', '.ap-preview-', '.ap-page', '.ap-toolbar')


def blob(rev, path):
    return subprocess.run(['git', 'show', f'{rev}:{path}'],
                          capture_output=True, text=True).stdout


src = blob(REV, CSS)
if not src:
    raise SystemExit(f'{REV} 下取不到 {CSS}，先确认 rev 是否正确')

rules, cur = [], None
for line in src.split('\n'):
    if '{' in line:
        cur = line.split('{')[0].strip()
    n = len(re.findall(r'#[0-9a-fA-F]{3,8}\b', line))
    if n and cur:
        rules.append((cur, n))

comps = [p for p in subprocess.run(['git', 'ls-files', 'src/pages/AppPreview'],
                                   capture_output=True, text=True).stdout.splitlines()
         if p.endswith(('.tsx', '.ts'))]
used_text = '\n'.join(open(p, encoding='utf-8').read() for p in comps if os.path.exists(p))
# 拼接类名会让字面判据失效，这里主动报警而不是静默给出可疑结论。
# ⚠ 只把「基类名被切开」当危险：`apc-feed-${variant}` 会造出字面搜不到的真活样式；
#   而 `apd-header${scrolled ? ' is-scrolled' : ''}` 这种基类名完整、只拼修饰类的，
#   字面判据仍然命中，不应该报警。本仓实测前者 0 处、后者 22 处，
#   正则写成 `ap[a-z]*-[a-z0-9]*\$\{` 会把 22 处安全形式误报成危险，判据本身要能自证。
if re.search(r'`ap[a-z]+-[a-z0-9]*-\$\{', used_text):
    print('⚠ 检测到基类名被模板拼接切开（`ap…-${x}`），死样式判定不可信，请先人工核对')

print(f'组件侧判据读了 {len(comps)} 个文件（工作区当前内容，含未提交改动）\n')

buckets = defaultdict(lambda: [0, 0])
detail = defaultdict(list)
for sel, n in rules:
    m = re.search(r'\.(ap[a-z]*-[a-z0-9-]+)', sel)
    name = m.group(1) if m else sel[:24]
    if any(p in sel for p in PLATFORM_ROOTS):
        kind = '平台侧（壳外，应令牌化）'
    elif name not in used_text:
        kind = '死样式（无组件引用，应删或先定性）'
    else:
        kind = '壳内模拟 APP（应豁免）'
    buckets[kind][0] += n
    buckets[kind][1] += 1
    if kind != '壳内模拟 APP（应豁免）':
        detail[kind].append((name, n))

print(f'{REV} 的 {CSS}：共 {sum(v[0] for v in buckets.values())} 处 hex，{len(rules)} 条规则\n')
for k, (n, r) in sorted(buckets.items(), key=lambda x: -x[1][0]):
    print(f'  {n:>4} 处 / {r:>3} 条规则  {k}')
for k, items in detail.items():
    print(f'\n—— {k}')
    for name, n in sorted(items, key=lambda x: -x[1])[:20]:
        print(f'   {n:>3}  .{name}')
