package com.mftb.admin.dto;

import lombok.Data;
import java.util.Map;

/**
 * 借用记录视图 VO
 */
@Data
public class EamBorrowVO {
    private Long id;
    private String borrowNo;
    private Long assetId;
    private String assetNo;
    private String assetName;
    /** 当前台账配置，只读。 */
    private Map<String, Object> params;
    private String categoryCode;
    /** 所属品牌/公司品牌 ID */
    private Integer companyBrand;
    private Long holderId;
    private String holderName;
    private String department;
    private String operatorName;
    private String status;
    private String startDate;
    private String dueDate;
    private String returnDate;
    private String purpose;
    private Integer renewCount;
    private Long returnId;
    private String createdAt;
    private String updatedAt;
    /** 逾期天数（仅 overdue 状态时返回） */
    private Integer overdueDays;
}
