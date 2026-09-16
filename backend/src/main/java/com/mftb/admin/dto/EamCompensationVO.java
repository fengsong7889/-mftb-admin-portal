package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 赔付记录视图 VO
 */
@Data
public class EamCompensationVO {
    private Long id;
    private String compNo;
    private Long returnId;
    private Long assetId;
    private String assetName;
    private String assetNo;
    private Long holderId;
    private String holderName;
    private String damageType;
    private String cause;
    private String party;
    private Long responsibleId;
    private String responsibleName;
    private String department;
    private Long amount;
    private Long netPaid;
    private String status;
    private Integer reviewRequired;
    private String basis;
    private String reason;
    private String waiveReason;
    private String operatorName;
    private String createdAt;
    private String updatedAt;
    /** 收款/退款记录 */
    private List<PaymentVO> payments;
    /** 找回复核记录 */
    private List<ReviewVO> reviews;

    @Data
    public static class PaymentVO {
        private Long id;
        private String type;
        private Long amount;
        private String paymentDate;
        private String reason;
        private String operatorName;
        private String createdAt;
        /** 凭证 Data URL */
        private String evidenceImageUrl;
    }

    @Data
    public static class ReviewVO {
        private Long id;
        private String reviewDate;
        private Long beforeAmount;
        private Long afterAmount;
        private String reason;
        private String operatorName;
        private String createdAt;
    }
}
