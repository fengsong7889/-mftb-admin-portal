#!/usr/bin/env python3
"""engineering/systems.json 生成器（可重跑）。

为什么需要它：分系统独立工程改造方案 §4.1/P0 要求「建立系统、文件、表、接口和任务归属清单，
检测重叠、遗漏、循环与跨事务写入」，并且 §4.1 明确「菜单归属是起点，不是唯一依据」。
清单若靠手抄，三个月后必然与代码脱节，于是把它做成可重跑的派生产物 + 人工补充段的合并：

  · 权威派生：sys_menu.system_code（DB 快照）× menuDataSource.keyToPath × App.tsx 路由 → 前端页面目录
  · 人工补充：非菜单直达的子页面目录、后端类名前缀归属（逐条带 evidence 标注）
  · 显式未归属：任何既没被派生命中、也没被人工登记的前端目录 / 后端类名前缀，都会进
    unattributed 快照，由 scripts/check-engineering-registry.mjs 做双向棘轮校验

DB 快照已随表入库（engineering/menu-system-snapshot.json），刷新方式：python3 engineering/probe-menu-system.py
（只读查询 sys_menu，凭据取自 gitignore 的 backend/.env.local，脚本不落盘任何凭据）。
"""
import json
import os
import re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

SNAPSHOT = 'engineering/menu-system-snapshot.json'
REGISTRY = 'engineering/systems.json'

# ────────────── 公共层（不属于任何业务系统） ──────────────
SHARED_FRONTEND_DIRS = ['_shared']

# ────────────── 人工补充的前端目录归属 ──────────────
# evidence: naming=按目录用途与调用方确认；menu=由菜单路由派生（不在此列）
EXTRA_FRONTEND_DIRS = {
    'ads': [('PromotionOrderManage', '推广订单管理，广告销售子页面'),
            ('PromotionOrderManageStandalone', '推广订单独立入口，同上'),
            ('OrderDetail', '推广订单详情，广告/团购订单子页面'),
            ('waterfallConfig', '瀑布流配置类型与组件，广告推荐域'),
            ('GiftManage', '进店领券/赠送子页面（若菜单已派生则重复无害）')],
    'eam': [('AssetTagView', '资产标签打印预览，资产域子页面'),
            ('AssetClaimSign', '资产领用签收（免登/扫码入口），资产域'),
            ('MyAssets', '我的资产（员工自助查看），数据属资产域'),
            ('BrandProductLibrary', '品牌产品库，资产基础数据')],
    'finance': [('DebtDetail', '欠款单明细，财务域子页面')],
    'hr': [('HcmBlueprint', '人事蓝图/组织可视化，HR 域子页面')],
    'iam': [('LoginLog', '登录审计，方案 §三 归权限中心')],
    'meeting': [('MeetingCheckin', '会议签到'), ('MeetingView', '会议免登查看'),
                ('MeetingMinutesView', '会议纪要免登查看')],
    'search': [('HintCreate', '搜索提示新建'), ('HintPreview', '搜索提示预览'),
               ('HotSearchPreview', '热词预览'), ('SearchVerifyDetail', '效果校验详情')],
    'platform': [('NotificationChannelForm', '通知渠道配置表单'),
                 ('PageDescriptionEditor', '页面说明/帮助文案编辑器')],
    'rdm': [('RdmDailyReportView', '日报免登看板'), ('PagePRDView', 'PRD 免登查看')],
    'i18n': [('TranslationManage', '翻译管理')],
    'merchant': [('MapPlanning', '地图规划，商户运营域')],
    'portal': [('Portal', '集团门户首页'), ('Login', '登录入口，属门户公共壳')],
    'ai': [('AiAssistantConfig', 'AI 助手提示词/能力配置，AI 管理域')],
}

# ────────────── 显式未归属（带原因，不假装归属） ──────────────
UNATTRIBUTED_DIR_NOTES = {
    'ApprovalDetail': '跨系统审批详情共用页（财务/OA/RDM/系统权限均落入此页），'
                      'P2 需决定归入门户公共壳还是按域拆分，不得强行归一个系统',
    'AppPreview': '预览壳页面，调用方与菜单归属未逐条核实，待补证后登记',
}

