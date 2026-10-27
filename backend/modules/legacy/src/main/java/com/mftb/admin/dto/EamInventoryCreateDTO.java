package com.mftb.admin.dto;

import lombok.Data;

/** 盘点任务创建 DTO（v2） */
@Data
public class EamInventoryCreateDTO {

    /** 盘点任务名称 */
    private String taskName;

    /** 盘点负责人 sys_user.id（后端解析姓名+工号，可为空则回退当前登录人） */
    private Long ownerId;

    /** 备注 */
    private String remark;

    /** 盘点范围 */
    private InventoryScope scope;

    /** 预览生成的范围指纹，创建时须与后端重算一致，防止预览后资料漂移 */
    private String scopeHash;

    /** 创建幂等键（前端生成 UUID，16~64 位） */
    private String requestKey;
}
