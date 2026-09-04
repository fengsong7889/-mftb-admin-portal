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

    /**
     * 集团×品牌累计净消费（消费风控限额计算）：
     * 口径 = 广告消费（trade_type=消費）+ 消费扣款（change_type=消費扣款）；
     * 负向变动计为消费，正向变动（广告退款）冲减消费；
     * 转账转出/账户扣款/批次扣款/欠款偿还不计入。
     */
    @Select("SELECT GREATEST(IFNULL(-SUM(virtual_change), 0), 0) FROM biz_fin_detail "
            + "WHERE group_code = #{groupCode} AND brand = #{brand} AND deleted = 0 "
            + "AND (trade_type = '消費' OR change_type = '消費扣款')")
    BigDecimal sumNetConsume(@Param("groupCode") String groupCode, @Param("brand") String brand);
}
