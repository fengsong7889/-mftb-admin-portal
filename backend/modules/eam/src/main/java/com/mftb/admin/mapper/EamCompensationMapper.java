package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamCompensation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** 赔付记录 Mapper */
@Mapper
public interface EamCompensationMapper extends BaseMapper<EamCompensation> {

    @Select("SELECT * FROM biz_eam_compensation WHERE id = #{id} AND deleted = 0 FOR UPDATE")
    EamCompensation selectForUpdate(@Param("id") long id);

    @Update("UPDATE biz_eam_compensation SET net_paid = net_paid + #{amount}, "
            + "status = #{status}, updated_by = #{operatorName}, updated_at = NOW() "
            + "WHERE id = #{id} AND deleted = 0")
    int addPayment(@Param("id") long id, @Param("amount") long amount,
                   @Param("status") String status, @Param("operatorName") String operatorName);

    @Update("UPDATE biz_eam_compensation SET net_paid = net_paid - #{amount}, "
            + "status = #{status}, updated_by = #{operatorName}, updated_at = NOW() "
            + "WHERE id = #{id} AND deleted = 0")
    int addRefund(@Param("id") long id, @Param("amount") long amount,
                  @Param("status") String status, @Param("operatorName") String operatorName);

    @Update("UPDATE biz_eam_compensation SET amount = #{newAmount}, review_required = 0, "
            + "status = #{status}, updated_by = #{operatorName}, updated_at = NOW() "
            + "WHERE id = #{id} AND deleted = 0")
    int updateAfterReview(@Param("id") long id, @Param("newAmount") long newAmount,
                          @Param("status") String status, @Param("operatorName") String operatorName);
}
