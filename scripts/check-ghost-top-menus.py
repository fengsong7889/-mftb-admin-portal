#!/usr/bin/env python3
"""只读门禁校验：按 Sidebar 的真实渲染算法反推「进入系统后实际可见的一级菜单」，
与 DB 中的顶级菜单对比，差集即为菜单配置里能看到、但系统内根本不显示的幽灵一级目录。

复刻 src/components/Sidebar.tsx 的 scopeMenusToSystem() + promoteSystemMenus() +
buildMenuItemsFromVO() 三步过滤，避免人工漏判。
"""
import os
import re
import sys

import pymysql


def project_root():
    """脚本位于 <root>/scripts/ 下，上溯两级即仓库根。"""
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_db_env():
    """凭据来源优先级：进程环境变量 → backend/.env.local（已 gitignore）。

    早期版本从 backend/run-local.sh 正则抽取凭据，现已失效：凭据已从脚本移出。
    """
    env_local = os.path.join(project_root(), 'backend', '.env.local')
    text = ''
    if os.path.exists(env_local):
        text = open(env_local, encoding='utf-8').read()

    def pick(key):
        val = os.environ.get(key)
        if val:
            return val
        m = re.search(r"^(?:export\s+)?%s=['\"]?(.*?)['\"]?\s*$" % key, text, re.M)
        return m.group(1) if m else None

    missing = [k for k in ('DB_URL', 'DB_USERNAME', 'DB_PASSWORD') if not pick(k)]
    if missing:
        sys.exit('❌ 缺少数据库环境变量：%s\n   请配置 backend/.env.local（参考 backend/.env.local.example）'
                 % ', '.join(missing))

    url, user, pwd = pick('DB_URL'), pick('DB_USERNAME'), pick('DB_PASSWORD')
    jdbc = url.split('jdbc:mysql://')[1]
    hostport, rest = jdbc.split('/', 1)
    db = rest.split('?', 1)[0]
    host, port = hostport.split(':')
    return dict(host=host, port=int(port), user=user, password=pwd, database=db)


HIDDEN = {'ai-access-request'}  # Sidebar HIDDEN_MENU_KEYS

# v45: 前端 Sidebar 的 SYSTEM_WRAPPER_KEYS 展平硬编码已删除，后端为唯一真值。
# 诊断改为从 DataInitializer 读「已退役壳清单」，并断言它们确实已从库里消失。
DATAINIT = 'backend/src/main/java/com/mftb/admin/config/DataInitializer.java'


def parse_retired_wrappers(root):
    """从 DataInitializer 读 RETIRED_SYSTEM_WRAPPERS，保证清单与代码同源不手抄。"""
    src = open(os.path.join(root, DATAINIT), encoding='utf-8').read()
    block = re.search(r'RETIRED_SYSTEM_WRAPPERS = List\.of\(([\s\S]*?)\);', src)
    if not block:
        sys.exit('未能解析 DataInitializer.RETIRED_SYSTEM_WRAPPERS')
    keys = re.findall(r'"([^"]+)"', block.group(1))
    if not keys:
        sys.exit('RETIRED_SYSTEM_WRAPPERS 解析结果为空')
    return keys


def scope_menus(menus, system_code, inherited=None):
    """scopeMenusToSystem：非本系统的节点用其子节点顶替；有子但子全不属于本系统则整体丢弃。"""
    out = []
    for menu in menus:
        if menu['status'] != 1:
            continue
        owner = menu['systemCode'] if menu['systemCode'] is not None else inherited
        children = scope_menus(menu['children'], system_code, owner)
        if owner != system_code:
            out.extend(children)
            continue
        if menu['children'] and not children:
            continue
        menu = dict(menu, children=children)
        out.append(menu)
    return out


def promote(items, wrappers):
    """promoteSystemMenus：把包装目录用其子节点替换（扁平化）。"""
    out = []
    for item in items:
        if item['menu_key'] in wrappers:
            out.extend(item['children'])
        else:
            out.append(item)
    return out


