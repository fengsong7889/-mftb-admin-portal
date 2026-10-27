package com.mftb.admin.dto;

import lombok.Data;

/**
 * 直接创建赔付单 DTO（无需归还记录）
 *
 * 适用场景：
 * - 员工离职时资产损坏，资产已不在公司
 * - 第三方损坏资产（如快递损坏）
 * - 历史遗留问题补录赔付
 * - 遗失核销后需要员工赔付
 */
@Data
public class EamCompensationSaveDTO {
    /** 资产 ID（必填） */
    private Long assetId;

    /** 损失类型：damage=损坏 / loss=遗失（必填） */
    private String damageType;

    /** 原因分类：human=人为 / natural=自然 / third_party=第三方 / quality=质量（可选，定责时填写） */
    private String cause;

    /** 责任对象：employee=员工 / department=部门 / company=公司 / none=未定（可选，定责时填写） */
    private String party;

    /** 责任人 ID（可选，定责时填写） */
    private Long responsibleId;

    /** 责任人姓名（可选，定责时填写） */
    private String responsibleName;

    /** 责任部门（可选，定责时填写） */
    private String department;

    /** 定责说明/备注（可选） */
    private String reason;

    /** 关联归还记录 ID（可选，从归还流程创建时有值） */
    private Long returnId;

    /** 关联遗失单 ID（可选，从遗失流程创建时有值） */
    private Long lossId;
}