# ────────────── 后端类名前缀归属 ──────────────
# evidence 标注取证方式；未列出的前缀一律进 unattributed，由门禁强制显式确认
BACKEND_PREFIXES = {
    'rdm': ['Rdm'],
    'eam': ['Eam', 'Vehicle', 'Consumable'],
    'hr': ['Hr', 'Hcm', 'Emp', 'Employee', 'Position', 'Emergency', 'Contract', 'Org'],
    'attendance': ['Attendance', 'Att'],
    'payroll': ['Payroll', 'Salary'],
    'ads': ['Ad', 'Organic', 'Flash', 'Gift', 'Card', 'Activity'],
    'finance': ['Fin'],
    'ai': ['Ai', 'Agent', 'Llm', 'Mcp'],
    'meeting': ['Meeting', 'Mt'],
    'doc': ['Doc'],
    'oa': ['Oa', 'Workflow', 'Approver'],
    'merchant': ['Merchant', 'Store', 'Biz'],
    'iam': ['Role', 'Permission', 'Authorization', 'Data', 'Menu'],
    'platform': ['Sys', 'System', 'Notification', 'Translation', 'Version', 'Schema',
                 'Migration', 'Word', 'Ding', 'Api', 'Avatar', 'Batch', 'Date'],
    'search': ['Search', 'Hint', 'HotSearch', 'StopWord', 'Synonym'],
    'portal': ['Portal', 'Home'],
}

# ────────────── 已知多系统共享目录（重叠必须显式承认） ──────────────
# 注：Hcm 已整体迁入 frontend/apps/hr（构造即归属 hr），故从多系统共享例外中移除
MULTI_OWNER_EXCEPTIONS = {
    'Permission': '权限管理页面群：菜单分属 hr / attendance / iam（员工授权、考勤授权、授权中心），'
                  '物理上仍是同一个目录，P2 拆应用时需按系统拆到各自 app 或留公共壳',
    'LoginLog': '登录审计页：菜单同时挂在 HR（员工行为审计）与权限中心（账号安全）下，'
                '属两个系统共用的只读列表，P2 归入权限中心后由 HR 侧跳转',
}

SYSTEM_NAMES = {
    'portal': '企业门户', 'ads': '广告与推广系统', 'merchant': '商户运营系统',
    'seller': '店鋪經營系統', 'search': '搜索运营系统', 'finance': '财务系统',
    'ai': 'AI 管理系统', 'hr': 'HR 系统', 'organization': '组织架构系统',
    'payroll': '薪酬系统', 'attendance': '考勤系统', 'eam': '物资管理系统',
    'rdm': '产研交付系统', 'oa': '流程审批系统', 'meeting': '会议系统',
    'iam': '权限中心', 'platform': '平台支撑系统', 'i18n': '多语言系统', 'doc': '文档中心',
}

# 本期（分系统独立工程改造方案 §一）确认优先隔离的三个域
PRIORITY_SYSTEMS = ['rdm', 'eam', 'hr']


def load_snapshot():
    with open(SNAPSHOT, encoding='utf-8') as fh:
        return json.load(fh)


def route_to_dir():
    # 拆包后 App.tsx 的页面引用统一走 '@/pages/...' 别名（见 rewrite-package-relative-imports.mjs），
    # 因此 './pages/' 与 '@/pages/' 两种写法都要认
    app = open('src/App.tsx', encoding='utf-8').read()
    var = {}
    for n, s in re.findall(r"const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\(['\"]@?/?(?:\./)?([^'\"]+)['\"]\)", app):
        var[n] = s.lstrip('/')
    for n, s in re.findall(r"import\s+(\w+)\s+from\s+['\"]@?/?(?:\./)?([^'\"]+)['\"]", app):
        var.setdefault(n, s.lstrip('/'))
    routes = {}
    for p, e in re.findall(r'<Route\s+path="([^"]*)"[^>]*element=\{<(\w+)', app):
        dv = var.get(e, '')
        if dv.startswith('pages/'):
            routes['/' + p.strip('/')] = dv.split('/')[1]
    return routes



