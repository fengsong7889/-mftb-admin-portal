#!/usr/bin/env python3
# 给 fengsong_schema.sql 每张表前加 DROP TABLE IF EXISTS，并包上外键检查开关
# 用途：阿里云 RDS 迁移 - 表结构导入脚本预处理
import re
import sys

PATH = '/Users/yangjingjing/Desktop/fengsong_schema.sql'

with open(PATH, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. 校验文件完整性
create_count = len(re.findall(r'^CREATE TABLE', content, flags=re.M))
print(f'发现 {create_count} 个 CREATE TABLE 语句')
if create_count == 0:
    sys.exit('错误：文件里没有 CREATE TABLE，请确认导出成功')

# 2. 每张表前插入对应的 DROP TABLE IF EXISTS
def add_drop(m):
    return f"DROP TABLE IF EXISTS `{m.group(1)}`;\n{m.group(0)}"

content = re.sub(r'^CREATE TABLE `([^`]+)` \(', add_drop, content, flags=re.M)

# 3. 外键检查包装：执行前关闭外键检查，执行完恢复，避免 DROP 顺序受外键约束影响
if not content.lstrip().startswith('SET FOREIGN_KEY_CHECKS'):
    content = 'SET FOREIGN_KEY_CHECKS = 0;\n\n' + content.lstrip()
content = content.rstrip() + '\n\nSET FOREIGN_KEY_CHECKS = 1;\n'

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(content)

# 4. 验证结果
drop_count = len(re.findall(r'^DROP TABLE IF EXISTS', content, flags=re.M))
print(f'已添加 {drop_count} 个 DROP TABLE IF EXISTS')
print(f'文件开头: {content.splitlines()[0]}')
print(f'文件结尾: {content.splitlines()[-1]}')
print('处理完成')
