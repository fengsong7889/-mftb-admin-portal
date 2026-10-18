-- 247: 系統權限申請「到期自动回收」—— 申请单补 4 列 + 回收扫描索引
--      一次性参考文档；实际执行与幂等由 SystemAccessSchemaInitializer（版本键 oa:system-access:v1.2，@Order 32）负责。
--      方言：MySQL 8.x。禁止整脚本重放（本文件不进镜像、不由框架执行）。
--
-- 回收规则（用户决策：到期需要回收）：
--   1. 只有「使用期限 = 至指定日期」「本单确实新绑了角色」「到期日已过」三者同时成立才回收；
--      到期日当天仍可用，次日起回收；「长期」永不回收。
--   2. 回收资格只认 grant_newly_bound = 1：申请人本来就持有同一角色时，绑定是空操作，
--      到期若把它抽走，等于用一张权限申请单收掉管理员从别处给的权限。
--   3. 回收前先查同一申请人是否还有其他「未回收且未过期」的单据授予同一角色，有则标 kept 不动绑定
--      ——库里权限只有「有/无」一位，先到期的那张不能把后到期的那张打没。
--   4. 执行方是 SystemAccessExpiryJob（默认每日 03:20 一轮，cron 与开关均可外部化配置）：
--      每条单据一个独立事务，靠 revoke_status='none' 的条件更新做认领锁，多实例并发/补跑都只回收一次；
--      单条失败只记日志、状态留在 none 由下一轮重试。

-- ── 1. 回收资格与状态列 ──────────────────────────────────────────────────
--      两个默认值都是 fail-safe，不是随手填的：
--      grant_newly_bound DEFAULT 0 ⇒ 存量已兑现的单据一律拿不到回收资格，
--      不会因为「上线了一个定时任务」就静默收回别人已有的权限；要回收存量必须管理员自己核完清单回填。
ALTER TABLE biz_system_access_request
    ADD COLUMN grant_newly_bound TINYINT NOT NULL DEFAULT 0
        COMMENT '本次兑现是否真的新绑角色:1=本单绑上(仅此有到期回收资格),0=此前已持有/存量'
        AFTER grant_status,
    ADD COLUMN revoke_status VARCHAR(16) NOT NULL DEFAULT 'none'
        COMMENT '到期回收状态: none/revoked/kept'
        AFTER grant_newly_bound,
    ADD COLUMN revoked_at DATETIME DEFAULT NULL
        COMMENT '回收时间'
        AFTER revoke_status,
    ADD COLUMN revoked_by VARCHAR(64) DEFAULT NULL
        COMMENT '回收执行者(system-expiry)'
        AFTER revoked_at;

-- ── 2. 回收扫描索引 ─────────────────────────────────────────────────────
--      作业每轮都按「未回收 + 到期日已过」拉取，没索引就是全表扫。
ALTER TABLE biz_system_access_request
    ADD INDEX idx_sar_revoke (revoke_status, duration_until);

-- ── 3. 运维口径 ─────────────────────────────────────────────────────────
-- 紧急停机（不需发版）：system-access.expiry.enabled=false
-- 临时调频（如验证回收链路）：system-access.expiry-cron='0 0/5 * * * ?'
--
-- 查待回收清单：
--   SELECT flow_no, user_id, grant_target_name, duration_until
--     FROM biz_system_access_request
--    WHERE status='approved' AND grant_status='granted' AND grant_newly_bound=1
--      AND revoke_status='none' AND duration_type='until' AND duration_until < CURDATE();
--
-- 查某次回收是谁干的、动了谁：
--   SELECT * FROM sys_permission_audit_log
--    WHERE change_type='REVOKE' AND after_snapshot LIKE '%XTSQ%';
--
-- 回滚：代码回退后 4 列保留不删（删列会丢掉回收历史，旧代码不读它们）。
--   把 revoke_status 改回 'none' 只会让作业重扫，不会自动重授已解绑的角色；
--   要恢复权限必须按上面的 REVOKE 审计（含前后 functionRoles 快照）逐条人工重授。
