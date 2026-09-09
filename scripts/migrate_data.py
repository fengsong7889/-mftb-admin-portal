#!/usr/bin/env python3
# 将 SQLPub 生产库 (mysql3.sqlpub.com) 数据全量迁移到阿里云 RDS
# 用法: python3 migrate_data.py <源库密码>
import sys
import time
import pymysql

SRC = dict(
    host='mysql3.sqlpub.com', port=3308, user='fengsong_mftb',
    charset='utf8mb4', connect_timeout=30,
)
DST = dict(
    host='rm-bp1wo7870dr30e5rpzo.mysql.rds.aliyuncs.com', port=3306,
    user='fengsong_admin', password='Feng@9510',
    database='fengsong', charset='utf8mb4', connect_timeout=30,
)
DB = 'fengsong'
BATCH = 500  # 每批写入行数

if len(sys.argv) < 2:
    sys.exit('用法: python3 migrate_data.py <源库密码>')
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
