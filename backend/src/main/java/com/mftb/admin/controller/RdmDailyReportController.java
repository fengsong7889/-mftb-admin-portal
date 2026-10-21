package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmDailyReportVO.Config;
import com.mftb.admin.dto.RdmDailyReportVO.ConfigForm;
import com.mftb.admin.dto.RdmDailyReportVO.PreviewForm;
import com.mftb.admin.dto.RdmDailyReportVO.PreviewResult;
import com.mftb.admin.dto.RdmDailyReportVO.PublicView;
import com.mftb.admin.dto.RdmDailyReportVO.ReceiverPreview;
import com.mftb.admin.dto.RdmDailyReportVO.ReportRecord;
import com.mftb.admin.dto.RdmDailyReportVO.Rule;
import com.mftb.admin.dto.RdmDailyReportVO.RuleForm;
import com.mftb.admin.dto.RdmDailyReportVO.Snapshot;
import com.mftb.admin.dto.RdmDailyReportVO.Template;
import com.mftb.admin.dto.RdmDailyReportVO.TemplateForm;
import com.mftb.admin.dto.RdmDailyReportVO.TriggerResult;
import com.mftb.admin.service.RdmDailyReportService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * RDM 進度日報接口：规则、模板、全局开关、快照、发送记录、预览与手动触发。
 *
 * <p><b>权限按「菜单即职责」拆开，刻意不合并</b>（对应一级菜单下的四个二级页）：
 * <ul>
 *   <li><b>推送配置</b>（{@code rdm-daily-report-rule}）：规则 CRUD + 全局开关，view/edit。</li>
 *   <li><b>模板配置</b>（{@code rdm-daily-report-template}）：模板 CRUD 与预览，view/edit。</li>
 *   <li><b>发送记录</b>（{@code rdm-daily-report-record}）：只读历史，view。</li>
 *   <li><b>手动触发</b>（{@code rdm-daily-report-trigger}）：独立 {@code trigger} 动作。
 *       <b>能改配置不等于能向全公司群发</b>，因此单独授予，避免「谁都能编辑模板，谁就都能刷群」。</li>
 * </ul>
 *
 * <p>快照只读额外用 {@code anyOf} 放行各 RDM 承载菜单：日报是推给 PM/产品负责人看的工作内容，
 * 他们未必持有「進度日報」菜单，否则从钉钉点开链接就是 403，推送等于白发。
 */
@RestController
@RequestMapping("/api/rdm/daily-report")
@RequiredArgsConstructor
@Tag(name = "產研交付 - 進度日報", description = "推送規則、模板、快照、發送記錄、預覽與手動觸發")
public class RdmDailyReportController {

    private final RdmDailyReportService dailyReportService;
    private final OperatorResolver operatorResolver;

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    /* ==================== 快照与记录（只读） ==================== */

    /**
     * 查某日某档日报快照（移动端日报页数据源）。
     * <p>返回 null 表示当日该档还没生成（未推送或日期超出保留范围），由前端展示空态而非报错。
     */
    @GetMapping
    @RequirePermission(menu = RdmConstants.MENU_DAILY_REPORT_RULE,
            anyOf = {RdmConstants.MENU_DASHBOARD_BOARD, RdmConstants.MENU_WORKBENCH,
                    RdmConstants.MENU_REQUIREMENT, RdmConstants.MENU_DELIVERY_BOARD})
    @Operation(summary = "日报快照（按日期与档位，可选按项目/迭代/范围键收敛）")
    public Result<Snapshot> snapshot(@RequestParam String date,
                                     @RequestParam(defaultValue = "morning") String type,
                                     @RequestParam(required = false) Long projectId,
                                     @RequestParam(required = false) String iterationCode,
                                     @RequestParam(required = false) String scopeKey) {
        return Result.success(dailyReportService.getSnapshot(
                parseDate(date), type, projectId, iterationCode, scopeKey));
    }

    /** 发送记录（发送记录页） */
    @GetMapping("/records")
    @RequirePermission(menu = RdmConstants.MENU_DAILY_REPORT_RECORD)
    @Operation(summary = "日报发送记录")
    public Result<List<ReportRecord>> records(@RequestParam(required = false) Integer limit) {
        return Result.success(dailyReportService.listRecords(limit));
    }

    /* ==================== 推送规则 ==================== */

    @GetMapping("/rules")
    @RequirePermission(menu = RdmConstants.MENU_DAILY_REPORT_RULE)
    @Operation(summary = "推送规则列表（含项目与迭代名称）")
    public Result<List<Rule>> rules() {
        return Result.success(dailyReportService.listRules());
    }

    @PostMapping("/rule")
    @RequirePermission(menu = RdmConstants.MENU_DAILY_REPORT_RULE, action = "edit")
    @Operation(summary = "保存推送规则（带 id 为编辑，否则新增）")
    public Result<Rule> saveRule(@RequestBody RuleForm form) {
        return Result.success("推送規則已保存", dailyReportService.saveRule(form, operatorName()));
    }

