package com.mftb.admin.dto;

import com.mftb.admin.entity.FinBatch;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import lombok.Data;

import java.math.BigDecimal;
import java.util.Map;

/**
 * 批次视图对象（字段命名与前端批次查询表格 dataIndex 一致）
 */
@Data
public class FinBatchVO {

    private Long id;

    /** 集团ID（对应 biz_fin_batch.group_code） */
    private String groupId;

    private String groupName;
    private String brand;

    /** 批次类型: recharge / transfer / merge */
    private String batchType;

    private String batchNo;
    private String flowNo;
    private String tradeTime;

    /** 是否实收: 是 / 否 / -- */
    private String isActual;

    /** 虚拟账户金额（负数=转出/扣减） */
    private BigDecimal virtualAmount;

    /** 实收账户金额（NULL=不涉及） */
    private BigDecimal actualAmount;

    private BigDecimal discountAmount;
    private String applicant;
    private String bd;
    private String remark;

    /** 批次明细页展示数据 */
    private Map<String, Object> extra;

    public static FinBatchVO from(FinBatch batch) {
        FinBatchVO vo = new FinBatchVO();
        vo.setId(batch.getId());
        vo.setGroupId(batch.getGroupCode());
        vo.setGroupName(batch.getGroupName());
        vo.setBrand(batch.getBrand());
        vo.setBatchType(batch.getBatchType());
        vo.setBatchNo(batch.getBatchNo());
        vo.setFlowNo(batch.getFlowNo());
        vo.setTradeTime(DateTimeUtils.format(batch.getTradeTime()));
        vo.setIsActual(batch.getIsActual());
        vo.setVirtualAmount(batch.getVirtualAmount());
        vo.setActualAmount(batch.getActualAmount());
        vo.setDiscountAmount(batch.getDiscountAmount());
        vo.setApplicant(batch.getApplicant());
        vo.setBd(batch.getBd());
        vo.setRemark(batch.getRemark());
        vo.setExtra(JsonUtils.parseMap(batch.getExtra()));
        return vo;
    }
}
