package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 盘点范围条件（预览与创建共用）。
 * <p>维度之间 AND，同一维度多值 OR；父节点选择由后端展开为子节点集合。</p>
 */
@Data
public class InventoryScope {

    /** 范围模式：CONDITION 按条件 / ALL 全部适用资产 */
    private String scopeMode;

    /** 存放仓库 ID 多选（含子节点展开） */
    private List<Long> locationIds;

    /** 资产分类 ID 多选（含子节点展开，仅 ASSET 业务类型） */
    private List<Long> categoryIds;

    /** 资产归属部门 ID（单选，后端解析为台账部门名称集合） */
    private Long departmentId;

    /** 所属品牌（sys_company_brand.id，单选） */
    private Integer companyBrand;

    /** 资产状态多选（缺省使用默认适用状态集合） */
    private List<String> statuses;
}