    @DeleteMapping("/rule/{id}")
    @RequirePermission(menu = RdmConstants.MENU_DAILY_REPORT_RULE, action = "edit")
    @Operation(summary = "删除推送规则（软删除，历史记录保留）")
    public Result<Void> deleteRule(@PathVariable Long id) {
        dailyReportService.deleteRule(id, operatorName());
        return Result.success("推送規則已刪除", null);
    }

    /* ==================== 全局开关与默认模板 ==================== */

    @GetMapping("/config")
    @RequirePermission(menu = RdmConstants.MENU_DAILY_REPORT_RULE)
    @Operation(summary = "读全局开关与默认模板")
    public Result<Config> config() {
        return Result.success(dailyReportService.loadConfig());
    }

    @PutMapping("/config")
    @RequirePermission(menu = RdmConstants.MENU_DAILY_REPORT_RULE, action = "edit")
    @Operation(summary = "保存全局开关与默认模板")
    public Result<Config> saveConfig(@RequestBody ConfigForm form) {
        return Result.success("全局配置已保存", dailyReportService.saveConfig(form, operatorName()));
    }

    /**
     * 个人日报收件人预览：按当前配置 + 规则实时范围现算「会发给谁、谁会收不到」。
     *
     * <p><b>为何不读快照</b>：快照是「上次发了什么」，预览是「改完配置下次会怎样」；
     * 且历史快照不含新增的四类角色 userId，读快照会把新勾选的角色全部漏掉。
     *
     * <p>权限只要求 view：能看配置的人就应该能看「这份配置会发给谁」，
     * 但不开放给仅有其他 RDM 菜单的人——员工姓名与钉钉绑定状态不应当成公共数据。
     */
    @GetMapping("/receiver-preview")
    @RequirePermission(menu = RdmConstants.MENU_DAILY_REPORT_RULE)
    @Operation(summary = "个人日报收件人预览（按当前配置现算，不读快照）")
    public Result<ReceiverPreview> receiverPreview(@RequestParam(required = false) Long ruleId) {
        return Result.success(dailyReportService.previewReceivers(ruleId));
    }

    /* ==================== 推送模板 ==================== */

    @GetMapping("/templates")
    @RequirePermission(menu = RdmConstants.MENU_DAILY_REPORT_TEMPLATE)
    @Operation(summary = "模板列表（channel 可选：group/personal）")
    public Result<List<Template>> templates(@RequestParam(required = false) String channel) {
        return Result.success(dailyReportService.listTemplates(channel));
    }

    /**
     * 员工候选：按姓名/工号搜索，或按 {@code ids} 批量回显（收件人编辑态用）。
     *
     * <p><b>为什么不用通用 /api/employees</b>：那个接口挂在 employee-management 菜单下，
     * 只被授予「進度日報」菜单的用户会得到 403，下拉静默为空。这里把权限锚定在两个日报菜单上，
     * 模板页与推送配置页都能用，且只返回姓名+工号，不暴露部门/职位。
     *
     * <p><b>为何要 anyOf 放宽到推送配置</b>：v3.26 起个人日报收件人要在这里选人，
     * 只持有「推送配置」权限的管理员不应因为缺「模板配置」菜单就选不了人。
     *
     * <p><b>为何要支持 ids</b>：多选收件人编辑态回显时若拿不到 label，
     * antd 会把 userId 渲染成裸数字，用户无法确认选的是谁。
     */
    @GetMapping("/employee-options")
    @RequirePermission(menu = RdmConstants.MENU_DAILY_REPORT_TEMPLATE,
            anyOf = {RdmConstants.MENU_DAILY_REPORT_RULE})
    @Operation(summary = "员工下拉（按姓名/工号搜索或按 ID 回显）：模板最后更新人与日报收件人共用")
    public Result<List<Map<String, Object>>> employeeOptions(@RequestParam(required = false) String keyword,
                                                             @RequestParam(required = false) String ids) {
        return Result.success(dailyReportService.employeeOptions(keyword, ids));
    }

    @PostMapping("/template")
    @RequirePermission(menu = RdmConstants.MENU_DAILY_REPORT_TEMPLATE, action = "edit")
    @Operation(summary = "保存模板（templateKey 为空表示另存为新模板）")
    public Result<Template> saveTemplate(@RequestBody TemplateForm form) {
        return Result.success("模板已保存", dailyReportService.saveTemplate(form, operatorName()));
    }

    @DeleteMapping("/template/{id}")
    @RequirePermission(menu = RdmConstants.MENU_DAILY_REPORT_TEMPLATE, action = "edit")
    @Operation(summary = "删除模板（预置模板与正在选用的模板不可删）")
    public Result<Void> deleteTemplate(@PathVariable Long id) {
        dailyReportService.deleteTemplate(id, operatorName());
        return Result.success("模板已刪除", null);
    }

