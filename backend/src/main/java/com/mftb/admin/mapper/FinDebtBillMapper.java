package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.FinDebtBill;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.math.BigDecimal;

@Mapper
public interface FinDebtBillMapper extends BaseMapper<FinDebtBill> {

    /** 集团×品牌未结清欠款合计（消费风控限额计算） */
    @Select("SELECT IFNULL(SUM(remain_amount), 0) FROM biz_fin_debt_bill "
            + "WHERE group_code = #{groupCode} AND brand = #{brand} "
            + "AND status = 'unsettled' AND deleted = 0")
    BigDecimal sumUnsettled(@Param("groupCode") String groupCode, @Param("brand") String brand);

    /** 某批次上未结清欠款合计（转账欠款批次检查） */
    @Select("SELECT IFNULL(SUM(remain_amount), 0) FROM biz_fin_debt_bill "
            + "WHERE batch_no = #{batchNo} AND status = 'unsettled' AND deleted = 0")
    BigDecimal sumUnsettledByBatchNo(@Param("batchNo") String batchNo);
}
