package com.mftb.admin.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

/**
 * 员工功能角色授权请求（从人事编辑里拆出的独立动作 {@code authorize}）。
 * <p>
 * 为什么单独成接口：编辑档案（改姓名/部门/职位）与「给这个人配权限」是两种风险，
 * 混在一个 PUT 里等于有 employee-management:edit 就能给自己或他人提权。
 */
@Data
public class RoleBindingRequest {

    /**
     * 功能角色 id 全量集合。
     * <p>必须显式提交：{@code null} 与空集合语义不同 —— null 表示「不改」会被拒绝，
     * 空集合表示「清空全部功能角色」是合法意图，不能因为前端漏传字段而误清空。
     */
    @NotNull(message = "功能角色清單不能為空（清空請傳空數組）")
    private List<Long> functionRoleIds;
}