    @PostMapping("/template/{key}/apply")
    @RequirePermission(menu = RdmConstants.MENU_DAILY_REPORT_TEMPLATE, action = "edit")
    @Operation(summary = "设为全局默认模板")
    public Result<Void> applyTemplate(@PathVariable String key) {
        dailyReportService.applyAsSelected(key, operatorName());
        return Result.success("已設為默認模板", null);
    }

    /* ==================== 预览与手动触发 ==================== */

    /** 预览：按（可能是未存盘的草稿）模板渲染真实数据，不发送、不落库 */
    @PostMapping("/preview")
    @RequirePermission(menu = RdmConstants.MENU_DAILY_REPORT_TEMPLATE,
            anyOf = {RdmConstants.MENU_DAILY_REPORT_RULE})
    @Operation(summary = "渲染预览（不发送）")
    public Result<PreviewResult> preview(@RequestBody PreviewForm form) {
        return Result.success(dailyReportService.preview(form));
    }

    /**
     * 看板实时预览：手动触发页选定项目/迭代后，按当前数据即时生成一份视图，
     * <b>不发送、不落库</b>。
     *
     * <p>为什么不复用公开看板链接：公开看板按令牌读取「已落库快照」，手动触发在真正推送前
     * 还没有快照，链接只会显示“該日期的日報尚未生成”。实时预览必须现算，才能做到点开即看。
     */
    @GetMapping("/board-preview")
    @RequirePermission(menu = RdmConstants.MENU_DAILY_REPORT_TRIGGER, action = "trigger")
    @Operation(summary = "看板实时预览（不发送、不落库）")
    public Result<PublicView> boardPreview(@RequestParam(defaultValue = "morning") String type,
                                           @RequestParam(required = false) Long projectId,
                                           @RequestParam(required = false) String projectIds,
                                           @RequestParam(required = false, defaultValue = "false") boolean allProjects,
                                           @RequestParam(required = false) String iterationCode) {
        List<Long> ids = parseProjectIds(projectIds, projectId, allProjects);
        return Result.success(dailyReportService.boardPreview(type, ids, iterationCode));
    }

    /**
     * 手动触发推送：选定项目（可选指定迭代）+ 内容档位，立即推送。
     * <p>独立 {@code trigger} 动作授权；服务端有节流（同一档位+项目一分钟内重复触发拒绝），
     * 前端另需二次确认弹窗——向项目负责人与钉钉群发消息是不可撤回动作，两道闸都不能省。
     */
    @PostMapping("/trigger")
    @RequirePermission(menu = RdmConstants.MENU_DAILY_REPORT_TRIGGER, action = "trigger")
    @Operation(summary = "手动触发日报推送（按项目/迭代）")
    public Result<TriggerResult> trigger(@RequestParam String type,
                                         @RequestParam(required = false) Long projectId,
                                         @RequestParam(required = false) String projectIds,
                                         @RequestParam(required = false, defaultValue = "false") boolean allProjects,
                                         @RequestParam(required = false) String iterationCode,
                                         @RequestParam(required = false, defaultValue = "false") boolean dryRun) {
        List<Long> ids = parseProjectIds(projectIds, projectId, allProjects);
        if (ids.isEmpty() && !allProjects && !StringUtils.hasText(iterationCode)) {
            throw new BusinessException("請選擇推送項目或全部項目");
        }
        if (allProjects && StringUtils.hasText(iterationCode)) {
            throw new BusinessException("全部項目不能指定單一迭代");
        }
        TriggerResult r = dailyReportService.triggerManual(type, ids, iterationCode, operatorName(), dryRun);
        return Result.success(r.getMessage(), r);
    }

    /** 解析逗号分隔项目 ID；allProjects=true 时忽略单项目，空集合代表全部在途项目 */
    private static List<Long> parseProjectIds(String projectIds, Long projectId, boolean allProjects) {
        if (allProjects) {
            return List.of();
        }
        if (StringUtils.hasText(projectIds)) {
            List<Long> ids = new ArrayList<>();
            for (String part : projectIds.split(",")) {
                if (!StringUtils.hasText(part)) {
                    continue;
                }
                try {
                    ids.add(Long.parseLong(part.trim()));
                } catch (NumberFormatException e) {
                    throw new BusinessException("項目ID格式不正確: " + part);
                }
            }
            return ids.stream().distinct().toList();
        }
        return projectId == null ? List.of() : List.of(projectId);
    }

    /* ==================== 内部工具 ==================== */

    /**
     * 严格解析日期：非法格式直接拒绝。
     * <p>不把非法日期兜底成「今天」——那会让用户以为查的是某一天、实际看到的是另一天，
     * 比报错更糟。
     */
    private static LocalDate parseDate(String date) {
        if (!StringUtils.hasText(date)) {
            throw new BusinessException("日期不能为空");
        }
        try {
            return LocalDate.parse(date.trim(), DATE_FMT);
        } catch (DateTimeParseException e) {
            throw new BusinessException("日期格式必须为 yyyy-MM-dd: " + date);
        }
    }

    private String operatorName() {
        String name = operatorResolver.currentOperatorName();
        return StringUtils.hasText(name) ? name : "system";
    }
}
