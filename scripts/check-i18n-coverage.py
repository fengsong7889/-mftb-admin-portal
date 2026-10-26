#!/usr/bin/env python3
"""全站 i18n 覆盖门禁（含硬编码残留棘轮）。

用法:
  python3 scripts/check-i18n-coverage.py            # 校验，超baseline或key缺失即失败
  python3 scripts/check-i18n-coverage.py --update    # 把当前残留数写为基线（清账后收紧时用）

本脚本与下面两份数据必须同在版本控制里：CI 是从干净 checkout 跑的，历史上它被放在
不入库的 `.qoder/` 下，deploy.yml 的 i18n 步骤因此在 CI 里直接 file not found 而失败。

三件事缺一不可，只查前两项会让"顺手硬编码一行"永远无人拦：
  1. 引用完整性：代码里出现的 t('<ns>.<key>') 必须在 zh-TW 与 en 都能解析
     （项目 fallbackLng='en'，故这两语是硬要求；ja/ko/ru 回落英文，与 HR 域既有口径一致）
  2. 插值规范：必须 {{count}} 双花括号，单花括号 i18next 不解析
  3. 棘轮：每个域"含中文的可见文案行数"不得高于基线，只能降不能升
     —— 存量硬编码分域分批清理期间，用它锁住"别再加新的"。
"""
import glob
import io
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
# 棘轮基线一旦缺失，main() 里 limit 恒为 None，硬编码检查整段跳过却照样输出通过——
# 门禁会绿但什么都不管，所以它和脚本同目录入库，不接受"缺了当没配"。
BASELINE = os.path.join(ROOT, 'scripts', 'i18n-baseline.json')
# 后端 sys_translation 的 field_key 快照：CI 连不到数据库，没有它就会把
# 由后端供文案的 key（asset./transfer./menu. 等 7000+ 条）全判成缺失，门禁直接失去可信度
DB_KEYS = os.path.join(ROOT, 'scripts', 'i18n-db-keys.json')
REQUIRED_LANGS = ['zh-TW', 'en']
ALL_LANGS = ['zh-TW', 'en', 'ja', 'ko', 'ru']

# 域定义：目录 + 该域自有命名空间（common 等公共 ns 单独放行，任何域都可引用）
DOMAINS = {
    'meeting': {
        'dirs': ['src/pages/MeetingManagement', 'src/pages/MeetingCheckin', 'src/pages/MeetingView'],
        'namespaces': ['meeting'],
        # 免登签到/纪要/详情页是钉钉卡片直达的公开页，页面说明文案与后台文案同属该域
        'files_extra': ['src/pages/Home/TodayMeetingCard.tsx', 'src/api/meeting.ts', 'src/api/meetingCheckinPage.ts',
                        'src/api/meetingViewPage.ts'],
    },
    'attendance': {
        'dirs': ['src/pages/Attendance'],
        'namespaces': ['attendance'],
        'files_extra': [],
    },
    'vehicle': {
        'dirs': ['src/pages/VehicleManagement'],
        'namespaces': ['vehicle'],
        'files_extra': [],
    },
    'asset': {
        'dirs': ['src/pages/AssetManagement', 'src/pages/AssetClaimSign', 'src/pages/AssetTagView',
                 'src/pages/MyAssets', 'src/pages/BrandProductLibrary', 'src/pages/Consumable'],
        'namespaces': ['asset', 'assetTag', 'consumable', 'myAssets'],
        'files_extra': [],
    },
    # 产研交付（RDM）：2026-10 深度测试时整个模块不在门禁里，「新增硬编码无人拦」是真实风险
    # （当时已存在 rdm 命名空间但只有 4 个 key、3 处引用）；登记后存量按批次下降，增量一律走 t()。
    # 只收页面层：src/constants/rdm.ts 的枚举 label 表是模块顶层常量（求值早于 i18n 初始化），
    # 不能直接用 hook 版 t()，需先改成 getter/i18n.t 才能纳入，另批处理。
    'rdm': {
        'dirs': ['src/pages/Rdm'],
        'namespaces': ['rdm'],
        'files_extra': [],
    },
}

PUBLIC_NS = ['common', 'menu', 'portal']
KEY_RE = re.compile(r"""(?<![A-Za-z0-9_.])t\(\s*['"`]([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)['"`]""")
# tr(key, 中文兜底) 与控制台模块级 i18n.t 同样是引用入口，漏掉就查不到
REF_RE = re.compile(r"""(?<![A-Za-z0-9_.])(?:tr|i18n\.t|t)\(\s*['"`]([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)['"`]""")
SINGLE_BRACE_RE = re.compile(r'(?<!\{)\{([a-zA-Z]+)\}(?!\})')
CJK_RE = re.compile(r'[\u3400-\u9fff]')
DEFAULT_VALUE_RE = re.compile(r"defaultValue:\s*'(?:[^'\\\\]|\\\\.)*'")


