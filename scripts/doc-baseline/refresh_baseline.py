#!/usr/bin/env python3
"""从源库导出可重放基线：结构 + 最小配置种子（不含用户/业务数据/敏感配置值）。

源库连接只从环境变量读取，禁止把凭据写入仓库：
  BASELINE_SOURCE_DB_URL / BASELINE_SOURCE_DB_USERNAME / BASELINE_SOURCE_DB_PASSWORD
未设置时回落到 DB_URL / DB_USERNAME / DB_PASSWORD（本机 backend/.env.local 的变量名）。

输出：
  backend/sql/baseline/doc_baseline_schema.sql
  backend/sql/baseline/doc_baseline_seed.sql
"""
import os
import re
import sys
from datetime import date

import gzip

import pymysql
from pymysql.converters import escape_item

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, 'backend', 'sql', 'baseline')

SEED_TABLES = [
    'sys_system', 'sys_menu', 'sys_role', 'sys_role_menu', 'sys_role_system',
    'sys_department', 'sys_position', 'sys_department_menu', 'sys_department_system',
    'sys_schema_version', 'sys_biz_seq_rule', 'biz_workflow_config',
    'sys_permission_revision',
]


def env(name, fallback=None):
    value = os.environ.get(name) or (os.environ.get(fallback) if fallback else None)
    return value


def connect():
    url = env('BASELINE_SOURCE_DB_URL', 'DB_URL')
    user = env('BASELINE_SOURCE_DB_USERNAME', 'DB_USERNAME')
    password = env('BASELINE_SOURCE_DB_PASSWORD', 'DB_PASSWORD')
    if not url or not user:
        sys.exit('缺少 BASELINE_SOURCE_DB_URL/USERNAME（或 DB_URL/DB_USERNAME）')
    m = re.match(r'jdbc:mysql://([^:]+):(\d+)/([^?]+)', url)
    if not m:
        sys.exit('DB_URL 格式必须为 jdbc:mysql://host:port/db?...')
    return pymysql.connect(host=m.group(1), port=int(m.group(2)), user=user, password=password,
                           database=m.group(3), connect_timeout=10, read_timeout=120,
                           charset='utf8mb4', autocommit=True)


def columns(cur, table):
    cur.execute("SELECT COLUMN_NAME,EXTRA FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=%s ORDER BY ORDINAL_POSITION", (table,))
    return [r[0] for r in cur.fetchall() if 'GENERATED' not in (r[1] or '').upper()]


def insert_block(cur, table, where=None):
    cols = columns(cur, table)
    sql = f"SELECT {','.join('`'+c+'`' for c in cols)} FROM `{table}`"
    if where:
        sql += ' WHERE ' + where
    cur.execute(sql)
    rows = cur.fetchall()
    if not rows:
        return ''
    lines = [f'\n-- {table}: {len(rows)} rows']
    col_sql = ','.join('`' + c + '`' for c in cols)
    for start in range(0, len(rows), 100):
        batch = rows[start:start + 100]
        values = ','.join(
            '(' + ','.join(escape_item(v, 'utf8mb4') for v in row) + ')' for row in batch)
        lines.append(f'INSERT INTO `{table}` ({col_sql}) VALUES\n{values};')
    return '\n'.join(lines)


def sanitized_config(cur):
    cols = columns(cur, 'sys_config')
    cur.execute(f"SELECT {','.join('`'+c+'`' for c in cols)} FROM sys_config")
    rows = []
    for row in cur.fetchall():
        item = dict(zip(cols, row))
        key = item.get('config_key')
        item['config_value'] = '3600000' if key == 'session_idle_timeout_ms' else (
            item.get('config_value') or '' if key == 'product_version' else '')
        rows.append(tuple(item[c] for c in cols))
    if not rows:
        return ''
    col_sql = ','.join('`' + c + '`' for c in cols)
    values = ','.join('(' + ','.join(escape_item(v, 'utf8mb4') for v in row) + ')' for row in rows)
    return f'\n-- sys_config: {len(rows)} rows（值已清空，仅保留安全默认）\n' \
           f'INSERT INTO `sys_config` ({col_sql}) VALUES\n{values};'


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT TABLE_NAME,TABLE_TYPE FROM information_schema.TABLES "
                "WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_TYPE,TABLE_NAME")
    objects = cur.fetchall()
    schema_path = os.path.join(OUT_DIR, 'doc_baseline_schema.sql')
    seed_path = os.path.join(OUT_DIR, 'doc_baseline_seed.sql')
    header = (f'-- 自动生成，请勿手改；重新生成：python3 scripts/doc-baseline/refresh_baseline.py\n'
              f'-- 生成日期：{date.today().isoformat()}；对象数：{len(objects)}\n')
    with open(schema_path, 'w', encoding='utf-8') as f:
        f.write(header + 'SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n')
        for name, kind in objects:
            if kind != 'BASE TABLE':
                continue
            cur.execute(f"SHOW CREATE TABLE `{name}`")
            create = '\n'.join(line.rstrip() for line in cur.fetchone()[1].splitlines())
            f.write(f'\nDROP TABLE IF EXISTS `{name}`;\n{create};\n')
        for name, kind in objects:
            if kind != 'VIEW':
                continue
            cur.execute(f"SHOW CREATE VIEW `{name}`")
            create = '\n'.join(line.rstrip() for line in cur.fetchone()[1].splitlines())
            f.write(f'\nDROP VIEW IF EXISTS `{name}`;\n{create};\n')
        f.write('\nSET FOREIGN_KEY_CHECKS=1;\n')

    with open(seed_path, 'w', encoding='utf-8') as f:
        f.write(header + 'SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n')
        for table in SEED_TABLES:
            f.write(insert_block(cur, table))
        f.write(insert_block(cur, 'rdm_flow_config', "scope_key='GLOBAL'"))
        f.write(sanitized_config(cur))
        f.write('\nSET FOREIGN_KEY_CHECKS=1;\n')

    # 翻译语料单独压缩：体积大且与启动强相关，避免 CI 每次启动再逐行同步 8000+ 条
    translation_path = os.path.join(OUT_DIR, 'doc_baseline_translation.sql.gz')
    with gzip.open(translation_path, 'wt', encoding='utf-8', compresslevel=6) as f:
        f.write('SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n')
        f.write(insert_block(cur, 'sys_translation'))
        f.write('\nSET FOREIGN_KEY_CHECKS=1;\n')

    print('schema:', schema_path, os.path.getsize(schema_path) // 1024, 'KB')
    print('seed:', seed_path, os.path.getsize(seed_path) // 1024, 'KB')
    print('translation:', translation_path, os.path.getsize(translation_path) // 1024, 'KB')
    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
