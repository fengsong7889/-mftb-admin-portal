package com.mftb.admin.dto;

import com.mftb.admin.entity.HrOperationAudit;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** 人事操作审计视图（值已在写入时脱敏，展示端不再二次解密） */
@Data
public class HrAuditVO {

    private Long id;
    private Long userId;
    private String empNo;
    private String action;
    private String fieldName;
    private String beforeValue;
    private String afterValue;
    private String detail;
    private String reason;
    private String sourceReqNo;
    private LocalDate effectiveDate;
    private LocalDateTime occurredAt;
    private Integer sensitive;
    private String operator;

    public static HrAuditVO from(HrOperationAudit entity) {
        if (entity == null) {
            return null;
        }
        HrAuditVO vo = new HrAuditVO();
        vo.setId(entity.getId());
        vo.setUserId(entity.getUserId());
        vo.setEmpNo(entity.getEmpNo());
        vo.setAction(entity.getAction());
        vo.setFieldName(entity.getFieldName());
        vo.setBeforeValue(entity.getBeforeValue());
        vo.setAfterValue(entity.getAfterValue());
        vo.setDetail(entity.getDetail());
        vo.setReason(entity.getReason());
        vo.setSourceReqNo(entity.getSourceReqNo());
        vo.setEffectiveDate(entity.getEffectiveDate());
        vo.setOccurredAt(entity.getOccurredAt());
        vo.setSensitive(entity.getSensitive());
        vo.setOperator(entity.getOperator());
        return vo;
    }
}
