package com.mftb.admin.dto;

import lombok.Data;
import java.util.Map;

/**
 * 资产调拨单 VO
 * <p>
 * 调拨记录 Tab（調撥記錄）展示字段：from/to 前后对比快照。
 */
@Data
public class EamAssetTransferVO {

    private Long id;

    /** 调拨编号 */
    private String transferNo;

    private Long assetId;

    private String assetNo;

    private String assetName;
    /** 当前台账配置，只读；调拨前后归属仍使用原单据快照。 */
    private Map<String, Object> params;
    private String categoryCode;
    /** 所属品牌/公司品牌 ID */
    private Integer companyBrand;
    private Long brandId;
    private String brand;
    private Integer brandBackfilled;
    private Long fromClaimId;
    private Long toClaimId;
    private String createdBy;
    private String updatedBy;
    private String cancelReason;
    private String cancelledBy;
    private String cancelledAt;
    private boolean cancellable;
    private String cancelBlockedReason;

    private Long fromUserId;

    private String fromUserName;

    private String fromDepartment;

    private String fromUserEmpId;

    private Long toUserId;

    private String toUserName;

    private String toUserEmpId;

    private String toDepartment;

    /** 调拨日期 yyyy-MM-dd */
    private String transferDate;

    /** 调拨原因 */
    private String reason;

    /** 状态：done/cancelled */
    private String status;

    private String operatorName;

    private String remark;

    private String createdAt;

    private String updatedAt;
}
