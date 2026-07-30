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

    /** 交易类型: 充值 / 扣款 / 消费 / 转入 / 转出 */
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
        vo.setTradeType(detail.getTradeType());
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
}
