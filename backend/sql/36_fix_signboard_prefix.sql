-- 金字招牌算法ID前缀修正：SFZP → SFJZ
UPDATE sys_biz_seq_rule
SET prefix = 'SFJZ',
    remark = REPLACE(remark, 'SFZP', 'SFJZ')
WHERE rule_key = 'algo_signboard';
