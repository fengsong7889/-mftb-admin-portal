#!/usr/bin/env python3
"""全站 i18n 覆盖门禁（含硬编码残留棘轮）。

用法:
  python3 scripts/check-i18n-coverage.py            # 校验，超baseline或key缺失即失败
  python3 scripts/check-i18n-coverage.py --update    # 把当前残留数写为基线（清账后收紧时用）

本脚本与下面两份数据必须同在版本控制里：CI 是从干净 checkout 跑的，历史上它被放在
不入库的 `.qoder/` 下，deploy.yml 的 i18n 步骤因此在 CI 里直接 file not found 而失败。

四件事缺一不可，只查前两项会让"顺手硬编码一行"永远无人拦：
  1. 引用完整性：代码里出现的 t('<ns>.<key>') 必须在 zh-TW 与 en 都能解析
     （项目 fallbackLng='en'，故这两语是硬要求；ja/ko/ru 回落英文，与 HR 域既有口径一致）
  2. 插值规范：必须 {{count}} 双花括号，单花括号 i18next 不解析
  3. 棘轮：每个域"含中文的可见文案行数"不得高于基线，只能降不能升
     —— 存量硬编码分域分批清理期间，用它锁住"别再加新的"。
  4. 翻译库收录：前端静态包的每个 key 必须同时出现在后端 sys_translation 快照里。
     只查"能不能解析"会把整条多语言链路判成绿：zh-TW/en 有静态包所以永远能解析，
     但没入库的词条在翻译工作台里看不到、业务方无法译成 ja/ko/ru，外语界面就回退英文
     （2026-11-05 实测：门禁全绿而简体中文 48.6% 的字段是英文兜底）。
"""
import glob
import io
import json
import os
import re
import sys
from collections import Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
# 棘轮基线一旦缺失，main() 里 limit 恒为 None，硬编码检查整段跳过却照样输出通过——
# 门禁会绿但什么都不管，所以它和脚本同目录入库，不接受"缺了当没配"。
BASELINE = os.path.join(ROOT, 'scripts', 'i18n-baseline.json')
# 后端 sys_translation 的 field_key 快照：CI 连不到数据库，没有它就会把
# 由后端供文案的 key（asset./transfer./menu. 等 7000+ 条）全判成缺失，门禁直接失去可信度
DB_KEYS = os.path.join(ROOT, 'scripts', 'i18n-db-keys.json')
REQUIRED_LANGS = ['zh-TW', 'en']
ALL_LANGS = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko', 'ru']

