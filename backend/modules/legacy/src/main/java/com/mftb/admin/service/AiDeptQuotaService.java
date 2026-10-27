package com.mftb.admin.service;

import com.mftb.admin.dto.AiDeptQuotaDTO;

import java.util.List;

/**
 * 部门级 AI 额度策略（ai_dept_quota_policy）的读写服务。
 * <p>
 * 一条策略 = 一组部门 + 一个周期 + 一种额度口径（quotaType/quotaValue），外加超线动作与
 * 降级模型等控制项；具体取值集合由前端表单与网关侧读取方约定，本层不做枚举校验。
 * <p>
 * 实体带 {@code @TableLogic}，因此删除为逻辑删除；已用额度 usedValue 由网关侧累加，
 * 不通过本服务修改。
 */
public interface AiDeptQuotaService {

    /**
     * 按名称模糊 / 周期 / 状态筛选策略列表。
     * <p>
     * 返回全量不分页（策略数量受人手配置限制），按更新时间倒序；query 为 null 时即无条件列全部。
     */
    List<AiDeptQuotaDTO.DeptQuotaVO> listDeptQuotas(AiDeptQuotaDTO.DeptQuotaQueryRequest query);

    /** 单条策略详情；不存在或已逻辑删除时返回 null，不抛异常 */
    AiDeptQuotaDTO.DeptQuotaVO getDeptQuotaById(Long id);

    /**
     * 新增或编辑策略（靠 request.id 区分），返回策略 id。编辑时策略不存在则抛异常。
     * <p>
     * 新增时才生成 configCode、写入 createdBy 并把 usedValue 置 0；<b>编辑路径不会重置
     * usedValue</b>，否则已消耗额度会被改一次配置就清零。
     * <p>
     * ⚠️ 字段写入采用“全量覆盖”而非“传 null 则保留原值”：仅 currency(CNY)、
     * softThreshold(80)、totalEmployeeCount(0)、status(1) 四个字段在 null 时退为默认值，
     * 其余字段（包含 quotaValue、downgradeModelId 等）传 null 就会把库里原值清空。
     * 因此调用方必须提交完整表单，不能只传改动项。
     */
    Long saveDeptQuota(AiDeptQuotaDTO.DeptQuotaRequest request, String operator);

    /** 逻辑删除策略；不校验是否仍有部门在使用，也不区分是否存在（id 错则静默无效） */
    void deleteDeptQuota(Long id);

    /**
     * 启用/停用策略（1=启用，0=停用）。
     * <p>
     * ⚠️ 目前 Controller 与 Service 均未校验取值，传入的任意整数会被直接写入 status
     * 字段（无 CHECK 约束）。调用时请自行保证只传 0/1。
     */
    void toggleDeptQuotaStatus(Long id, Integer status, String operator);
}
