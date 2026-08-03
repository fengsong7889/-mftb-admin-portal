package com.mftb.admin.dto;

import com.mftb.admin.entity.FinDetail;
import com.mftb.admin.util.DateTimeUtils;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 交易明细视图对象（字段命名与前端明细查询表格 dataIndex 一致）
 */
@Data
public class FinDetailVO {

    /** 存储交易类型: 消费（退款以正数消费明细与原消费正负相抵） */
    private static final String STORED_CONSUME = "消費";

    /** 展示交易类型: 退款（金额为正的消费明细即退款回补） */
    public static final String DISPLAY_REFUND = "退款";

    private Long id;
    private String detailId;

    /** 集团ID（对应 biz_fin_detail.group_code） */
    private String groupId;

    private String groupName;
    private String brand;

    /** 门店ID（对应 biz_fin_detail.store_code，集团维度为 --） */
    private String storeId;

    private String storeName;
    private String channel;

    /** 交易类型: 充值 / 扣款 / 消费 / 退款 / 转入 / 转出 */
    private String tradeType;

    /** 变动类别 */
    private String changeType;

    private String tradeTime;

    /** 虚拟账户变动金额 */
    private BigDecimal virtualChange;

    /** 实收账户变动金额（NULL=不涉及） */
    private BigDecimal actualChange;

    private String batchNo;
    private String flowNo;
    private String bd;
    private String remark;

    public static FinDetailVO from(FinDetail detail) {
        FinDetailVO vo = new FinDetailVO();
        vo.setId(detail.getId());
        vo.setDetailId(detail.getDetailId());
        vo.setGroupId(detail.getGroupCode());
        vo.setGroupName(detail.getGroupName());
        vo.setBrand(detail.getBrand());
        vo.setStoreId(detail.getStoreCode());
        vo.setStoreName(detail.getStoreName());
        vo.setChannel(detail.getChannel());
        vo.setTradeType(displayTradeType(detail));
        vo.setChangeType(detail.getChangeType());
        vo.setTradeTime(DateTimeUtils.format(detail.getTradeTime()));
        vo.setVirtualChange(detail.getVirtualChange());
        vo.setActualChange(detail.getActualChange());
        vo.setBatchNo(detail.getBatchNo());
        vo.setFlowNo(detail.getFlowNo());
        vo.setBd(detail.getBd());
        vo.setRemark(detail.getRemark());
        return vo;
    }

    /**
     * 展示交易类型: 消费类型中金额为正的明细是退款回补（消费是扣费），
     * 展示为「退款」；存储仍为「消費」以保持与原消费明细正负相抵口径。
     */
    private static String displayTradeType(FinDetail detail) {
        if (STORED_CONSUME.equals(detail.getTradeType())
                && detail.getVirtualChange() != null
                && detail.getVirtualChange().signum() > 0) {
            return DISPLAY_REFUND;
        }
        return detail.getTradeType();
    }
}