def key_to_path():
    text = open('frontend/packages/contracts/src/constants/menuDataSource.ts', encoding='utf-8').read()
    block = re.search(r"keyToPath[^{]*\{([\s\S]*?)\n\}", text)
    return dict(re.findall(r"'([a-zA-Z0-9_-]+)'\s*:\s*'(/[^']*)'", block.group(1) if block else ''))


# 后端业务源码根：legacy（未拆出的域）+ 已拆出的域模块。
# shared/platform-core/contracts 是平台层，不属于任何业务系统，故不计入前缀归属。
BACKEND_DOMAIN_ROOTS = [
    'backend/modules/legacy/src/main/java/com/mftb/admin',
    'backend/modules/rdm/src/main/java/com/mftb/admin',
    'backend/modules/eam/src/main/java/com/mftb/admin',
    'backend/modules/hr/src/main/java/com/mftb/admin',
]


def backend_prefixes():
    counts = defaultdict(int)
    for root in BACKEND_DOMAIN_ROOTS:
        for dp, _, fns in os.walk(root):
            for fn in fns:
                if fn.endswith('.java'):
                    m = re.match(r'([A-Z][a-z0-9]*)', fn[:-5])
                    counts[m.group(1) if m else 'unknown'] += 1
    return counts


def test_counts(dirs, prefixes):
    """每个系统的特征回归数量：前端 *.test.* 文件数 + 后端 *Test.java 类数。

    方案 §六 要求「每个领域先建立特征回归，再移动代码」；把数量写进登记表后，
    check-engineering-registry 会拒绝「回归变少」（只允许变多），防止搬迁过程中悄悄丢测试。
    """
    fe = 0
    for d in dirs:
        base = os.path.join('src/pages', d)
        if not os.path.isdir(base):
            base = next((os.path.join('frontend/apps', c, 'src/pages', d) for c in os.listdir('frontend/apps')
                           if os.path.isdir(os.path.join('frontend/apps', c, 'src/pages', d))), None)
        if not base or not os.path.isdir(base):
            continue
        for dp, _, fns in os.walk(base):
            fe += sum(1 for fn in fns if re.search(r'\.(test|spec)\.(ts|tsx)$', fn))
    be = 0
    root = 'backend/bootstrap/src/test/java/com/mftb/admin'
    for dp, _, fns in os.walk(root):
        for fn in fns:
            if fn.endswith('Test.java'):
                m = re.match(r'([A-Z][a-z0-9]*)', fn[:-len('Test.java')])
                if m and m.group(1) in prefixes:
                    be += 1
    return {'frontend': fe, 'backend': be}


