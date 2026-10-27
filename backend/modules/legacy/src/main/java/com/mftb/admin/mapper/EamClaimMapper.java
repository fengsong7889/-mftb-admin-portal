package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.mftb.admin.dto.EamClaimEmployeeSummaryVO;
import com.mftb.admin.entity.EamClaim;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.Collection;

/** 领用登记 Mapper */
@Mapper
public interface EamClaimMapper extends BaseMapper<EamClaim> {

    /** 按 id 加行锁读取领用单（含 deleted=0）；必须在事务内调用，用于签署/取消/归还等写路径防并发 */
    @Select("SELECT * FROM biz_eam_claim WHERE id = #{id} AND deleted = 0 FOR UPDATE")
    EamClaim selectForUpdate(@Param("id") long id);

    /** 某资产上未结束的领用单数（待签 + 在用）；资产编辑与删除校验依赖此计数判断是否已被占用 */
    @Select("SELECT COUNT(*) FROM biz_eam_claim WHERE asset_id = #{assetId} AND status IN ('pending_signature','claimed') AND deleted = 0")
    long countActiveByAsset(@Param("assetId") long assetId);

    /** 某员工在指定领用状态下的记录数（自助端统计与限额校验用） */
    @Select("SELECT COUNT(*) FROM biz_eam_claim WHERE employee_id = #{employeeId} AND status = #{status} AND deleted = 0")
    long countByEmployeeAndStatus(@Param("employeeId") long employeeId, @Param("status") String status);

    /** 写入签署结果：同时落凭证 id、签署时间、签署状态与内容 hash（用于防篡改回溯） */
    @Update("UPDATE biz_eam_claim SET signature_evidence_id = #{evidenceId}, signed_at = NOW(), "
            + "signature_status = #{signatureStatus}, content_hash = #{contentHash}, "
            + "updated_by = #{operatorName}, updated_at = NOW() WHERE id = #{claimId} AND deleted = 0")
    int updateSignature(@Param("claimId") long claimId, @Param("evidenceId") long evidenceId,
                        @Param("signatureStatus") String signatureStatus,
                        @Param("contentHash") String contentHash,
                        @Param("operatorName") String operatorName);

    /**
     * 员工领用汇总：一次 GROUP BY 算完全部指标，分页交给分页插件。
     *
     * <p>取代原先「全表 selectList → Java 分组 → 每人一次 selectById → 内存分页」的写法：
     * 领用记录只增不减，那条路径的耗时与内存会随数据量线性恶化。
     * <p>部门与关键字都在 SQL 里解决（join sys_user），所以列表与统计卡用的是同一套条件，
     * 不会再出现「传了 departmentId 但没人用」的静默失效。
     * <p>employeeIds 为 null 表示不限部门；空集合不得传进来，
     * 由服务层直接返回空页，避免拼出非法的 {@code IN ()}。
     */
    @Select("<script>"
            + "SELECT c.employee_id AS employeeId, "
            + "u.emp_id AS empNo, "
            + "COALESCE(NULLIF(u.name, ''), u.username) AS empName, "
            + "u.department_id AS departmentId, "
            + "u.department AS department, "
            + "SUM(CASE WHEN c.status = 'claimed' THEN 1 ELSE 0 END) AS claimedCount, "
            + "SUM(CASE WHEN c.status = 'returned' THEN 1 ELSE 0 END) AS returnedCount, "
            + "SUM(CASE WHEN c.status = 'pending_signature' AND c.signature_status = 'pending' THEN 1 ELSE 0 END) AS pendingCount, "
            + "SUM(CASE WHEN c.status = 'claimed' AND c.signature_status = 'proxy_pending' THEN 1 ELSE 0 END) AS proxyPendingCount, "
            + "MAX(c.claim_date) AS lastClaimDate "
            + "FROM biz_eam_claim c "
            + "JOIN sys_user u ON u.id = c.employee_id AND u.deleted = 0 "
            + "WHERE c.deleted = 0 "
            + "<if test='employeeIds != null'> AND c.employee_id IN "
            + "(<foreach collection='employeeIds' item='e' separator=','>#{e}</foreach>) </if>"
            + "<if test=\"keyword != null and keyword != ''\"> AND ("
            + "u.name LIKE CONCAT('%', #{keyword}, '%') "
            + "OR u.emp_id LIKE CONCAT('%', #{keyword}, '%') "
            + "OR u.department LIKE CONCAT('%', #{keyword}, '%') "
            + "OR c.claim_no LIKE CONCAT('%', #{keyword}, '%') "
            + "OR c.operator_name LIKE CONCAT('%', #{keyword}, '%')) </if>"
            + "GROUP BY c.employee_id, u.emp_id, u.name, u.username, u.department_id, u.department "
            + "ORDER BY MAX(c.claim_date) DESC, c.employee_id ASC"
            + "</script>")
    IPage<EamClaimEmployeeSummaryVO> selectEmployeeSummaryPage(
            IPage<EamClaimEmployeeSummaryVO> page,
            @Param("keyword") String keyword,
            @Param("employeeIds") Collection<Long> employeeIds);
}
