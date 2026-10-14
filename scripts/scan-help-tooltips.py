#!/usr/bin/env python3
"""扫描所有 .tsx 中的 <Tooltip>，抽取 title 内容，按“可见文本长度/句读数量”排名，
用于客观定位「长说明型白底 Tooltip」（即阅读体验差的问号提示）。"""
import re
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('src')

tooltip_open = re.compile(r'<Tooltip\b')

def find_matching_paren(s, start):
    """start 指向 '(' 或 '{'，返回匹配的结束下标（含）。支持嵌套与字符串。"""
    opener = s[start]
    closer = {'(': ')', '{': '}', '[': ']'}[opener]
    depth = 0
    i = start
    in_str = None
    while i < len(s):
        c = s[i]
        if in_str:
            if c == '\\':
                i += 2
                continue
            if c == in_str:
                in_str = None
        else:
            if c in ('"', "'", '`'):
                in_str = c
            elif c == opener:
                depth += 1
            elif c == closer:
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return -1

def visible_len(text):
    """统计中日韩+字母数字可见字符数，忽略标签/空白/引号。"""
    # 去掉 JSX 标签
    stripped = re.sub(r'<[^>]+>', '', text)
    stripped = re.sub(r'\{[^{}]*\}', '', stripped)
    stripped = re.sub(r'\s+', '', stripped)
    return len(stripped)

def sentence_marks(text):
    return len(re.findall(r'[。；;]', text))

results = []
for f in ROOT.rglob('*.tsx'):
    src = f.read_text(encoding='utf-8', errors='ignore')
    for m in tooltip_open.finditer(src):
        # 找到该 Tooltip 的 title= 值（截取其后的块，最多到该标签结束的 '>'）
        seg = src[m.start(): m.start() + 4000]
        tm = re.search(r'title=', seg)
        if not tm:
            continue
        j = tm.end()
        if j >= len(seg):
            continue
        ch = seg[j]
        if ch == '{':
            end = find_matching_paren(seg, j)
            val = seg[j:end + 1] if end != -1 else seg[j:j + 300]
        elif ch in ('"', "'"):
            end = seg.find(ch, j + 1)
            val = seg[j:end] if end != -1 else seg[j:j + 300]
        else:
            continue
        vl = visible_len(val)
        sm = sentence_marks(val)
        # 只报告“长说明型”：可见文本 >= 40 或 句读 >= 2
        if vl >= 40 or sm >= 2:
            line = src[:m.start()].count('\n') + 1
            results.append((vl, sm, str(f), line, re.sub(r'\s+', ' ', val)[:120]))

results.sort(reverse=True)
print(f'共发现 {len(results)} 个“长说明型” Tooltip：\n')
for vl, sm, path, line, preview in results:
    print(f'[{vl:>3}字/{sm}句] {path}:{line}\n        {preview}\n')