def main():
    snap = load_snapshot()
    sys_by_key = snap['system_by_key']
    path_by_key = snap['path_by_key']
    routes = route_to_dir()
    k2p = key_to_path()

    def resolve(path):
        norm = '/' + path.strip('/')
        if norm in routes:
            return routes[norm]
        best, bl = None, -1
        for rp, dv in routes.items():
            if rp != '/' and norm.startswith(rp.rstrip('/') + '/') and len(rp) > bl:
                best, bl = dv, len(rp)
        return best

    derived = defaultdict(lambda: defaultdict(list))  # system -> dir -> []
    # 路径取数：DB 的 sys_menu.path 为准，缺失时回落前端 menuDataSource.keyToPath（菜单注册真值）
    for key, s in sys_by_key.items():
        path = path_by_key.get(key) or k2p.get(key)
        if not path:
            continue
        dv = resolve(path)
        if dv:
            derived[s][dv].append(key)

    page_dirs = sorted(d for d in os.listdir('src/pages') if os.path.isdir(f'src/pages/{d}'))
    # 已拆出的应用：其 src/pages/<Dir> 直接归属该应用对应系统（构造即真值，不再靠菜单派生）
    apps_root = 'frontend/apps'
    app_dirs = {}
    if os.path.isdir(apps_root):
        for code in sorted(os.listdir(apps_root)):
            pdir = os.path.join(apps_root, code, 'src', 'pages')
            if not os.path.isdir(pdir):
                continue
            for d in sorted(os.listdir(pdir)):
                if os.path.isdir(os.path.join(pdir, d)):
                    page_dirs.append(d)
                    app_dirs.setdefault(code, []).append(d)
    page_dirs = sorted(set(page_dirs))
    pref_counts = backend_prefixes()

    claimed = set(SHARED_FRONTEND_DIRS)
    systems = {}
    codes = sorted(set(list(sys_by_key.values())) | set(systems) | set(EXTRA_FRONTEND_DIRS) | set(BACKEND_PREFIXES))
    for code in codes:
        dirs = {}
        for dv, keys in derived.get(code, {}).items():
            dirs[dv] = {'evidence': 'menu-route', 'menuKeys': sorted(set(keys))}
        for dv, why in EXTRA_FRONTEND_DIRS.get(code, []):
            if dv in dirs:
                continue
            dirs[dv] = {'evidence': 'naming', 'reason': why}
        for d in app_dirs.get(code, []):
            dirs.setdefault(d, {})['evidence'] = 'app-slice'
        claimed |= set(dirs)
        prefixes = {}
        for p in BACKEND_PREFIXES.get(code, []):
            if p not in pref_counts:
                # 人工映射写错/类已被重命名：不写进登记表，否则门禁会抳看
                # 「已归属但代码中不存在」的假条目，拖慢下一次改动
                print(f'   ⚠ 跳过不存在的后端前缀 {p}*（系统 {code}）')
                continue
            prefixes[p] = pref_counts[p]
        systems[code] = {
            'name': SYSTEM_NAMES.get(code, code),
            'priority': code in PRIORITY_SYSTEMS,
            'isolation': {
                'frontend': 'isolated' if os.path.isdir(f'frontend/apps/{code}') else 'pending',
                'backend': 'isolated' if os.path.isdir(f'backend/modules/{code}') else 'pending',
            },
            'planned': {'frontendApp': f'frontend/apps/{code}', 'backendModule': f'backend/modules/{code}'},
            'frontendDirs': dict(sorted(dirs.items())),
            'backendPrefixes': dict(sorted(prefixes.items(), key=lambda kv: -kv[1])),
            'testCounts': test_counts(list(dirs), set(prefixes)),
        }

    unclaimed_dirs = [{'dir': d, 'reason': UNATTRIBUTED_DIR_NOTES.get(d, '未登记：新增页面目录必须先声明归属')}
                      for d in page_dirs if d not in claimed]
    used_prefixes = {p for v in BACKEND_PREFIXES.values() for p in v}
    unclaimed_prefixes = {p: c for p, c in sorted(pref_counts.items(), key=lambda kv: -kv[1])
                          if p not in used_prefixes}

    out = {
        '$comment': [
            '工程归属登记表（分系统独立工程改造方案 §4.1 / P0 产物）。',
            '派生部分由 engineering/generate-systems.py 重跑生成；人工补充段在该脚本内维护。',
            'isolation=isolated 只有在对应 app/module 目录真实存在时才会被写出，',
            'scripts/check-engineering-registry.mjs 会拒绝「声称已独立但目录不存在」的假声明。',
            'unattributed 是显式的未归属清单：新增未登记的前端目录或后端类名前缀都会让门禁失败，',
            '已归属却未从这里移除同样失败 —— 与 boundary-baseline 相同的双向棘轮口径。',
        ],
        'generatedFrom': {
            'menuSnapshotRows': snap['live_rows'],
            'menuSnapshotNote': 'sys_menu 中 deleted=0 且 status=1 的菜单；重跑方式见 engineering/README.md',
        },
        'sharedFrontendDirs': SHARED_FRONTEND_DIRS,
        'multiOwnerExceptions': MULTI_OWNER_EXCEPTIONS,
        'systems': systems,
        'unattributed': {
            'frontendDirs': unclaimed_dirs,
            'backendPrefixes': unclaimed_prefixes,
        },
    }
    with open(REGISTRY, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
        fh.write('\n')

    print(f'系统数 = {len(systems)}')
    print(f'已归属前端目录 = {len(claimed - set(SHARED_FRONTEND_DIRS))} / {len(page_dirs)}')
    print(f'未归属前端目录 = {unclaimed_dirs}')
    print(f'未归属后端前缀数 = {len(unclaimed_prefixes)}（合计 {sum(unclaimed_prefixes.values())} 个类文件）')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
