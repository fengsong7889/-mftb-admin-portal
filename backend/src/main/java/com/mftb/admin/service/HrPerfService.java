package com.mftb.admin.service;

import com.mftb.admin.dto.HrPerfAssessmentVO;
import com.mftb.admin.dto.HrPerfCycleSaveDTO;
import com.mftb.admin.dto.HrPerfCycleVO;
import com.mftb.admin.dto.HrPerfPlanLaunchDTO;
import com.mftb.admin.dto.HrPerfPlanVO;
import com.mftb.admin.dto.HrPerfScoreSubmitDTO;
import com.mftb.admin.dto.HrPerfTemplateSaveDTO;
import com.mftb.admin.dto.HrPerfTemplateVO;
import com.mftb.admin.dto.PageResult;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 績效考核服务（周期/模板/计划/评分/校准/自助）。
 * <p>
 * 三条硬口径：
 * 1) 总分一律由服务端按指标权重加权得出，不接受前端传入；
 * 2) 评估人以 {@code evaluator_user_id}（BIGINT）为权威，姓名仅快照，部门负责人歧义时不猜；
 * 3) 结果在整批审批确认前对本人不可见，敏感字段在服务端裁剪。
 */
public interface HrPerfService {

    // ==================== 周期 ====================

    PageResult<HrPerfCycleVO> pageCycles(long page, long size, String status, String keyword);

    HrPerfCycleVO saveCycle(Long id, HrPerfCycleSaveDTO dto);

    /** 发布周期：仅已发布周期可发起计划 */
    void changeCycleStatus(Long id, String status);

    // ==================== 模板 ====================

    PageResult<HrPerfTemplateVO> pageTemplates(long page, long size, String keyword);

    HrPerfTemplateVO getTemplate(Long id);

    /** 保存模板：指标与等级方案整体替换，权重合计须等于 weightSum */
    HrPerfTemplateVO saveTemplate(Long id, HrPerfTemplateSaveDTO dto);

    // ==================== 计划 ====================

    /** 发起表单的圈范围选项（可用部门 + 现存职级），避免前端拼 mock 或越权拉全量员工 */
    Map<String, Object> scopeOptions();

    /** 评估人改派下拉（在职员工，按姓名/工号搜索） */
    List<Map<String, Object>> evaluatorOptions(String keyword);

    /** 发起前范围预览：命中人数与「无评估人」清单，避免静默卡住流程 */
    Map<String, Object> previewLaunch(HrPerfPlanLaunchDTO dto);

    /** 发起计划：生成考核单与打分明细，并按部门负责人唯一命中自动指派评估人 */
    HrPerfPlanVO launchPlan(HrPerfPlanLaunchDTO dto);

    PageResult<HrPerfPlanVO> pagePlans(long page, long size, Long cycleId, String status);

    HrPerfPlanVO getPlan(Long id);

    /** 计划内考核单清单（台账视图，供计划进度页使用，周期管理或校准菜单均可） */
    PageResult<HrPerfAssessmentVO> pagePlanAssessments(Long planId, long page, long size, String status, String keyword);

    // ==================== 评分 ====================

    /** 考核单详情：按调用者身份（本人/评估人/HR）鉴权并裁剪敏感字段 */
    HrPerfAssessmentVO getAssessment(Long id);

    /** 提交评分：本人即自评、指定评估人即上级评；submit=false 只暂存明细 */
    HrPerfAssessmentVO submitScore(Long id, HrPerfScoreSubmitDTO dto);

    /** 我的待评清单（评分工作台） */
    PageResult<HrPerfAssessmentVO> pageMyReviews(long page, long size, String status, String keyword);

    /** 改派评估人 */
    void reassign(Long assessmentId, Long evaluatorUserId);

    // ==================== 校准与确认 ====================

    PageResult<HrPerfAssessmentVO> pageCalibration(long page, long size, Long planId, String status, String keyword);

    /** 校准改判：分数与等级可改，改判必须写理由 */
    HrPerfAssessmentVO calibrate(Long id, BigDecimal score, String grade, String reason);

    /** 计划所用模板的等级清单（校准改判下拉只能用这些等级，不必持有周期管理菜单） */
    List<Map<String, Object>> planGrades(Long planId);

    /**
     * 整批提交 HR 审批：同一计划共用一条流程，避免审批中心被逐人单据刷爆。
     * 等级分布超出建议占比时：waiveDistribution 不为 true 则拒绝，为 true 则必须带理由并留痕。
     */
    HrPerfPlanVO submitConfirm(Long planId, Boolean waiveDistribution, String waiveReason);

    // ==================== 员工自助 ====================

    PageResult<HrPerfAssessmentVO> pageMyAssessments(long page, long size, String status);

    HrPerfAssessmentVO getMyAssessment(Long id);
}
