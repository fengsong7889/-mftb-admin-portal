package com.mftb.admin.service;

import com.mftb.admin.dto.HrPerfAppealSubmitDTO;
import com.mftb.admin.dto.HrPerfAppealVO;
import com.mftb.admin.dto.HrPerfAssessmentVO;
import com.mftb.admin.dto.HrPerfCalibrationLogVO;
import com.mftb.admin.dto.HrPerfReportVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.HrPerfAssessment;
import com.mftb.admin.entity.HrPerfPlan;

import java.math.BigDecimal;
import java.util.List;

/**
 * 績效台账服务（M2：改判留痕 / 强制分布校验 / 申诉登记 / 结果台账）。
 * <p>
 * 与绩效执行服务分开但单向依赖：本服务只依赖数据层，由执行服务在改判与整批提交时回调写入留痕，
 * 避免两个 Service 互注入成构造器循环。台账统计一律只取「已确认」结果——未确认的分数对本人
 * 都不可见，混进台账等于提前对外发布绩效。
 */
public interface HrPerfReportService {

    // ==================== 留痕 ====================

    /** 记录一次改判动作（CALIBRATE / APPEAL_REVISE）；只增不改 */
    void logCalibration(HrPerfAssessment assessment, String action, BigDecimal beforeScore, String beforeGrade,
                        BigDecimal afterScore, String afterGrade, String reason, Long appealId);

    /** 记录强制分布例外放行（计划级动作，无具体考核单） */
    void logDistributionWaiver(HrPerfPlan plan, String reason);

    /** 留痕分页（台账/审计菜单） */
    PageResult<HrPerfCalibrationLogVO> pageLogs(long page, long size, Long planId, Long assessmentId,
                                               String action, String keyword);

    /** 单张考核单的留痕时间线（仅 HR 侧菜单可见，员工不得从这里反推上级评分） */
    List<HrPerfCalibrationLogVO> logsOfAssessment(Long assessmentId);

    // ==================== 强制分布 ====================

    /** 计划内超出建议占比的等级项；返回空表示达标。口径：按建议占比取上限，超编才算违规 */
    List<HrPerfReportVO.GradeCount> distributionGap(Long planId);

    /** 是否满足强制分布（软校验用：不满足时提交需例外放行并留痕） */
    boolean distributionSatisfied(Long planId);

    // ==================== 申诉 ====================

    /** 员工对本人已确认结果提申诉 */
    HrPerfAppealVO submitAppeal(Long assessmentId, HrPerfAppealSubmitDTO dto);

    /** 我的申诉（自助视角，服务端强制本人） */
    PageResult<HrPerfAppealVO> pageMyAppeals(long page, long size, String status);

    /** HR 申诉台账 */
    PageResult<HrPerfAppealVO> pageAppeals(long page, long size, Long planId, String status, String keyword);

    /** 申诉详情：HR 或申诉人本人 */
    HrPerfAppealVO getAppeal(Long id);

    /** 受理/办结/驳回申诉（终态需填结论） */
    HrPerfAppealVO handleAppeal(Long id, String status, String conclusion);

    /** 申诉受理后直接修订已下发结果（带留痕并把申诉置为已办结） */
    HrPerfAppealVO reviseFromAppeal(Long id, BigDecimal score, String grade, String reason);

    // ==================== 结果台账 ====================

    /** 等级分布 / 部门对比 / 趋势（cycleId 与 planId 可空表示全量已确认结果） */
    HrPerfReportVO report(Long cycleId, Long planId);

    /** 台账明细分页（供导出与钻取） */
    PageResult<HrPerfAssessmentVO> pageReportRows(long page, long size, Long cycleId, Long planId,
                                                 String deptName, String grade, String keyword);

    /** 台账可选部门（取自已确认结果里的部门快照，不拿全量部门干扰筛选口径） */
    List<String> reportDepartments(Long cycleId, Long planId);

    /** 台账汇总条数（导出前置检查用） */
    long countReportRows(Long cycleId, Long planId);
}
