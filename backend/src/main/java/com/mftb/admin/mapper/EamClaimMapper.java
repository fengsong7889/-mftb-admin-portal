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

    @Select("SELECT * FROM biz_eam_claim WHERE id = #{id} AND deleted = 0 FOR UPDATE")
    EamClaim selectForUpdate(@Param("id") long id);

    @Select("SELECT COUNT(*) FROM biz_eam_claim WHERE asset_id = #{assetId} AND status IN ('pending_signature','claimed') AND deleted = 0")
    long countActiveByAsset(@Param("assetId") long assetId);

    @Select("SELECT COUNT(*) FROM biz_eam_claim WHERE employee_id = #{employeeId} AND status = #{status} AND deleted = 0")
    long countByEmployeeAndStatus(@Param("employeeId") long employeeId, @Param("status") String status);

    @Update("UPDATE biz_eam_claim SET signature_evidence_id = #{evidenceId}, signed_at = NOW(), "
            + "signature_status = #{signatureStatus}, content_hash = #{contentHash}, "
            + "updated_by = #{operatorName}, updated_at = NOW() WHERE id = #{claimId} AND deleted = 0")
    int updateSignature(@Param("claimId") long claimId, @Param("evidenceId") long evidenceId,
                        @Param("signatureStatus") String signatureStatus,
                        @Param("contentHash") String contentHash,
                        @Param("operatorName") String operatorName);
}