# 域定义：目录 + 该域自有命名空间（common 等公共 ns 单独放行，任何域都可引用）
DOMAINS = {
    'meeting': {
        'dirs': ['src/pages/MeetingManagement', 'src/pages/MeetingCheckin', 'src/pages/MeetingView'],
        'namespaces': ['meeting'],
        # 免登签到/纪要/详情页是钉钉卡片直达的公开页，页面说明文案与后台文案同属该域
        'files_extra': ['src/pages/Home/TodayMeetingCard.tsx', 'frontend/packages/platform-client/src/api/meeting.ts', 'frontend/packages/platform-client/src/api/meetingCheckinPage.ts',
                        'frontend/packages/platform-client/src/api/meetingViewPage.ts'],
    },
    'attendance': {
        'dirs': ['src/pages/Attendance'],
        'namespaces': ['attendance'],
        'files_extra': [],
    },
    'vehicle': {
        'dirs': ['frontend/apps/eam/src/pages/VehicleManagement'],
        'namespaces': ['vehicle'],
        'files_extra': [],
    },
    'asset': {
        'dirs': ['frontend/apps/eam/src/pages/AssetManagement', 'frontend/apps/eam/src/pages/AssetClaimSign', 'frontend/apps/eam/src/pages/AssetTagView',
                 'frontend/apps/eam/src/pages/MyAssets', 'frontend/apps/eam/src/pages/BrandProductLibrary',
                 'frontend/apps/eam/src/pages/Consumable'],
        'namespaces': ['asset', 'assetTag', 'consumable', 'myAssets'],
        'files_extra': [],
    },
    # 产研交付（RDM）：2026-10 深度测试时整个模块不在门禁里，「新增硬编码无人拦」是真实风险
    # （当时已存在 rdm 命名空间但只有 4 个 key、3 处引用）；登记后存量按批次下降，增量一律走 t()。
    # 只收页面层：frontend/packages/contracts/src/constants/rdm.ts 的枚举 label 表是模块顶层常量（求值早于 i18n 初始化），
    # 不能直接用 hook 版 t()，需先改成 getter/i18n.t 才能纳入，另批处理。
    'rdm': {
        'dirs': ['frontend/apps/rdm/src/pages/Rdm'],
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
    """从开发库把 field_key 导出成快照（只在本地跑，CI 只读快照）

    必须带 `deleted = 0`：配置表虽然改用物理删除，但退库类迁移（如
    translation:array-keys-cleanup-v1 把数组型 key 从翻译表逻辑删除）留下的就是 deleted=1 行。
    不排掉它们，这份免检名单会持续把「已从翻译表退库的 key」当成后端供数，
    于是引用它们时既不计入未入库、也不逐键解析——等于门禁对这批 key 永久失明。
    """
    conn = _dev_db_conn()
    cur = conn.cursor()
    cur.execute('SELECT field_key FROM sys_translation WHERE deleted = 0')
    keys = sorted(row[0] for row in cur.fetchall())
    conn.close()
    json.dump(keys, io.open(DB_KEYS, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(f'已导出后端语言包 key 快照 {len(keys)} 条 → {DB_KEYS}')


def _dev_db_conn():
    """连开发库（凭据只从 backend/.env.local 读，不得写到任何入库文件）"""
    import pymysql
    env = _load_env_local()
    body = env['DB_URL'].split('?')[0][len('jdbc:mysql://'):]
    hostport, dbname = body.split('/')[0], body.split('/')[1].split('/')[0]
    return pymysql.connect(host=hostport.split(':')[0], port=int(hostport.split(':')[1]),
                           user=env['DB_USERNAME'], password=env['DB_PASSWORD'],
                           database=dbname, charset='utf8mb4')


def _load_env_local():
    env = {}
    path = os.path.join(ROOT, 'backend', '.env.local')
    if not os.path.exists(path):
        raise SystemExit('❌ 缺 backend/.env.local：--snapshot-db / --report 需要开发库连接信息')
    for line in io.open(path, encoding='utf-8'):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def load_locale(lang):
    path = os.path.join(ROOT, 'frontend', 'packages', 'i18n', 'src', 'i18n', 'locales', f'{lang}.json')
    return json.load(io.open(path, encoding='utf-8'))


def resolve_state(data, dotted):
    """返回 None（键不存在）/ 'blank'（存在但空串）/ 'ok'。

    不得把空串当成"已翻译"：i18next 对空值会继续回退，而旧版只判"键在不在"，
    于是 en.json 里 8 个空量词永远查不出来。
    """
    node = data
    for part in dotted.split('.'):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    if isinstance(node, dict):
        return None
    return 'ok' if str(node or '').strip() else 'blank'


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
    # 共享层拆包后（方案 P2）：src/ 与 frontend/packages/ 都要扫；
    # i18n 资源目录自身跳过（含 'i18n' 路径段），避免把语言包当源码扫
    for base in ('src', os.path.join('frontend', 'packages')):
        for root, _dirs, names in os.walk(os.path.join(ROOT, base)):
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

    返回 (引用数, 硬缺失, 空值)。硬缺失与空值分开计数：量词类文案（個/家/週）
    在英文里确实该留空，归入棘轮才能"只降不升"；而真缺键基线仍是 0。
    """
    refs = 0
    missing = []
    blanks = []
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
            # 只跳过「完整键命中 DB 快照」的引用：后端确实供数的 key 不误报，其余一律逐键查。
            # 不得按命名空间前缀整体免检——那要么把裸叶子键误升成前缀（旧 bug，造成静默盲区），
            # 要么把 92 个真命名空间从逐键比对降级成免检（拿覆盖率换绿灯）。
            if key in db_keys:
                continue
            states = {lang: resolve_state(locales[lang], key) for lang in REQUIRED_LANGS}
            absent = [lang for lang, state in states.items() if state is None]
            if len(absent) == len(REQUIRED_LANGS):
                missing.append(f'{rel}: 引用 "{key}" 在 zh-TW/en 均无法解析 → 英文界面会回落 defaultValue（中文）')
            else:
                for lang in absent:
                    missing.append(f'{rel}: 引用 "{key}" 在 {lang}.json 缺失（另一语已有，切换语言会串）')
                for lang, state in states.items():
                    if state == 'blank':
                        blanks.append(f'{rel}: 引用 "{key}" 在 {lang}.json 是空串（界面会渲染成空白）')
    return refs, missing, blanks


def flatten_root(node):
    """从根节点摊平为「无先导点」的点分键。

    不得直接用 flatten(node, '')：它把 prefix 无条件拼成 f'{prefix}.{key}'，
    从根调用会得到 '.accountBalance.colBrand' 这种带先导点的键，
    跟任何真实键都比不上（只能接一个命名空间当 prefix 的调用方）。
    """
    return {key[1:] if key.startswith('.') else key: value
            for key, value in flatten(node, '').items()}


def check_db_capture(locales, db_keys):
    """后端翻译库收录率：前端静态包的每个 key 都必须在 sys_translation 快照里。

    这是"各系统是否真的对接了翻译管理系统"的唯一硬口径。仅查引用能否解析会漏掉整段：
    zh-TW/en 有静态包所以永远能解析，但没入库的词条在翻译工作台里根不存在，
    业务方无从译成 ja/ko/ru，简体中文则完全依赖库里的值。
    快照缺失（没跑过 --snapshot-db）时不判定，避免把环境问题报成漏收。
    """
    if not db_keys:
        return None, []
    # 分母只算扁平文案叶：数组型 key（星期表头、励志语清单等）的真源只能是前端静态包，
    # 它进不了 sys_translation 这张 key→字符串 扁平表（flattenMap 已显式跳过 List），
    # 计入分母就是造 8 个永远填不上的假缺口。dict 与 list 都不是可译文案。
    static_keys = {k for k, v in flatten_root(locales['zh-TW']).items()
                   if not isinstance(v, (dict, list, tuple))}
    gap = sorted(static_keys - set(db_keys))
    return len(gap), gap


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


def report_coverage():
    """六语真实完成度：静态包 ∪ 后端语言包，按「界面能取到非空文案」计数。

    为什么不能拿翻译工作台的完成率当验收口径：那个页面的分母是 sys_translation 里已有的记录，
    而前端静态包里的文案如果没同步进库，它根本不在分母里——
    2026-11-05 就是库里 8504 条全翻完、六语显示 100%，而简体中文实际只能解析 51.4%。
    要看真值必须把前端静态包也拉进分母，就是本命令做的事。
    """
    locales = {lang: load_locale(lang) for lang in ALL_LANGS}
    static = {lang: flatten_root(locales[lang]) for lang in ALL_LANGS}
    conn = _dev_db_conn()
    cur = conn.cursor()
    cur.execute('SELECT field_key, translations_json FROM sys_translation')
    db = {}
    for field_key, raw in cur.fetchall():
        try:
            db[field_key] = json.loads(raw) if raw else {}
        except (ValueError, TypeError):
            db[field_key] = {}
    conn.close()

    universe = set(db)
    for lang in ALL_LANGS:
        universe |= set(static[lang])
    print(f'口径全集（静态包 ∪ sys_translation）：{len(universe)} 个 key，'
          f'其中后端收录 {len(db)} 条')
    print()
    print(f"{'语言':8s} {'能解析':>8s} {'占比':>7s} {'缺失':>7s}  缺失最多的命名空间")
    for lang in ['zh-TW', 'zh-CN', 'en', 'ja', 'ko', 'ru']:
        miss = []
        for key in universe:
            value = static[lang].get(key)
            if isinstance(value, str) and value.strip():
                continue
            db_value = db.get(key, {}).get(lang)
            if isinstance(db_value, str) and db_value.strip():
                continue
            miss.append(key)
        ns = Counter(k.split('.')[0] for k in miss)
        top = ', '.join(f'{name}:{cnt}' for name, cnt in ns.most_common(4)) or '—'
        print(f'{lang:8s} {len(universe) - len(miss):>8d} '
              f'{(len(universe) - len(miss)) / len(universe) * 100:>6.1f}% '
              f'{len(miss):>7d}  {top}')
    print()
    print('说明：静态包只在 zh-TW/zh-CN/en 是全量；ja/ko/ru 只有门户文案，其余靠机翻入库。')
    print('      缺失部分在界面上按 fallbackLng=en 回退英文；补翻需机翻额度（见 backend/.env.local.example）。')
    return 0


def main():
    if '--snapshot-db' in sys.argv:
        snapshot_db_keys()
        return 0
    if '--report' in sys.argv:
        return report_coverage()
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
        _refs, _missing, _blanks = check_references([], locales, db_keys)
        counts['_refsMissing'] = len(_missing)
        counts['_refsBlank'] = len(_blanks)
        counts['_dbGapKeys'] = check_db_capture(locales, db_keys)[0]
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

    refs, missing, blanks = check_references(problems, locales, db_keys)
    ref_limit = baseline.get('_refsMissing')
    print(f'引用解析：扫描 {refs} 条静态 key，无法解析 {len(missing)} 条（基线 {ref_limit if ref_limit is not None else "未设定"}）')
    if ref_limit is None:
        problems.append(f'引用解析基线缺失，请先执行 --update 固化存量（当前 {len(missing)} 条）')
    elif len(missing) > ref_limit:
        problems.append(f'引用解析失败数 {len(missing)} 超过基线 {ref_limit}（新增 {len(missing) - ref_limit} 条）：新增文案必须同时登记 zh-TW/en')
        problems.extend(missing[:40])
    else:
        print(f'  ✅ 未超过基线（可清理存量后 --update 收紧）')

    # 空串在语言包里是「看得到键但渲染为空」，旧版只判键在不在所以永远漏；
    # 存量里确实有故意留空的量词，不能一律阻断，用"只降不升"的棘轮收拢
    blank_limit = baseline.get('_refsBlank')
    print(f'引用空值：{len(blanks)} 处引用在 zh-TW/en 里是空串（基线 {blank_limit if blank_limit is not None else "未设定"}）')
    if blank_limit is None:
        problems.append(f'引用空值基线缺失，请先执行 --update 固化存量（当前 {len(blanks)} 处）')
    elif len(blanks) > blank_limit:
        problems.append(f'引用空值 {len(blanks)} 超过基线 {blank_limit}（新增 {len(blanks) - blank_limit} 处）：新文案不得先登空串')
        problems.extend(blanks[:20])
    else:
        print('  ✅ 未超过基线')

    # 后端翻译库收录率：没入库的词条在翻译工作台里不存在，业务方无法译成 ja/ko/ru
    db_gap, db_gap_keys = check_db_capture(locales, db_keys)
    db_limit = baseline.get('_dbGapKeys')
    if db_gap is None:
        print('翻译库收录：快照缺失（未跑 npm run i18n:snapshot），本次不判定')
    else:
        print(f'翻译库收录：前端静态包有 {db_gap} 个 key 未进 sys_translation（基线 {db_limit if db_limit is not None else "未设定"}）')
        if db_limit is None:
            problems.append(f'翻译库收录基线缺失，请先执行 --update 固化存量（当前 {db_gap} 个 key）')
        elif db_gap > db_limit:
            problems.append(
                f'翻译库未收录 {db_gap} 个静态 key，超过基线 {db_limit}（新增 {db_gap - db_limit} 个）：'
                '跑 npm run i18n:sync-backend + npm run i18n:snapshot 后重启后端；'
                '否则该词条在翻译工作台不存在，ja/ko/ru 与简体中文只能回退英文')
            problems.extend(f'  未入库 key: {k}' for k in db_gap_keys[:20])
        else:
            print('  ✅ 未超过基线')

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
    print('\n✅ i18n 覆盖检查通过（引用完整、无新增硬编码、翻译库已收录）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