def main():
    root = project_root()
    retired = parse_retired_wrappers(root)
    conn = pymysql.connect(charset='utf8mb4', **load_db_env())
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cur:
            cur.execute(
                'SELECT id, parent_id, menu_key, name, type, status, system_code, path '
                'FROM sys_menu WHERE deleted = 0 ORDER BY sort_order, id')
            rows = cur.fetchall()
            parent_of = {r['id']: r['parent_id'] for r in rows}
            cur.execute("SELECT code, name FROM sys_system WHERE deleted = 0 AND status = 1 ORDER BY sort_order")
            systems = cur.fetchall()

            ph = ','.join(['%s'] * len(retired))
            cur.execute('SELECT COUNT(*) FROM sys_menu WHERE deleted = 0 AND menu_key IN (' + ph + ')', retired)
            leftovers = next(iter(cur.fetchone().values()))
            cur.execute('SELECT COUNT(*) FROM sys_menu c LEFT JOIN sys_menu p ON c.parent_id = p.id '
                        'WHERE c.deleted = 0 AND c.parent_id IS NOT NULL AND p.id IS NULL')
            dangling = next(iter(cur.fetchone().values()))
            cur.execute("SELECT COUNT(*) FROM sys_menu WHERE deleted = 0 AND parent_id IS NULL "
                        "AND (system_code IS NULL OR system_code = '')")
            top_no_system = next(iter(cur.fetchone().values()))
    finally:
        conn.close()

    by_id = {
        r['id']: dict(
            id=r['id'], menu_key=r['menu_key'], name=r['name'], type=r['type'],
            status=r['status'], systemCode=r['system_code'], path=r['path'], children=[],
        )
        for r in rows
    }
    roots = []
    for node_id, menu in by_id.items():
        parent = by_id.get(parent_of.get(node_id))
        (parent['children'] if parent else roots).append(menu)

    print('=== 退役结果核验 ===')
    print(f'  退役清单 {len(retired)} 个壳，库中仍存在的存活行 : {leftovers}')
    print(f'  存活菜单悬空 parent_id 行数                    : {dangling}')
    print(f'  顶级菜单缺 system_code 行数                    : {top_no_system}')
    print()
    print(f'{"系统":<14}{"DB 顶级菜单":<34}实际可见一级')
    print('-' * 110)
    ghosts = []
    for sysdef in systems:
        code = sysdef['code']
        db_top = [r for r in roots if r['systemCode'] == code]
        scoped = scope_menus(roots, code)
        visible = scoped
        visible_keys = {v['menu_key'] for v in visible if v['menu_key'] not in HIDDEN}
        # 只有「启用中、且未被 HIDDEN_MENU_KEYS 有意隐藏」却进不了侧边栏的顶级菜单
        # 才是幽灵目录；停用菜单与刻意隐藏的入口不算。
        ghost = [r for r in db_top
                 if r['menu_key'] not in visible_keys
                 and r['status'] == 1 and r['menu_key'] not in HIDDEN]
        names = lambda items: ', '.join(i['name'] for i in items) or '—'
        print(f"{sysdef['name']:<14}{names(db_top):<40}{names(visible)}")
        for g in ghost:
            child_cnt = len(g['children'])
            ghosts.append(dict(system=code, system_name=sysdef['name'], id=g['id'], menu_key=g['menu_key'],
                               name=g['name'], status=g['status'], children=child_cnt,
                               child_keys=[c['menu_key'] for c in g['children']]))

    print('=== 幽灵一级目录（菜单配置里可见、进入系统后不展示）===')
    for g in ghosts:
        print(f"  [{g['system']:<9}] id={g['id']:<6} {g['menu_key']:<20} {g['name']:<14} "
              f"status={g['status']} 子菜单={g['children']} -> {', '.join(g['child_keys']) or '无'}")
    print(f'\n合计 {len(ghosts)} 个')
    failed = bool(ghosts) or leftovers or dangling or top_no_system
    print('\n结论:', '❌ 仍有待清理项' if failed else '✅ 幽灵一级目录已清零，结构自洽')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
