package com.mftb.admin.service;

import com.mftb.admin.dto.*;

import java.util.List;
import java.util.Map;

/** 资产盘点服务（v2） */
public interface EamInventoryService {

    /** 范围预览：返回应盘总数、状态分布、范围指纹与样例 */
    EamInventoryPreviewVO preview(InventoryScope scope);

    /** 创建盘点任务（冻结应盘清单 + 账面快照，幂等） */
    EamInventoryCreatedVO create(EamInventoryCreateDTO dto);

    /** 盘点任务分页列表 */
    PageResult<EamInventoryTaskVO> page(EamInventoryQuery query);

    /** 盘点任务详情（任务头 + 结构化统计，不含明细） */
    EamInventoryTaskVO detail(long id);

    /** 明细分页查询（核对进度/异常/仓库筛选） */
    PageResult<EamInventoryItemVO> items(long id, EamInventoryItemQuery query);

    /** 操作日志 */
    List<EamInventoryEventVO> events(long id);

    /** 保存/重置单条明细核对结果（乐观锁 + 幂等 + 期间变更检测） */
    EamInventoryItemVO saveItem(long taskId, long itemId, EamInventoryItemCheckDTO dto);

    /** 批量核对（仅无已保存结果的显式勾选项，原子提交） */
    int batchCheck(long taskId, EamInventoryBatchCheckDTO dto);

    /** 结束预检查 */
    EamInventoryPrepareCloseVO prepareClose(long id);

    /** 结束任务：完整完成或部分完成 */
    void complete(long id, EamInventoryCloseDTO dto);

    /** 取消任务 */
    void cancel(long id, EamInventoryCancelDTO dto);

    /** 任务列表导出 CSV（当前筛选全量） */
    String exportTasksCsv(EamInventoryQuery query);

    /** 任务报告导出 CSV：mode=all/missing(差异：未找到+损坏+位置/持有人差异)/unchecked */
    String exportReportCsv(long id, String mode);

    /** 盘点选项（仓库/分类/部门/状态），登录且有盘点写权限可用 */
    Map<String, Object> options();
}