def flatten(node, prefix):
    """把嵌套语言包摊平成 {'ns.a.b': value}，用于按域比对两语 key 集合"""
    out = {}
    if not isinstance(node, dict):
        return out
    for key, value in node.items():
        dotted = f'{prefix}.{key}'
        if isinstance(value, dict):
            out.update(flatten(value, dotted))
        else:
            out[dotted] = value
    return out



def load_db_keys():
    if not os.path.exists(DB_KEYS):
        return set()
    return set(json.load(io.open(DB_KEYS, encoding='utf-8')))


def snapshot_db_keys():
    """从开发库把 field_key 导出成快照（只在本地跑，CI 只读快照）"""
    import pymysql
    env = {}
    for line in io.open(os.path.join(ROOT, 'backend', '.env.local'), encoding='utf-8'):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    body = env['DB_URL'].split('?')[0][len('jdbc:mysql://'):]
    hostport, dbname = body.split('/')[0], body.split('/')[1].split('/')[0]
    conn = pymysql.connect(host=hostport.split(':')[0], port=int(hostport.split(':')[1]),
                           user=env['DB_USERNAME'], password=env['DB_PASSWORD'],
                           database=dbname, charset='utf8mb4')
    cur = conn.cursor()
    cur.execute('SELECT field_key FROM sys_translation')
    keys = sorted(row[0] for row in cur.fetchall())
    conn.close()
    json.dump(keys, io.open(DB_KEYS, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(f'已导出后端语言包 key 快照 {len(keys)} 条 → {DB_KEYS}')


def load_locale(lang):
    path = os.path.join(ROOT, 'src', 'i18n', 'locales', f'{lang}.json')
    return json.load(io.open(path, encoding='utf-8'))


def resolves(data, dotted):
    node = data
    for part in dotted.split('.'):
        if not isinstance(node, dict) or part not in node:
            return False
        node = node[part]
    return not isinstance(node, dict)


def find_dotted_keys(node, prefix=''):
    """找出「带点扁平键」：如 agentConsole 下的 "agentConsole.s00"。
    i18next 按点路径解析，这类键永远查不到，且中英两侧同时错位时一致性比对检不出来。"""
    out = []
    if isinstance(node, dict):
        for key, value in node.items():
            if '.' in key:
                out.append(f'{prefix}{key}')
            out.extend(find_dotted_keys(value, f'{prefix}{key}.'))
    return out


def all_source_files():
    out = []
    for root, _dirs, names in os.walk(os.path.join(ROOT, 'src')):
        if os.sep + 'i18n' + os.sep in root + os.sep:
            continue
        for name in names:
            if name.endswith(('.ts', '.tsx')) and '.test.' not in name:
                out.append(os.path.join(root, name))
    return sorted(out)


def check_references(problems, locales, db_keys):
    """全局引用解析：t()/tr()/i18n.t() 的静态 key 必须在 zh-TW 与 en 都能解析。

    旧逻辑只在 DOMAINS 登记的域内检查，域外命名空间（如 agentConsole）整段漏检；
    2026-10 的「带点扁平键」事故就是借此逃过门禁的，故改为全 src 扫描。
    """
    refs = 0
    missing = []
    for path in all_source_files():
        rel = os.path.relpath(path, ROOT)
        text = strip_comments(io.open(path, encoding='utf-8').read())
        for match in REF_RE.finditer(text):
            key = match.group(1)
            # 形如 t('mcpService.transport_' + x) 的前缀拼接不是完整 key，按动态处理跳过
            tail = text[match.end():match.end() + 8].lstrip()
            if tail.startswith('+'):
                continue
            refs += 1
            if key.split('.')[0] in db_keys or key in db_keys:
                continue
            ok = [lang for lang in REQUIRED_LANGS if resolves(locales[lang], key)]
            if not ok:
                missing.append(f'{rel}: 引用 "{key}" 在 zh-TW/en 均无法解析 → 英文界面会回落 defaultValue（中文）')
            elif len(ok) != len(REQUIRED_LANGS):
                for lang in REQUIRED_LANGS:
                    if lang not in ok:
                        missing.append(f'{rel}: 引用 "{key}" 在 {lang}.json 缺失（另一语已有，切换语言会串）')
    return refs, missing


def collect_files(domain):
    out = []
    for directory in domain['dirs']:
        abs_dir = os.path.join(ROOT, directory)
        for suffix in ('.tsx', '.ts'):
            for root, _dirs, names in os.walk(abs_dir):
                for name in names:
                    if name.endswith(suffix) and '.test.' not in name:
                        out.append(os.path.join(root, name))
    for extra in domain['files_extra']:
        path = os.path.join(ROOT, extra)
        if os.path.isfile(path) and '.test.' not in path:
            out.append(path)
    return sorted(out)


def strip_comments(text):
    text = re.sub(r'/\*[\s\S]*?\*/', '', text)
    text = re.sub(r'\{/\*[\s\S]*?\*/\}', '', text)
    text = re.sub(r'(?m)^\s*//.*$', '', text)
    return text


def main():
    if '--snapshot-db' in sys.argv:
        snapshot_db_keys()
        return 0
    update = '--update' in sys.argv
    locales = {lang: load_locale(lang) for lang in ALL_LANGS}
    baseline = {}
    if os.path.exists(BASELINE):
        baseline = json.load(io.open(BASELINE, encoding='utf-8'))

    problems = []
    counts = {}
    db_keys = load_db_keys()
    for name, domain in DOMAINS.items():
        files = collect_files(domain)
        hardcoded = 0
        for path in files:
            rel = os.path.relpath(path, ROOT)
            text = strip_comments(io.open(path, encoding='utf-8').read())
            rel_lines = 0
            for line in text.splitlines():
                # defaultValue 里的繁体原文不算硬编码：那是 i18next 的兜底真值，B 方案要求这么写。
                # 真正的硬编码 = 剥掉 defaultValue 字符串之后仍然剩中文（例如枚举 label、拼接句子）
                residue = DEFAULT_VALUE_RE.sub('', line)
                if CJK_RE.search(residue):
                    rel_lines += 1
            hardcoded += rel_lines
        counts[name] = hardcoded
        limit = baseline.get(name)
        if not update and limit is not None and hardcoded > limit:
            problems.append(
                f'域 {name} 硬编码中文行数 {hardcoded} 超过基线 {limit}（+{hardcoded - limit}）：'
                f'新增文案必须走 t()，不得硬编码；确属存量清理导致的路径变动请一并说明后 --update')

    if update:
        # 写基线发生在引用解析之前，这里先算一次，避免 UnboundLocalError
        _refs, _missing = check_references([], locales, db_keys)
        counts['_refsMissing'] = len(_missing)
        json.dump(counts, io.open(BASELINE, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
        print('基线已写入:', counts)
        return 0

    # 插值与两语对齐都要在语言包上查：i18next 只解析文案里的 {{x}}，
    # 而"只加了一种语言"是规模化改造最常见的漏项（第二语言回落英文，繁体界面反而正常，很难靠肉眼发现）
    for name, domain in DOMAINS.items():
        for ns in domain['namespaces']:
            tw_keys = set(flatten(locales['zh-TW'].get(ns, {}), ns))
            en_keys = set(flatten(locales['en'].get(ns, {}), ns))
            for lang in REQUIRED_LANGS:
                for bad in find_dotted_keys(locales[lang].get(ns, {})):
                    problems.append(f'{lang}.json: {ns}.{bad} 是「带点扁平键」，i18next 按点路径查不到，必须拆成嵌套结构')
            for key in sorted(tw_keys - en_keys):
                problems.append(f'语言包 {ns} 域 {name}: {key} 在 en.json 缺失（会回落成英文 key 或空白）')
            for key in sorted(en_keys - tw_keys):
                problems.append(f'语言包 {ns} 域 {name}: {key} 在 zh-TW.json 缺失（默认语言看不到中文）')
            for lang in REQUIRED_LANGS:
                node = locales[lang].get(ns, {})
                if not isinstance(node, dict):
                    continue
                for key, value in flatten(node, ns).items():
                    if isinstance(value, str) and SINGLE_BRACE_RE.search(value):
                        problems.append(f'{lang}.json: {key} 的插值写成单花括号，i18next 不解析：{value[:40]}')

    refs, missing = check_references(problems, locales, db_keys)
    ref_limit = baseline.get('_refsMissing')
    print(f'引用解析：扫描 {refs} 条静态 key，无法解析 {len(missing)} 条（基线 {ref_limit if ref_limit is not None else "未设定"}）')
    if update:
        counts['_refsMissing'] = len(missing)
    elif ref_limit is None:
        problems.append(f'引用解析基线缺失，请先执行 --update 固化存量（当前 {len(missing)} 条）')
    elif len(missing) > ref_limit:
        problems.append(f'引用解析失败数 {len(missing)} 超过基线 {ref_limit}（新增 {len(missing) - ref_limit} 条）：新增文案必须同时登记 zh-TW/en')
        problems.extend(missing[:40])
    else:
        print(f'  ✅ 未超过基线（可清理存量后 --update 收紧）')

    print('硬编码中文行数（域 → 基线 → 当前）:')
    for name, value in counts.items():
        flag = '✅' if baseline.get(name) is None or value <= baseline[name] else '❌'
        print(f'  {flag} {name:11s} baseline={baseline.get(name, "未设定"):>6} now={value:>6}')

    if problems:
        print(f'\n❌ i18n 覆盖检查失败，{len(problems)} 项：')
        for p in problems[:60]:
            print('  -', p)
        if len(problems) > 60:
            print(f'  ...另有 {len(problems) - 60} 项')
        return 1
    print('\n✅ i18n 覆盖检查通过（引用完整、插值规范、无新增硬编码）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
