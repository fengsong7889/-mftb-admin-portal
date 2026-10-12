package com.mftb.admin.service;

import com.mftb.admin.dto.AttendancePunchImportRow;
import com.mftb.admin.dto.AttendancePunchVO;
import com.mftb.admin.dto.PageResult;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 打卡流水服务（只读账本 + 导入）。
 * <p>
 * 不提供任何"修改打卡"的方法：修正只能由异常处理发起补卡/请假/加班流程后重算结论，
 * 原始事实一旦可改，审计链就断了。
 */
public interface AttendancePunchService {

    /** 分页查询 */
    PageResult<AttendancePunchVO> page(long page, long size, LocalDate from, LocalDate to,
                                       String keyword, Long groupId, Long deptId, Integer source, Integer result);

    /** 与列表同口径的统计（卡片必须跟随筛选，禁止单独发无条件请求） */
    Map<String, Object> stats(LocalDate from, LocalDate to, String keyword, Long groupId, Long deptId,
                              Integer source, Integer result);

    /** 手工导入打卡：逐行校验 + 幂等入库，返回 total/inserted/duplicated/errors */
    Map<String, Object> importRows(List<AttendancePunchImportRow> rows);

    /**
     * 供同步任务写入（非人工录入来源）：按幂等键 {@code (user, punchAt, source)} 跳过已存在行。
     * <p>单独开一个入口而不是让同步自己拼 SQL：幂等与 work_date 归属规则只能有一处实现。
     */
    int saveGenerated(List<com.mftb.admin.entity.AttPunchLog> logs);
}
