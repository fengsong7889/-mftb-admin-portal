#!/usr/bin/env python3
"""后端域耦合分析（可重跑）：统计「待拆域」与其余 legacy 代码的双向引用面。

为什么需要它：方案 §4.1/§5.2 要求「建立系统、文件、表、任务和测试归属清单，检测重叠、遗漏、循环」。
RDM/EAM 已拆成独立模块后，下一个候选（HR）能不能拆，不能靠“看起来耦合多”这种主观判断：
这里把每个候选域的反向引用条目、涉及文件、最重的前缀逐条量化，
并由 scripts/check-engineering-registry.mjs 做棘轮比对（只允许减少，不允许新增）。

输入：backend/modules/legacy 的 Java 源码（已拆出的域模块不在统计范围）。
输出：engineering/domain-coupling.json（提交入库，作为下一步切片的准入证据）
"""
import json
import os
import re
from collections import Counter, defaultdict

# 路径一律基于脚本自身定位，避免「从 repo 根跑」和「从 backend 跑」产出不同结果
ENGINEERING_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(ENGINEERING_DIR)
LEGACY = os.path.join(REPO_ROOT, 'backend', 'modules', 'legacy', 'src', 'main', 'java', 'com', 'mftb', 'admin')
OUT = os.path.join(ENGINEERING_DIR, 'domain-coupling.json')

# 候选域 → 类名前缀。前缀来自 engineering/systems.json 的归属约定。
CANDIDATES = {
    'hr': ['Hr', 'Hcm', 'Employee', 'Position', 'Contract'],
    'attendance': ['Attendance'],
    'payroll': ['Payroll'],
    'finance': ['Fin', 'Finance'],
    'oa': ['Oa'],
    'ai': ['Ai', 'Agent', 'Llm'],
    'ads': ['Ad'],
    'doc': ['Doc'],
    'meeting': ['Meeting'],
    'search': ['Search', 'Synonym', 'StopWord'],
}


def source_files():
    out = []
    for dp, _, fns in os.walk(LEGACY):
        for fn in fns:
            if fn.endswith('.java'):
                out.append(os.path.join(dp, fn))
    return out


def strip_comments(code):
    code = re.sub(r'//[^\n]*', '', code)
    code = re.sub(r'/\*[\s\S]*?\*/', '', code)
    code = re.sub(r'"[^"\n]*"', '', code)
    return code


def main():
    files = source_files()
    index = {os.path.basename(p)[:-5]: p for p in files}
    result = {'$comment': [
        '待拆域的双向引用面（方案 §4.1 归属清单的可执行版本）。',
        'forward = 该域类引用了多少个非本域类；reverse = 非本域类引用了多少个该域类。',
        '新增编码请重跑 python3 engineering/analyze-domain-coupling.py；',
        'scripts/check-engineering-registry.mjs 会对 reverse 条目做棘轮比对（只允许减少）。',
    ], 'domains': {}}

    for domain, prefixes in CANDIDATES.items():
        def in_domain(name):
            return any(name.startswith(p) for p in prefixes)

        domain_files = [p for p in files if in_domain(os.path.basename(p)[:-5])]
        if not domain_files:
            continue
        forward = set()
        for p in domain_files:
            for ident in re.findall(r'\b([A-Z][A-Za-z0-9_]*)\b', strip_comments(open(p, encoding='utf-8').read())):
                if ident in index and not in_domain(ident):
                    forward.add(ident)
        reverse = Counter()
        reverse_files = defaultdict(set)
        for p in files:
            name = os.path.basename(p)[:-5]
            if in_domain(name):
                continue
            for ident in set(re.findall(r'\b([A-Z][A-Za-z0-9_]*)\b', strip_comments(open(p, encoding='utf-8').read()))):
                if ident in index and in_domain(ident):
                    reverse[ident] += 1
                    reverse_files[ident].add(name)
        result['domains'][domain] = {
            'prefixes': prefixes,
            'classCount': len(domain_files),
            'forwardClasses': len(forward),
            'reverseClasses': len(reverse),
            'reverseFiles': len(set().union(*reverse_files.values())) if reverse_files else 0,
            'reverseEdges': [
                {
                    'class': c,
                    'referencingFiles': len(reverse_files[c]),
                    'examples': sorted(reverse_files[c])[:3],
                }
                for c in sorted(reverse, key=lambda k: (-reverse[k], k))
            ],
        }

    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    for domain, data in result['domains'].items():
        print(f"{domain:11} classes={data['classCount']:4} forward={data['forwardClasses']:3} "
              f"reverse={data['reverseClasses']:3} files={data['reverseFiles']:3}")


if __name__ == '__main__':
    main()
