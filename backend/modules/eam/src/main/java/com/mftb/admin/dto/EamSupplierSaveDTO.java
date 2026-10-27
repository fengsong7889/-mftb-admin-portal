package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 供应商新增/更新请求（更新时字段为 null 表示不修改）
 * <p>
 * 注意：不含 code 与 status 字段 —— 编码由后端按规则自动生成、
 * 状态只能通过 toggle 接口切换，前端传值一律忽略。
 */
@Data
public class EamSupplierSaveDTO {

    /** 供应商名称 */
    private String name;

    /** 联系人（旧字段兼容，新数据不再写入） */
    private String contactPerson;

    /** 联系电话（旧字段兼容，新数据不再写入） */
    private String contactPhone;

    /** 开户银行 */
    private String bankName;

    /** 银行账号 */
    private String bankAccount;

    /** 备注 */
    private String remark;

    /** 联系人列表（新结构，一个供应商可配置多个联系人） */
    private List<EamSupplierContactSaveDTO> contacts;
}
