#!/usr/bin/env python3
# 将 fengsong_schema.sql 导入阿里云 RDS（表结构迁移）
# 用法: python3 import_schema_to_rds.py <RDS密码>
import sys
import pymysql

HOST = 'rm-bp1wo7870dr30e5rpzo.mysql.rds.aliyuncs.com'
PORT = 3306
USER = 'fengsong_admin'
SQL_FILE = '/Users/yangjingjing/Desktop/fengsong_schema.sql'

if len(sys.argv) < 2:
    sys.exit('用法: python3 import_schema_to_rds.py <RDS密码>')

PASSWORD = sys.argv[1]


def split_sql(sql):
    """按分号拆分语句；引号（' " `）内的分号不拆分；跳过 -- 注释"""
    stmts, cur = [], []
    i, n, in_str, quote = 0, len(sql), False, ''
    while i < n:
        ch = sql[i]
        if not in_str:
            # -- 注释（-- 后跟空格或行尾才算注释，符合 MySQL 规则）
            if ch == '-' and i + 1 < n and sql[i + 1] == '-' and \
               (i + 2 >= n or sql[i + 2] in ' \t\r\n'):
                while i < n and sql[i] != '\n':
                    i += 1
                continue
            if ch in ("'", '"', '`'):
                in_str, quote = True, ch
                cur.append(ch)
                i += 1
                continue
            if ch == ';':
                s = ''.join(cur).strip()
                if s:
                    stmts.append(s)
                cur = []
                i += 1
                continue
            cur.append(ch)
            i += 1
        else:
            cur.append(ch)
            if ch == quote:
                # 引号转义：'' 或 ``
                if i + 1 < n and sql[i + 1] == quote:
                    cur.append(quote)
                    i += 2
                    continue
                in_str = False
            i += 1
    s = ''.join(cur).strip()
    if s:
        stmts.append(s)
    return stmts


with open(SQL_FILE, 'r', encoding='utf-8') as f:
    content = f.read()

statements = split_sql(content)
print(f'共解析出 {len(statements)} 条 SQL 语句，开始导入...')

conn = pymysql.connect(
    host=HOST, port=PORT, user=USER, password=PASSWORD,
    database='fengsong', charset='utf8mb4', connect_timeout=15,
)
try:
    with conn.cursor() as cur:
        done = 0
        for stmt in statements:
            head = stmt[:60].replace('\n', ' ')
            try:
                cur.execute(stmt)
            except Exception as e:
                print(f'\n[失败] 语句: {head}...')
                print(f'[错误] {e}')
                sys.exit('导入中止')
            done += 1
            if done % 10 == 0 or done == len(statements):
                print(f'进度: {done}/{len(statements)}  (最近: {head}...)')
        # 验证表数量
        cur.execute(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema = 'fengsong'")
        count = cur.fetchone()[0]
        print(f'\n导入完成！fengsong 库当前共 {count} 张表')
finally:
    conn.close()
