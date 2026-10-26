#!/usr/bin/env python3
"""P0 归属取证：从 sys_menu 读取菜单 → 系统归属，导出到本地 scratch 供 engineering/systems.json 编写。

只读查询，不写库；不打印任何凭据。
"""
import json
import os
import re
import sys

ENV = 'backend/.env.local'


def load_env(path):
    out = {}
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            out[k] = v.strip().strip('"').strip("'")
    return out


def main():
    env = load_env(ENV)
    url = env.get('DB_URL', '')
    m = re.match(r'jdbc:mysql://([^:/]+):(\d+)/([^?;]+)', url)
    if not m:
        print('DB_URL 解析失败（不回显内容）', file=sys.stderr)
        return 2
    host, port, db = m.group(1), int(m.group(2)), m.group(3)

    import pymysql
    conn = pymysql.connect(
        host=host, port=port, user=env['DB_USERNAME'], password=env['DB_PASSWORD'],
        database=db, charset='utf8mb4', connect_timeout=15,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT menu_key, path, system_code, type, status, deleted FROM sys_menu'
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    menus = [
        {'key': r[0], 'path': r[1], 'system': r[2], 'type': r[3], 'status': r[4], 'deleted': r[5]}
        for r in rows
    ]
    live = [x for x in menus if x['deleted'] == 0 and x['status'] == 1]

    by_system = {}
    for x in live:
        by_system.setdefault(x['system'] or '(NULL)', []).append(x['key'])

    out = {
        'total_rows': len(menus),
        'live_rows': len(live),
        'systems': {k: sorted(v) for k, v in sorted(by_system.items())},
        'path_by_key': {x['key']: x['path'] for x in live if x['path']},
        'system_by_key': {x['key']: x['system'] for x in live},
    }
    with open('engineering/menu-system-snapshot.json', 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)

    print(f'live menus={len(live)} systems={len(by_system)}')
    for k, v in sorted(by_system.items()):
        print(f'  {k}: {len(v)}')
    nulls = [x['key'] for x in live if not x['system']]
    print('system_code 为空的叶子菜单数 =', len(nulls))
    print('样例:', nulls[:15])
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
