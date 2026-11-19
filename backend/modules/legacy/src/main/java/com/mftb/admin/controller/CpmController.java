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
import com.mftb.admin.service.cpm.CpmAccessGuard;
import com.mftb.admin.service.cpm.CpmCfrService;
import com.mftb.admin.service.cpm.CpmDailyReportService;
import com.mftb.admin.service.cpm.CpmDocxExportService;
import com.mftb.admin.service.cpm.CpmItemService;
import com.mftb.admin.service.cpm.CpmRdmSyncService;
import com.mftb.admin.service.cpm.CpmReportService;
import com.mftb.admin.service.cpm.CpmRuleService;
import com.mftb.admin.service.cpm.CpmSourceService;
import com.mftb.admin.service.cpm.CpmTeamService;
import com.mftb.admin.service.cpm.CpmTemplateService;
import com.mftb.admin.service.cpm.CpmTimeEntryService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
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
    /* ---------- 阶段三 ---------- */
    private final CpmTimeEntryService timeEntryService;
    private final CpmRdmSyncService rdmSyncService;
    private final CpmDailyReportService dailyReportService;
    private final CpmDocxExportService docxExportService;
    /** 只用于把「条目级回写开关/重新对齐」需要的登录人传给服务层；判定本身仍在服务层 */
    private final CpmAccessGuard guard;

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

    /* ==================== 投入时段（阶段三：工时统计的事实源） ==================== */

    /**
     * 某条目的全部投入时段。
     *
     * <p>门禁与条目读同一条（cpm-my:view）：时段是条目的附属事实，能看到条目就能看到它的投入；
     * 数据边界仍在服务层（归属人硬约束）。
     */
    @GetMapping("/items/{id}/time-entries")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_VIEW)
    public Result<List<CpmDto.TimeEntryVO>> listItemTime(@PathVariable("id") long id, HttpServletResponse response) {
        noStore(response);
        return Result.success(timeEntryService.listByItem(id));
    }

    @PostMapping("/items/{id}/time-entries")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_EDIT)
    public Result<CpmDto.TimeEntryVO> createTime(@PathVariable("id") long id,
                                                 @RequestBody @Valid CpmDto.TimeEntryForm form,
                                                 HttpServletResponse response) {
        noStore(response);
        return Result.success("已記錄投入時間", timeEntryService.create(id, form));
    }

    @PutMapping("/time-entries/{id}")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_EDIT)
    public Result<CpmDto.TimeEntryVO> updateTime(@PathVariable("id") long id,
                                                 @RequestBody @Valid CpmDto.TimeEntryForm form,
                                                 HttpServletResponse response) {
        noStore(response);
        return Result.success("已更新", timeEntryService.update(id, form));
    }

    @DeleteMapping("/time-entries/{id}")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_EDIT)
    public Result<Void> deleteTime(@PathVariable("id") long id) {
        timeEntryService.delete(id);
        return Result.success("已刪除", null);
    }

    /* ==================== RDM 进度回写（阶段三） ==================== */

    /**
     * 回写开关：关掉之后 CPM 记录照常保存，只是不再推 RDM。
     *
     * <p>这是回写唯一的手动闸门（除总闸外）。放在条目级而不是全局，是因为「要不要让绩效记录影响
     * 交付甘特图」是个人工作习惯问题，不是一个要么全开要么全关的系统问题。
     */
    @PutMapping("/items/{id}/rdm-sync")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_EDIT)
    public Result<Void> setRdmSync(@PathVariable("id") long id, @RequestParam boolean enabled) {
        rdmSyncService.setEnabled(id, enabled, guard.currentUser());
        return Result.success(enabled ? "已開啟回寫" : "已關閉回寫", null);
    }

    /**
     * 重新對齊：以 RDM 当前值刷新本地基准，<b>不</b>推送本地值。
     *
     * <p>实现细节决定了它是不是安全的：如果"对齐"是"这次不带 expectedProgress 再推一次"，
     * 就等于关掉 RDM 的乐观锁，别人的上报会被静默顶掉。所以这里只读对方真值、只写本地基准列。
     */
    @PostMapping("/items/{id}/rdm-sync/realign")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_EDIT)
    public Result<CpmDto.RdmSyncVO> realignRdmSync(@PathVariable("id") long id, HttpServletResponse response) {
        noStore(response);
        return Result.success("已以 RDM 當前值對齊", rdmSyncService.realign(id, guard.currentUser()));
    }

    /** 回写总闸状态：关闭时界面要说「系統未開啟回寫」而不是「同步失败」。 */
    @GetMapping("/rdm-sync/status")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_VIEW)
    public Result<Map<String, Object>> rdmSyncStatus() {
        return Result.success(Map.of("enabled", rdmSyncService.isGloballyEnabled()));
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

    /**
     * 本人相关的未结案 RDM <b>任务</b>清单（阶段三）。
     *
     * <p>与需求档分列而不是合成一档：只有任务档具备进度回写落点，需求档是只读关联。
     * 混在一个清单里，界面就无法告诉用户「这条关联以后能不能同步进度」，
     * 而用户会按能同步的预期去填。
     */
    @GetMapping("/sources/rdm-tasks")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_VIEW)
    public Result<List<CpmDto.SourceVO>> rdmTaskSources(@RequestParam(required = false) String keyword,
                                                        HttpServletResponse response) {
        noStore(response);
        return Result.success(sourceService.listRdmTasks(keyword));
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

    /* ==================== 日报与版本（阶段三） ==================== */

    /**
     * 日报投影（只读，不落 {@code biz_cpm_report} 行）。
     *
     * <p>没有发布动作也没有送达：日报只是「条目的当日切面」，
     * 给它一个提交按钮等于给每个人每天多加一次打卡。
     * 传 {@code userId} 时按可见范围裁决（上级看下属性下属的某一天）。
     */
    @GetMapping("/reports/daily")
    @RequirePermission(menu = REPORT, anyOf = {TEAM})
    public Result<CpmDto.DailyVO> daily(@RequestParam(required = false) String date,
                                         @RequestParam(required = false) String userId,
                                         HttpServletResponse response) {
        noStore(response);
        return Result.success(dailyReportService.daily(date, userId));
    }

    /** 版本列表（倒序）；权限与汇报详情同一条守卫。 */
    @GetMapping("/reports/{id}/revisions")
    @RequirePermission(menu = REPORT, anyOf = {TEAM})
    public Result<List<CpmDto.RevisionVO>> revisions(@PathVariable("id") long id, HttpServletResponse response) {
        noStore(response);
        return Result.success(reportService.revisions(id));
    }

    /**
     * 读取指定历史版本。
     *
     * <p>不登记已读回执：回执的业务含义是「他收到了这一期汇报」，
     * 把「翻出旧版看了一眼」也记成已读，送达统计就开始说谎。
     */
    @GetMapping("/reports/{id}/revisions/{revisionNo}")
    @RequirePermission(menu = REPORT, anyOf = {TEAM})
    public Result<CpmDto.ReportVO> revisionView(@PathVariable("id") long id,
                                                @PathVariable("revisionNo") int revisionNo,
                                                HttpServletResponse response) {
        noStore(response);
        return Result.success(reportService.revisionView(id, revisionNo));
    }

    /** 修订重发布：重新聚合 → 冻结为 V(n+1)；内容没有变化时不产生新版本（幂等）。 */
    @PostMapping("/reports/republish")
    @RequirePermission(menu = REPORT, action = CpmConstants.ACTION_EDIT)
    public Result<CpmDto.ReportVO> republish(@RequestBody @Valid CpmDto.RepublishForm form,
                                             HttpServletResponse response) {
        noStore(response);
        return Result.success("已發布新版本", reportService.republish(form));
    }

    /**
     * Word 导出（.docx，服务端生成）。
     *
     * <p>导出的是<b>冻结快照</b>而不是实时聚合：用户要的是「这一版给我一份文件」。
     * 若顺手重算，文件就会与屏幕上那一版不一致，而历史版本的导出件也会随时间一起变——
     * 版本机制在导出这一层失效是最难被发现的一种失效。
     *
     * <p>文件名走 RFC 5987（UTF-8 中文名 + ASCII 回退），缓存一律 no-store：
     * 汇报正文属于个人工作内容，落在共享缓存里就是泄露面。
     */
    @GetMapping("/reports/{id}/export.docx")
    @RequirePermission(menu = REPORT, anyOf = {TEAM})
    public ResponseEntity<byte[]> exportDocx(@PathVariable("id") long id,
                                             @RequestParam(required = false) Integer revisionNo,
                                             HttpServletResponse response) {
        noStore(response);
        CpmDocxExportService.ExportedFile file = docxExportService.export(id, revisionNo);
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(file.fileName(), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                // 用 .docx 的标准 MIME 而不是 octet-stream：附件模式下两者都能落盘，
                // 但 octet-stream 会让任何按 Content-Type 分派的中间层（企业网关、邮件附件预览、
                // 以及前端将来「按类型决定要不要新开窗口」的判断）把这份文件当成未知二进制。
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
                .body(file.content());
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
