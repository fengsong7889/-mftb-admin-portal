/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.service.cpm.CpmCfrService;
import com.mftb.admin.service.cpm.CpmItemService;
import com.mftb.admin.service.cpm.CpmReportService;
import com.mftb.admin.service.cpm.CpmRuleService;
import com.mftb.admin.service.cpm.CpmSourceService;
import com.mftb.admin.service.cpm.CpmTeamService;
import com.mftb.admin.service.cpm.CpmTemplateService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 持續績效（cpm）主接口。
 *
 * <p>控制器只做「菜单入口 + 动作」门禁，数据边界全部在服务层：
 * 使用侧读写硬约束登录人；治理侧读走阅读范围、写走 CFR 资格。
 * 工作记录/汇报正文是敏感内容，响应统一 no-store。
 */
@RestController
@RequestMapping("/api/cpm")
@RequiredArgsConstructor
public class CpmController {

    private static final String MY = CpmConstants.MENU_MY;
    private static final String REPORT = CpmConstants.MENU_REPORT;
    private static final String TEAM = CpmConstants.MENU_TEAM;
    private static final String TEMPLATE = CpmConstants.MENU_TEMPLATE;
    private static final String RULE = CpmConstants.MENU_RULE;

    private final CpmItemService itemService;
    private final CpmReportService reportService;
    private final CpmTeamService teamService;
    private final CpmCfrService cfrService;
    private final CpmTemplateService templateService;
    private final CpmRuleService ruleService;
    private final CpmSourceService sourceService;

    /* ==================== 我的工作記錄 ==================== */

