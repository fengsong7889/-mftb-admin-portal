package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 消费风控配置保存请求
 */
@Data
public class FinRiskConfigDTO {

    /** 集团ID */
    private String groupId;

    /** 集团名称 */
    private String groupName;

    /** 所属品牌: flashBee / mFood */
    private String brand;

    /** 风控模式: repay=还款释放 monthly=每月比例释放 */
    private String releaseMode;

    /** 每月释放比例（小数，如 0.1=10%/月，monthly 模式必填） */
    private BigDecimal monthlyReleaseRatio;

    /** 备注（白名单原因等） */
    private String remark;
}
