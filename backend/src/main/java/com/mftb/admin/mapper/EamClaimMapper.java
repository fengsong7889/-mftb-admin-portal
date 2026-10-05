package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamClaim;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

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
}
