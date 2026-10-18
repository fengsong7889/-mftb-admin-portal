package com.mftb.admin.service;

import com.mftb.admin.entity.EmpPositionRecord;

/**
 * 主数据稳定 ID 解析器：把任职记录里手填的名称归一到主数据 id。
 * <p>
 * 方案 §7.1 要求任职记录「补部门/职位/上级/导师/法人/地点 ID，保留历史名称快照」。
 * 名称快照继续留着（展示与历史回溯），稳定 ID 用于关联与统计 —— 部门改名、岗位重建后，
 * 只有 ID 还能把历史挂回正确的组织节点。
 * <p>
 * <b>只认唯一命中</b>：同名有多条（或找不到）时留 NULL，绝不猜第一个。
 * 把异动挂到别人的部门上比留空更糟：留空会被差异报告暴露并追补，错挂则一路静默。
 */
public interface HrMasterDataResolver {

    /**
     * 依据记录里已有的名称字段补齐稳定 ID 列。
     * <p>就地修改入参实体；解析不到时把对应列置 NULL（不保留上一次的错误关联）。
     */
    void applyStableIds(EmpPositionRecord record);
}
