package com.mftb.admin.service;

import com.mftb.admin.entity.RdmTaskTypeConfig;

import java.util.List;

/**
 * RDM 任务类型字典服务（业务可配置）。
 * <p>
 * 任务类型下拉选项、图例色、聚合桶与写校验四件事同源本表；
 * 服务层每次按需查库（字典极小），不做缓存，避免管理端写入后的失效问题。
 */
public interface RdmTaskTypeService {

    /** 启用项（表单/甘特图下拉、图例），按 sort_order 升序 */
    List<RdmTaskTypeConfig> listEnabled();

    /** 全量含停用（管理页/回溯），按 sort_order 升序 */
    List<RdmTaskTypeConfig> listAll();

    /**
     * 按 code 解析（含停用），不存在返回 null。
     * <p>写校验的字典入口：任务写入只认本表存在过的 code，保证历史引用可解析。
     */
    RdmTaskTypeConfig resolveByCode(String code);

    /**
     * 聚合桶：design/qa/dev。
     * <p>字典缺行或 category 非法时按内置兜底（design→design、qa→qa、其余→dev），
     * 保证负载统计与工时归集永远落在三桶之一，不会因配置缺失而漏算。
     */
    String categoryOf(String code);

    /** 新增（code 唯一且永续；默认启用） */
    Long create(RdmTaskTypeConfig cfg);

    /** 更新（code 为身份键不可改；label/color/category/sortOrder/remark/enabled 可改） */
    void update(Long id, RdmTaskTypeConfig cfg);

    /** 启用/停用（不提供物理删除：保护 rdm_work_task.task_type 历史引用） */
    void updateStatus(Long id, Integer enabled);
}
