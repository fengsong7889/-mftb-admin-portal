#!/usr/bin/env python3
# 将 SQLPub 生产库 (mysql3.sqlpub.com) 数据全量迁移到阿里云 RDS
#
# 凭据一律不写入仓库（历史版本曾内置 RDS 明文密码，已移除）：
#   源库：host/user 可用环境变量覆盖，密码作为命令行第 1 个参数传入
#   目标库：必需环境变量 RDS_HOST / RDS_USER / RDS_PASSWORD
# 用法:
#   export RDS_HOST=... RDS_USER=... RDS_PASSWORD=...
#   python3 migrate_data.py <源库密码>
import os
import sys
import time
import pymysql

DB = 'fengsong'
BATCH = 500  # 每批写入行数


def require_env(key):
    """读取必需环境变量；缺失即退出，不得回退到内置凭据。"""
    val = (os.environ.get(key) or '').strip()
    if not val:
        sys.exit(f'❌ 缺少环境变量 {key}；凭据不得写入仓库，请 export 后重试')
    return val


SRC = dict(
    host=os.environ.get('SRC_HOST', 'mysql3.sqlpub.com'), port=3308,
    user=os.environ.get('SRC_USER', 'fengsong_mftb'),
    charset='utf8mb4', connect_timeout=30,
)
DST = dict(
    host=require_env('RDS_HOST'), port=int(os.environ.get('RDS_PORT', '3306')),
    user=require_env('RDS_USER'), password=require_env('RDS_PASSWORD'),
    database=DB, charset='utf8mb4', connect_timeout=30,
)

if len(sys.argv) < 2:
    sys.exit('用法: 先 export RDS_HOST/RDS_USER/RDS_PASSWORD，再执行 python3 migrate_data.py <源库密码>')
SRC['password'] = sys.argv[1]
SRC['database'] = DB


def list_tables(cur):
    cur.execute(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema=%s AND table_type='BASE TABLE' "
        "ORDER BY table_name", (DB,))
    return [r[0] for r in cur.fetchall()]


print('正在连接源库与目标库...')
src = pymysql.connect(**SRC)
dst = pymysql.connect(**DST)
try:
    with src.cursor() as sc, dst.cursor() as dc:
        tables = list_tables(sc)
        print(f'共发现 {len(tables)} 张表')

        # 关闭外键检查（按表顺序插入也能成功）
        dc.execute('SET FOREIGN_KEY_CHECKS = 0')

        grand_total = 0
        t0 = time.time()
        for idx, tbl in enumerate(tables, 1):
            # 读字段
            sc.execute(f'SELECT * FROM `{tbl}`')
            cols = [d[0] for d in sc.description]
            placeholders = ','.join(['%s'] * len(cols))
            col_list = ','.join(f'`{c}`' for c in cols)
            ins = f'INSERT INTO `{tbl}` ({col_list}) VALUES ({placeholders})'

            count = 0
            while True:
                rows = sc.fetchmany(BATCH)
                if not rows:
                    break
                dc.executemany(ins, rows)
                count += len(rows)
            dst.commit()
            grand_total += count
            elapsed = time.time() - t0
            speed = grand_total / elapsed if elapsed > 0 else 0
            print(
                f'[{idx:2d}/{len(tables)}] {tbl:<45s} '
                f'{count:>8d} 行  '
                f'(累计 {grand_total:>9d}, 速度 {speed:.0f} 行/秒)'
            )

        dc.execute('SET FOREIGN_KEY_CHECKS = 1')
        dst.commit()

        # 验证：源库与目标库表数据量对比
        print('\n=== 数据量对比 ===')
        diff = 0
        for tbl in tables:
            sc.execute(f'SELECT COUNT(*) FROM `{tbl}`')
            s = sc.fetchone()[0]
            dc.execute(f'SELECT COUNT(*) FROM `{tbl}`')
            d = dc.fetchone()[0]
            mark = 'OK' if s == d else '!!DIFF!!'
            if s != d:
                diff += 1
            print(f'  {tbl:<45s}  源:{s:>8d}  目标:{d:>8d}  {mark}')

        print(f'\n总数据行: {grand_total}, 用时 {time.time()-t0:.1f}s')
        print(f'差异表数量: {diff}')
finally:
    src.close()
    dst.close()