    @GetMapping("/items/day")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_VIEW)
    public Result<CpmDto.DayVO> dayView(@RequestParam(required = false) String date, HttpServletResponse response) {
        noStore(response);
        return Result.success(itemService.dayView(date));
    }

    @GetMapping("/items/{id}")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_VIEW)
    public Result<CpmDto.ItemVO> itemDetail(@PathVariable("id") long id, HttpServletResponse response) {
        noStore(response);
        return Result.success(itemService.detail(id));
    }

    @PostMapping("/items")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_EDIT)
    public Result<CpmDto.ItemVO> createItem(@RequestBody @Valid CpmDto.ItemForm form, HttpServletResponse response) {
        noStore(response);
        return Result.success("已記錄", itemService.create(form));
    }

    @PutMapping("/items/{id}")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_EDIT)
    public Result<CpmDto.ItemVO> updateItem(@PathVariable("id") long id,
                                            @RequestBody @Valid CpmDto.ItemForm form,
                                            HttpServletResponse response) {
        noStore(response);
        return Result.success("已更新", itemService.update(id, form));
    }

    @DeleteMapping("/items/{id}")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_EDIT)
    public Result<Void> deleteItem(@PathVariable("id") long id) {
        itemService.delete(id);
        return Result.success("已刪除", null);
    }

    @PostMapping("/items/{id}/progress")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_EDIT)
    public Result<Void> addProgress(@PathVariable("id") long id, @RequestBody @Valid CpmDto.ProgressForm form) {
        itemService.addProgress(id, form);
        return Result.success("進度已更新", null);
    }

    @PostMapping("/items/{id}/carry")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_EDIT)
    public Result<Void> carryOver(@PathVariable("id") long id) {
        itemService.carryOver(id);
        return Result.success("已帶入今天", null);
    }

    /* ==================== 关联业务对象（导入候选，只读） ==================== */

    /**
     * 本人相关的 RDM 需求清单。门禁取 cpm-my 的 view：能看到自己的记录，
     * 就能看到与自己相关的需求（RDM 侧仍按「某人视角」口径收敛，不额外扩权）。
     */
    @GetMapping("/sources/rdm")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_VIEW)
    public Result<List<CpmDto.SourceVO>> rdmSources(@RequestParam(required = false) String keyword,
                                                    HttpServletResponse response) {
        noStore(response);
        return Result.success(sourceService.listRdmRequirements(keyword));
    }

    /** 本人负责（含协办）的未完成会议行动项清单 */
    @GetMapping("/sources/meeting-actions")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_VIEW)
    public Result<List<CpmDto.SourceVO>> meetingActionSources(HttpServletResponse response) {
        noStore(response);
        return Result.success(sourceService.listMeetingActions());
    }

    /* ==================== 我的匯報 ==================== */

    @GetMapping("/reports/preview")
    @RequirePermission(menu = REPORT, action = CpmConstants.ACTION_VIEW)
    public Result<CpmDto.Snapshot> preview(@RequestParam String periodType, @RequestParam String periodStart,
                                           HttpServletResponse response) {
        noStore(response);
        return Result.success(reportService.preview(periodType, periodStart));
    }

    @GetMapping("/reports/current")
    @RequirePermission(menu = REPORT, action = CpmConstants.ACTION_VIEW)
    public Result<CpmDto.ReportVO> current(@RequestParam String periodType, @RequestParam String periodStart,
                                           HttpServletResponse response) {
        noStore(response);
        return Result.success(reportService.current(periodType, periodStart));
    }

    @GetMapping("/reports/mine")
    @RequirePermission(menu = REPORT, action = CpmConstants.ACTION_VIEW)
    public Result<List<CpmDto.ReportVO>> listMine(@RequestParam(required = false) String periodType,
                                                  HttpServletResponse response) {
        noStore(response);
        return Result.success(reportService.listMine(periodType));
    }

    @PostMapping("/reports/draft")
    @RequirePermission(menu = REPORT, action = CpmConstants.ACTION_EDIT)
    public Result<CpmDto.ReportVO> saveDraft(@RequestBody @Valid CpmDto.DraftForm form, HttpServletResponse response) {
        noStore(response);
        return Result.success("草稿已保存", reportService.saveDraft(form));
    }

    /** 发布=提交（幂等由条件 UPDATE 保证）；响应带最新视图，前端不再二次请求 */
    @PostMapping("/reports/publish")
    @RequirePermission(menu = REPORT, action = CpmConstants.ACTION_EDIT)
    public Result<CpmDto.ReportVO> publish(@RequestBody @Valid CpmDto.DraftForm form, HttpServletResponse response) {
        noStore(response);
        return Result.success("已發布", reportService.publish(form));
    }

    /**
     * 汇报详情：本人 or 阅读范围（anyOf 让主管从 cpm-team 进入同一端点）。
     * 打开时服务端登记已读回执。
     */
    @GetMapping("/reports/{id}")
    @RequirePermission(menu = REPORT, anyOf = {TEAM})
    public Result<CpmDto.ReportVO> detail(@PathVariable("id") long id, HttpServletResponse response) {
        noStore(response);
        return Result.success(reportService.detail(id));
    }

    /* ==================== 团队视图（治理侧） ==================== */

    @GetMapping("/team/board")
    @RequirePermission(menu = TEAM, action = CpmConstants.ACTION_VIEW)
    public Result<CpmDto.TeamVO> teamBoard(@RequestParam String periodType, @RequestParam String periodStart,
                                           HttpServletResponse response) {
        noStore(response);
        return Result.success(teamService.board(periodType, periodStart));
    }

    /** 手动催办：动作单独授予（能看团队不等于能向全员发提醒） */
    @PostMapping("/team/remind")
    @RequirePermission(menu = RULE, action = CpmConstants.ACTION_TRIGGER)
    public Result<Void> remind(@RequestParam long userId, @RequestParam String periodType,
                               @RequestParam String periodStart) {
        teamService.remindMember(userId, periodType, periodStart);
        return Result.success("提醒已登記", null);
    }

    /* ==================== CFR 反馈 ==================== */

    @PostMapping("/cfr/comments")
    @RequirePermission(menu = TEAM, action = CpmConstants.ACTION_EDIT)
    public Result<CpmDto.CommentVO> addComment(@RequestBody @Valid CpmDto.CommentForm form,
                                               HttpServletResponse response) {
        noStore(response);
        return Result.success("已發布評論", cfrService.addComment(form));
    }

    @GetMapping("/cfr/comments")
    @RequirePermission(menu = REPORT, anyOf = {TEAM})
    public Result<List<CpmDto.CommentVO>> listComments(@RequestParam String targetType, @RequestParam long targetId,
                                                       HttpServletResponse response) {
        noStore(response);
        return Result.success(cfrService.listComments(targetType, targetId));
    }

    @DeleteMapping("/cfr/comments/{id}")
    @RequirePermission(menu = REPORT, anyOf = {TEAM})
    public Result<Void> deleteComment(@PathVariable("id") long id) {
        cfrService.deleteComment(id);
        return Result.success("已刪除評論", null);
    }

    @PostMapping("/cfr/reactions")
    @RequirePermission(menu = TEAM, action = CpmConstants.ACTION_EDIT)
    public Result<Map<String, Object>> toggleReaction(@RequestParam String targetType, @RequestParam long targetId) {
        boolean active = cfrService.toggleReaction(targetType, targetId);
        return Result.success(Map.of("liked", active));
    }

    @PostMapping("/cfr/recognitions")
    @RequirePermission(menu = TEAM, action = CpmConstants.ACTION_EDIT)
    public Result<CpmDto.RecognitionVO> recognize(@RequestBody @Valid CpmDto.RecognitionForm form,
                                                  HttpServletResponse response) {
        noStore(response);
        return Result.success("已發起成果認定", cfrService.recognize(form));
    }

    /** 个人成果档案：本人入口（cpm-report 页签） */
    @GetMapping("/cfr/recognitions/mine")
    @RequirePermission(menu = REPORT, action = CpmConstants.ACTION_VIEW)
    public Result<List<CpmDto.RecognitionVO>> archive(HttpServletResponse response) {
        noStore(response);
        return Result.success(cfrService.archive());
    }

    /* ==================== 模板与规则（治理侧） ==================== */

    /** 使用侧也要读启用模板（下拉与词表提示），故读走 cpm-my；写走 cpm-template */
    @GetMapping("/templates")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_VIEW)
    public Result<List<CpmDto.TemplateVO>> templates() {
        return Result.success(templateService.list());
    }

    @PostMapping("/templates")
    @RequirePermission(menu = TEMPLATE, action = CpmConstants.ACTION_EDIT)
    public Result<CpmDto.TemplateVO> createTemplate(@RequestBody @Valid CpmDto.TemplateForm form) {
        return Result.success("模板已保存", templateService.save(null, form));
    }

    @PutMapping("/templates/{id}")
    @RequirePermission(menu = TEMPLATE, action = CpmConstants.ACTION_EDIT)
    public Result<CpmDto.TemplateVO> updateTemplate(@PathVariable("id") long id,
                                                    @RequestBody @Valid CpmDto.TemplateForm form) {
        return Result.success("模板已保存", templateService.save(id, form));
    }

    @PutMapping("/templates/{id}/status")
    @RequirePermission(menu = TEMPLATE, action = CpmConstants.ACTION_EDIT)
    public Result<CpmDto.TemplateVO> setTemplateStatus(@PathVariable("id") long id, @RequestParam boolean enabled) {
        return Result.success(templateService.setStatus(id, enabled));
    }

    @DeleteMapping("/templates/{id}")
    @RequirePermission(menu = TEMPLATE, action = CpmConstants.ACTION_EDIT)
    public Result<Void> deleteTemplate(@PathVariable("id") long id) {
        templateService.delete(id);
        return Result.success("已刪除", null);
    }

    @GetMapping("/rule")
    @RequirePermission(menu = RULE, action = CpmConstants.ACTION_VIEW)
    public Result<CpmDto.RuleVO> readRule() {
        return Result.success(ruleService.read());
    }

    @PutMapping("/rule")
    @RequirePermission(menu = RULE, action = CpmConstants.ACTION_EDIT)
    public Result<CpmDto.RuleVO> saveRule(@RequestBody @Valid CpmDto.RuleForm form) {
        return Result.success("規則已保存", ruleService.save(form));
    }

    /* ==================== 工作台摘要 ==================== */

    /** 首页卡片数据：仅登录态即可读（本人视角，与 Home 工作台「无菜单也展示」口径一致）。 */
    @GetMapping("/summary/home")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_VIEW)
    public Result<CpmDto.HomeSummaryVO> homeSummary(HttpServletResponse response) {
        noStore(response);
        return Result.success(teamService.homeSummary());
    }

    private static void noStore(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Pragma", "no-cache");
    }
}
