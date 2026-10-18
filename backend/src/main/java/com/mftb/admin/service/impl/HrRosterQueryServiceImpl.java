package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.HrOperationCode;
import com.mftb.admin.dto.EmployeeVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.EmpPositionRecord;
import com.mftb.admin.entity.HrEmploymentPeriod;
import com.mftb.admin.service.EmployeeService;
import com.mftb.admin.service.HrAssignmentQuery;
import com.mftb.admin.service.HrEmploymentPeriodService;
import com.mftb.admin.service.HrRosterQueryService;
import com.mftb.admin.service.OrgScopeService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 花名册查询实现：先按人员范围取数，再用三张事实源批量富化（各一次查询，不按人 N+1）。
 * <p>
 * 两条取向：
 * <ul>
 *   <li><b>派生不出来就留空 + UNVERIFIED/UNKNOWN</b>：花名册的「入职日期」曾经直接显示账号创建日，
 *       那是最容易被 HR 当真的假数据；宁可显示「未核实」也不能编。</li>
 *   <li><b>列表与导出共用同一个取数方法</b>：两处口径一旦分叉，导出就会成为绕过范围收敛的出口。</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class HrRosterQueryServiceImpl implements HrRosterQueryService {

    private final EmployeeService employeeService;
    private final HrAssignmentQuery hrAssignmentQuery;
    private final HrEmploymentPeriodService employmentPeriodService;
    private final OrgScopeService orgScopeService;

    @Override
    public PageResult<EmployeeVO> roster(long page, long size, String keyword, String employmentStatus,
                                         Long departmentId, String sequence, String jobLevel, String rank,
                                         Long roleId, String updatedBy, String updatedAtFrom, String updatedAtTo) {
        PageResult<EmployeeVO> result = employeeService.list(page, size, keyword, employmentStatus,
                departmentId, sequence, jobLevel, rank, roleId, updatedBy, updatedAtFrom, updatedAtTo,
                orgScopeService.resolveVisibleUserIds());
        enrich(result.getRecords());
        return result;
    }

    @Override
    public List<EmployeeVO> rosterForExport(String keyword, String employmentStatus,
                                            Long departmentId, String sequence, String jobLevel, String rank,
                                            Long roleId, String updatedBy, String updatedAtFrom, String updatedAtTo) {
        // 多取一条用来判上限：不拿 Integer.MAX_VALUE 去撞库，也不静默截断成"看起来完整"的文件
        PageResult<EmployeeVO> result = roster(1, EmployeeService.ROSTER_EXPORT_MAX_ROWS + 1L,
                keyword, employmentStatus, departmentId, sequence, jobLevel, rank, roleId,
                updatedBy, updatedAtFrom, updatedAtTo);
        if (result.getTotal() > EmployeeService.ROSTER_EXPORT_MAX_ROWS) {
            throw new BusinessException("命中 " + result.getTotal() + " 人，超過單次匯出上限 "
                    + EmployeeService.ROSTER_EXPORT_MAX_ROWS + "；請縮小篩選範圍");
        }
        return result.getRecords();
    }

    /** 批量富化花名册列：as-of 任职 + 全部历史（判雇佣起点/转正）+ 已登记雇佣期间 */
    private void enrich(List<EmployeeVO> rows) {
        if (rows.isEmpty()) {
            return;
        }
        LocalDate today = LocalDate.now();
        List<Long> userIds = rows.stream().map(EmployeeVO::getId).filter(java.util.Objects::nonNull).toList();
        Map<Long, EmpPositionRecord> asOf = hrAssignmentQuery.asOfRecords(userIds, today);
        Map<Long, List<EmpPositionRecord>> history = hrAssignmentQuery.historyOf(userIds);
        Map<Long, List<HrEmploymentPeriod>> periods = employmentPeriodService.listByUsers(userIds);

        for (EmployeeVO vo : rows) {
            EmpPositionRecord effective = asOf.get(vo.getId());
            if (effective != null) {
                vo.setEmployerCompany(effective.getCompany());
                vo.setEmployeeCategory(effective.getEmployeeCategory());
                // 工作地点取「工作城市」：officeAddress 是办公地址明细，不是地点维度
                vo.setWorkLocation(effective.getWorkCity());
                vo.setDirectSuperior(effective.getDirectSuperior());
            }
            applyEmploymentStart(vo, periods.getOrDefault(vo.getId(), List.of()),
                    history.getOrDefault(vo.getId(), List.of()), today);
            applyProbation(vo, periods.getOrDefault(vo.getId(), List.of()),
                    history.getOrDefault(vo.getId(), List.of()), today);
        }
    }

    /** 雇佣起点：已登记的雇佣期间优先（可能含 HR 人工确认值），否则回退到任职事实的入职锚点 */
    private void applyEmploymentStart(EmployeeVO vo, List<HrEmploymentPeriod> registered,
                                      List<EmpPositionRecord> records, LocalDate today) {
        HrEmploymentPeriod current = registered.stream()
                .filter(p -> p.getStartDate() != null && !p.getStartDate().isAfter(today))
                .filter(p -> p.getEndDate() == null || !p.getEndDate().isBefore(today))
                .max(java.util.Comparator.comparing(HrEmploymentPeriod::getStartDate))
                .orElse(null);
        if (current != null) {
            vo.setHireDate(current.getStartDate());
            vo.setHireDateSource(current.getStartDateSource());
            return;
        }
        records.stream()
                .filter(r -> r.getEffectiveDate() != null && !r.getEffectiveDate().isAfter(today))
                .filter(r -> HrOperationCode.isEmploymentStart(r.getOperationCode(), r.getOperation()))
                .max(java.util.Comparator.comparing(EmpPositionRecord::getEffectiveDate))
                .ifPresentOrElse(r -> {
                    vo.setHireDate(r.getEffectiveDate());
                    vo.setHireDateSource(HrEmploymentPeriod.SOURCE_POSITION_RECORD);
                }, () -> {
                    vo.setHireDate(null);
                    vo.setHireDateSource(HrEmploymentPeriod.SOURCE_UNVERIFIED);
                });
    }

    /**
     * 试用状态：只有「转正事实」才敢报 REGULAR；没登记试用期就报 UNKNOWN。
     * <p>不把「没有转正记录」当成「还在试用期」：老员工的转正往往根本没补录，
     * 那样会把一批正式员工标成试用期员工，直接影响薪酬与福利筛选。
     */
    private void applyProbation(EmployeeVO vo, List<HrEmploymentPeriod> registered,
                               List<EmpPositionRecord> records, LocalDate today) {
        HrEmploymentPeriod current = registered.stream()
                .filter(p -> p.getStartDate() != null && !p.getStartDate().isAfter(today))
                .filter(p -> p.getEndDate() == null || !p.getEndDate().isBefore(today))
                .max(java.util.Comparator.comparing(HrEmploymentPeriod::getStartDate))
                .orElse(null);
        if (current != null) {
            if (current.getRegularDate() != null && !current.getRegularDate().isAfter(today)) {
                vo.setProbationStatus(REGULAR);
            } else if (current.getProbationEndDate() != null) {
                vo.setProbationStatus(!current.getProbationEndDate().isBefore(today) ? PROBATION : PROBATION_UNKNOWN);
            } else {
                vo.setProbationStatus(PROBATION_UNKNOWN);
            }
            return;
        }
        boolean regularized = records.stream()
                .filter(r -> r.getEffectiveDate() != null && !r.getEffectiveDate().isAfter(today))
                .anyMatch(r -> HrOperationCode.REGULAR.equals(HrOperationCode.resolve(
                        r.getOperationCode() == null ? r.getOperation() : r.getOperationCode())));
        vo.setProbationStatus(regularized ? REGULAR : PROBATION_UNKNOWN);
    }
}
