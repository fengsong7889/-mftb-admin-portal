package com.mftb.admin.service;

import com.mftb.admin.dto.EmployeeVO;
import com.mftb.admin.dto.PageResult;

import java.util.List;

/**
 * 花名册查询服务（方案 §5.1：默认列、服务端统一筛选、列表与导出同一口径）。
 * <p>
 * 它是 {@link EmployeeService#list} 的**加强版**：额外按操作者的组织数据范围收敛，
 * 并批量派生「雇主法人 / 人员类别 / 工作地点 / 直属上级 / 雇佣起点 / 试用状态」这些
 * 不在 {@code sys_user} 上、只能由人事事实回答的列。
 * <p>
 * 分两个接口而不是给 list 加开关：{@code GET /employees} 还是全公司「选个人」下拉的数据源，
 * 既不该付这些批查的代价，也不该被人员范围挡住。
 */
public interface HrRosterQueryService {

    /** 试用状态：仍在试用期内（或转正事实缺失但试用期已登记） */
    String PROBATION = "PROBATION";
    /** 已转正 */
    String REGULAR = "REGULAR";
    /** 无可靠数据源：不猜（宁缺勿误导） */
    String PROBATION_UNKNOWN = "UNKNOWN";

    /** 花名册分页（收敛 + 富化） */
    PageResult<EmployeeVO> roster(long page, long size, String keyword, String employmentStatus,
                                  Long departmentId, String sequence, String jobLevel, String rank,
                                  Long roleId, String updatedBy, String updatedAtFrom, String updatedAtTo);

    /**
     * 花名册全量导出取数（收敛 + 富化）。
     * <p>命中人数超过 {@link EmployeeService#ROSTER_EXPORT_MAX_ROWS} 时抛业务异常，
     * 而不是截断返回一个「看起来完整」的文件。
     */
    List<EmployeeVO> rosterForExport(String keyword, String employmentStatus,
                                     Long departmentId, String sequence, String jobLevel, String rank,
                                     Long roleId, String updatedBy, String updatedAtFrom, String updatedAtTo);
    /**
     * 为「當前分頁 / 所選行」两档前端导出登记审计留痕。
     * <p>人数由服务端按调用者的组细数据范围重新过滤后得出，**不采信前端自报**：
     * 否则导出的留痕就变成“前端想写多少就写多少”，恰好失去审计意义。
     *
     * @param scope   PAGE / SELECTION（全部筛选结果走 {@code rosterForExport}，它自己会落审计）
     * @param userIds 本次导出的员工 id
     * @return 落在权限范围内的实际人数
     */
    int recordExportTrace(String scope, List<Long> userIds);
}
