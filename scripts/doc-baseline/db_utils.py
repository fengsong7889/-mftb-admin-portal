"""基线重放共用：JDBC 环境解析、全库清空、SQL 导入、备份/恢复与行数校验。"""
import gzip
import json
import os
import re

import pymysql
from pymysql.constants import CLIENT
from pymysql.converters import escape_item


def parse_jdbc(url):
    m = re.match(r'jdbc:mysql://([^:]+):(\d+)/([^?]+)', url or '')
    if not m:
        raise SystemExit('JDBC URL 必须为 jdbc:mysql://host:port/db?...')
    return m.group(1), int(m.group(2)), m.group(3)


def connect(prefix):
    url = os.environ.get(f'{prefix}_URL')
    user = os.environ.get(f'{prefix}_USERNAME')
    password = os.environ.get(f'{prefix}_PASSWORD', '')
    if not url or user is None:
        raise SystemExit(f'缺少 {prefix}_URL / {prefix}_USERNAME')
    host, port, database = parse_jdbc(url)
    return pymysql.connect(host=host, port=port, user=user, password=password, database=database,
                           connect_timeout=10, read_timeout=600, write_timeout=600,
                           charset='utf8mb4', client_flag=CLIENT.MULTI_STATEMENTS,
                           autocommit=True)


def database_name(conn):
    with conn.cursor() as cur:
        cur.execute('SELECT DATABASE()')
        return cur.fetchone()[0]


def assert_safe_target(conn, allow_reset):
    name = (database_name(conn) or '').lower()
    if not allow_reset:
        raise SystemExit('拒绝重置：必须显式传入 --allow-reset')
    if name == 'fengsong' or not any(token in name for token in ('test', 'baseline', 'replay')):
        raise SystemExit(f'拒绝重置数据库 {name}：只允许名字含 test/baseline/replay 的库')


def tables(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT TABLE_NAME FROM information_schema.TABLES "
                    "WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME")
        return [r[0] for r in cur.fetchall()]


def drop_all(conn):
    with conn.cursor() as cur:
        names = tables(conn)
        cur.execute('SET FOREIGN_KEY_CHECKS=0')
        for name in names:
            cur.execute(f'DROP TABLE IF EXISTS `{name}`')
        cur.execute('SET FOREIGN_KEY_CHECKS=1')
        return len(names)


def execute_file(conn, path):
    opener = gzip.open if path.endswith('.gz') else open
    with opener(path, 'rt', encoding='utf-8') as f:
        sql = f.read()
    with conn.cursor() as cur:
        cur.execute(sql)
        while cur.nextset():
            pass


def count(conn, table):
    with conn.cursor() as cur:
        cur.execute(f'SELECT COUNT(*) FROM `{table}`')
        return cur.fetchone()[0]


def dump_database(conn, path, manifest_path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    names = tables(conn)
    manifest = {'tables': {}, 'count': len(names), 'totalRows': 0}
    with gzip.open(path, 'wt', encoding='utf-8', compresslevel=6) as f:
        f.write('SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n')
        for name in names:
            with conn.cursor() as cur:
                cur.execute(f'SHOW CREATE TABLE `{name}`')
                create = cur.fetchone()[1]
                f.write(f'\nDROP TABLE IF EXISTS `{name}`;\n{create};\n')
                cur.execute(f'SELECT * FROM `{name}`')
                cols = [d[0] for d in cur.description]
                col_sql = ','.join('`' + c + '`' for c in cols)
                rows = cur.fetchall()
                for start in range(0, len(rows), 100):
                    batch = rows[start:start + 100]
                    values = ','.join(
                        '(' + ','.join(escape_item(v, conn.charset) for v in row) + ')' for row in batch)
                    f.write(f'INSERT INTO `{name}` ({col_sql}) VALUES\n{values};\n')
                cur.execute(f'CHECKSUM TABLE `{name}`')
                checksum = cur.fetchone()[1]
                manifest['tables'][name] = {'rows': len(rows), 'checksum': checksum}
                manifest['totalRows'] += len(rows)
        f.write('\nSET FOREIGN_KEY_CHECKS=1;\n')
    manifest['file'] = path
    manifest['sizeBytes'] = os.path.getsize(path)
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    return manifest


def verify_row_counts(conn, manifest):
    mismatches = []
    for table, meta in manifest['tables'].items():
        actual = count(conn, table)
        if actual != meta['rows']:
            mismatches.append({'table': table, 'expected': meta['rows'], 'actual': actual})
    return mismatches


def restore_database(conn, dump_path, manifest):
    drop_all(conn)
    execute_file(conn, dump_path)
    return verify_row_counts(conn, manifest)
