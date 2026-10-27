package com.mftb.admin.dto;

import lombok.Data;

import java.time.LocalDate;

/**
 * 人员主档里聚合展示的异动摘要（只读）。
 * <p>
 * 刻意只取六列：证件号、手机、邮箱等敏感字段留在异动菜单里按原权限查看，
 * 不允许因为「能看花名册」就顺带看到证件号（方案的字段级最小必要）。
 */
@Data
public class HcmPersonLifecycleVO {

    private String reqNo;
    /** 单据类型：ONBOARD/REGULARIZATION/TRANSFER/DIMISSION 等，由既有常量给出 */
    private String type;
    private String status;
    private LocalDate effectiveDate;
    private String reason;
    private String flowNo;
}
