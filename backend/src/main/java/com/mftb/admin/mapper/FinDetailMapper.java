package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.FinDetail;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.math.BigDecimal;

@Mapper
public interface FinDetailMapper extends BaseMapper<FinDetail> {

    /** 某批次上已发生的扣减合计（绝对值） */
    @Select("SELECT IFNULL(SUM(ABS(virtual_change)), 0) FROM biz_fin_detail "
            + "WHERE batch_no = #{batchNo} AND virtual_change < 0 AND deleted = 0")
    BigDecimal sumDeductedByBatchNo(@Param("batchNo") String batchNo);
}
