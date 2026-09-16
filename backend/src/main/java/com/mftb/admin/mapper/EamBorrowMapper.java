package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamBorrow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** 借用登记 Mapper */
@Mapper
public interface EamBorrowMapper extends BaseMapper<EamBorrow> {

    @Select("SELECT * FROM biz_eam_borrow WHERE id = #{id} AND deleted = 0 FOR UPDATE")
    EamBorrow selectForUpdate(@Param("id") long id);

    @Select("SELECT COUNT(*) FROM biz_eam_borrow WHERE asset_id = #{assetId} AND status IN ('active','overdue') AND deleted = 0")
    long countActiveByAsset(@Param("assetId") long assetId);

    @Update("UPDATE biz_eam_borrow SET renew_count = renew_count + 1, due_date = #{newDueDate}, "
            + "updated_by = #{operatorName}, updated_at = NOW() WHERE id = #{id} AND deleted = 0")
    int renew(@Param("id") long id, @Param("newDueDate") java.time.LocalDate newDueDate,
              @Param("operatorName") String operatorName);
}
