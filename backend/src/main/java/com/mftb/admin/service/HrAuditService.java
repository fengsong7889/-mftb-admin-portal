package com.mftb.admin.service;

import com.mftb.admin.dto.HrAuditEntry;
import com.mftb.admin.dto.HrAuditVO;
import com.mftb.admin.dto.PageResult;

import java.time.LocalDate;

/**
 * 人事操作审计服务（方案 §5.5「新增人事操作审计」、§7.4「服务端记录操作者、时间、生效时间、
 * 原因、变更前后值及来源单号；敏感值在审计展示中同样受控」）。
 * <p>
 * 与业务写入<b>同事务</b>：审计失败就让业务回滚，不允许出现「改了档案但没留下谁改的」。
 * 明文查看这类只读动作是唯一的例外语义 —— 它没有业务写入，本身就是一次落库。
 */
public interface HrAuditService {

    /**
     * 落一条（或一组字段级）审计。
     * <p>entry 里没有任何 {@code change} 且没有 detail 时也会落一行动作级留痕，
     * 因为「发生过这件事」本身就是审计要回答的问题（例：谁查看了明文）。
     */
    void record(HrAuditEntry entry);

    /** 便捷入口：单个动作级留痕（无字段变更） */
    void recordAction(String action, Long userId, String detail);

    /**
     * 分页查询。
     *
     * @param userId  指定员工（可空）
     * @param action  动作码（可空）
     * @param operator 操作人模糊（可空）
     * @param from    发生时间起（含，可空）
     * @param to      发生时间止（含，可空）
     */
    PageResult<HrAuditVO> query(Long userId, String action, String operator,
                                LocalDate from, LocalDate to, long page, long pageSize);
}
