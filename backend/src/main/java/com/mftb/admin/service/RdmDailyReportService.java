package com.mftb.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.constant.RdmDailyReportTemplates;
import com.mftb.admin.dto.RdmDailyReportVO.Config;
import com.mftb.admin.dto.RdmDailyReportVO.ConfigForm;
import com.mftb.admin.dto.RdmDailyReportVO.IterationNode;
import com.mftb.admin.dto.RdmDailyReportVO.PreviewForm;
import com.mftb.admin.dto.RdmDailyReportVO.PreviewResult;
import com.mftb.admin.dto.RdmDailyReportVO.ProjectNode;
import com.mftb.admin.dto.RdmDailyReportVO.ReportRecord;
import com.mftb.admin.dto.RdmDailyReportVO.RequirementNode;
import com.mftb.admin.dto.RdmDailyReportVO.Rule;
import com.mftb.admin.dto.RdmDailyReportVO.RuleForm;
import com.mftb.admin.dto.RdmDailyReportVO.Snapshot;
import com.mftb.admin.dto.RdmDailyReportVO.Summary;
import com.mftb.admin.dto.RdmDailyReportVO.Template;
import com.mftb.admin.dto.RdmDailyReportVO.TemplateForm;
import com.mftb.admin.dto.RdmDailyReportVO.TriggerResult;
import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.NotificationAppService.Credentials;
import com.mftb.admin.service.RdmDailyReportRenderer.PersonalView;
import com.mftb.admin.service.RdmDailyReportRenderer.Rendered;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * RDM 每日日报：聚合「项目 → 迭代 → 需求」进度快照、按模板渲染钉钉文案、落库并推送。
 *
 * <p><b>口径单点（不得另起）</b>：项目级指标一律取 {@link RdmProjectFactService#projectFactsForSystem}
 * （与项目总览列表/统计卡/导出同一批事实行），本类只负责「按项目组织迭代与需求明细」和汇总计数，
 * 绝不重新计算交付项完成数、剩余工作、下次交付——两套口径必然漂移。
 *
 * <p><b>快照即权威</b>：一次推送只生成一份 {@link Snapshot} 落 {@code rdm_daily_report}，
 * 群报正文与移动端日报页读的都是它，因此「通知里的数字」与「点开页面看到的数字」恒等。
 * 每天每档一行（唯一键），定时触发靠它幂等；手动触发是「补发/刷新当日该档」，覆盖同一行，
 * 不会产生同一天多份互相矛盾的口径。
 *
 * <p><b>三层开关互不弱化</b>：页面 {@code enabled}（业务启停）、yml {@code rdm.daily-report.enabled}
 * （环境级停用，由作业读）、{@code rdm.notify.dry-run}（联调不真发）。群报的 dry-run 由
 * {@code RdmNotifyDispatcher} 兜住，个人工作通知走 {@code DingTalkAppService} 不经过它，
 * 因此本类对 {@code notifyDryRun} 自行判定，避免「群报干跑、个人却真发」的半干跑状态。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmDailyReportService {

    private final RdmProjectFactService factService;
    private final RdmDailyReportRenderer renderer;
    private final RdmNotifyService notifyService;
    private final DingTalkAppService dingTalkAppService;
    private final NotificationAppService appService;
    private final SysUserMapper userMapper;
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    /** 联调干跑：与群报 outbox 共用同一开关，保证两条通道要么都真发要么都不发 */
    @Value("${rdm.notify.dry-run:false}")
    private boolean notifyDryRun;

    private static final String CONFIG_SLOT = "default";
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    /** HH:mm 严格校验：非法时间会让作业永远命不中或每分钟都命中，必须在写入时就拦下 */
    private static final Pattern TIME_PATTERN = Pattern.compile("^([01]\\d|2[0-3]):[0-5]\\d$");
    private static final Set<String> RECEIVER_SCOPES = Set.of("all_projects", "risk_only");
    private static final Set<String> CHANNELS = Set.of(
            RdmDailyReportTemplates.CHANNEL_GROUP, RdmDailyReportTemplates.CHANNEL_PERSONAL);
    private static final Set<String> TEMPLATE_TYPES = Set.of(
            RdmDailyReportTemplates.TYPE_MORNING, RdmDailyReportTemplates.TYPE_EVENING,
            RdmDailyReportTemplates.TYPE_ANY);
    /** 发送记录默认取近 60 行（每天两档 ≈ 一个月） */
    private static final int DEFAULT_RECORD_LIMIT = 60;

    /** 手动触发节流窗口：同一档位+项目 1 分钟内只允许真发一次 */
    private static final long MANUAL_THROTTLE_MS = 60_000L;
    /**
     * 最近一次手动真发时刻（key = 档位:项目）。
     * <p>向全公司群发是<b>不可撤回</b>动作，前端二次确认弹窗之外再加一道服务端节流：
     * 连点、网络重试、双开页面都不会在一分钟内把同一个日报刷两遍。
     * 用内存 Map 而非数据库：节流只需单实例生效即可（多实例各自节流仍能挡住绝大多数连点，
     * 而真正的重复推送已由快照幂等与 outbox 兼容），不值得为它多一次写库。
     */
    private final Map<String, Long> lastManualPushAt = new java.util.concurrent.ConcurrentHashMap<>();

    /* ==================== 推送配置 ==================== */

    /**
     * 读推送配置。
     * <p>缺行时补插默认行并返回默认值（新库或被人误删都能自愈），不让配置页与作业读到 null。
     */
    public Config loadConfig() {
        List<Config> rows = jdbc.query(
                "SELECT * FROM rdm_daily_report_config WHERE config_slot = ? AND deleted = 0 LIMIT 1",
                (rs, i) -> mapConfig(rs), CONFIG_SLOT);
        if (!rows.isEmpty()) {
            return rows.get(0);
        }
        log.warn("日报推送配置行缺失，补插默认配置（config_slot={}）", CONFIG_SLOT);
        jdbc.update("INSERT IGNORE INTO rdm_daily_report_config "
                        + "(config_slot, enabled, morning_time, evening_time, group_enabled, personal_enabled, "
                        + " receiver_scope, morning_template_key, evening_template_key, personal_template_key, updated_by) "
                        + "VALUES (?, 1, '09:00', '18:00', 1, 1, 'all_projects', ?, ?, ?, 'system')",
                CONFIG_SLOT,
                RdmDailyReportTemplates.defaultKeyOf(RdmDailyReportTemplates.CHANNEL_GROUP, RdmDailyReportTemplates.TYPE_MORNING),
                RdmDailyReportTemplates.defaultKeyOf(RdmDailyReportTemplates.CHANNEL_GROUP, RdmDailyReportTemplates.TYPE_EVENING),
                RdmDailyReportTemplates.defaultKeyOf(RdmDailyReportTemplates.CHANNEL_PERSONAL, RdmDailyReportTemplates.TYPE_ANY));
        return jdbc.query("SELECT * FROM rdm_daily_report_config WHERE config_slot = ? AND deleted = 0 LIMIT 1",
                (rs, i) -> mapConfig(rs), CONFIG_SLOT).stream().findFirst().orElseGet(RdmDailyReportService::fallbackConfig);
    }

    /**
     * 保存推送配置（UPSERT 单行）。
     * <p>服务端逐项校验，不信任前端：时间必须 HH:mm、接收范围必须在白名单、模板 key 必须存在且启用
     * （否则作业会渲染不出文案，或渲染出已被停用的旧模板）。
     */
    public Config saveConfig(ConfigForm form, String operator) {
        if (form == null) {
            throw new BusinessException("配置不能为空");
        }
        // 时间字段现在是「新建规则的默认值」，新配置页并不提交它们；
        // 若表单未带，回落到**库中现值**而不是硬编码 09:00/18:00——
        // 否则每次在页面上改个开关，就把管理员之前设的默认时间静默改回去了。
        Config current = loadConfig();
        String morning = normalizeTime(form.getMorningTime(),
                StringUtils.hasText(current.getMorningTime()) ? current.getMorningTime() : "09:00", "晨報推送時間");
        String evening = normalizeTime(form.getEveningTime(),
                StringUtils.hasText(current.getEveningTime()) ? current.getEveningTime() : "18:00", "晚報推送時間");
        String scope = StringUtils.hasText(form.getReceiverScope()) ? form.getReceiverScope().trim() : "all_projects";
        if (!RECEIVER_SCOPES.contains(scope)) {
            throw new BusinessException("接收范围不合法: " + scope);
        }
        String morningKey = requireTemplateKey(form.getMorningTemplateKey(),
                RdmDailyReportTemplates.CHANNEL_GROUP, RdmDailyReportTemplates.TYPE_MORNING, "晨報模板");
        String eveningKey = requireTemplateKey(form.getEveningTemplateKey(),
                RdmDailyReportTemplates.CHANNEL_GROUP, RdmDailyReportTemplates.TYPE_EVENING, "晚報模板");
        String personalKey = requireTemplateKey(form.getPersonalTemplateKey(),
                RdmDailyReportTemplates.CHANNEL_PERSONAL, RdmDailyReportTemplates.TYPE_ANY, "個人通知模板");

        jdbc.update("INSERT INTO rdm_daily_report_config "
                        + "(config_slot, enabled, morning_time, evening_time, group_enabled, personal_enabled, "
                        + " receiver_scope, morning_template_key, evening_template_key, personal_template_key, "
                        + " updated_by, deleted) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0) "
                        + "ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), morning_time = VALUES(morning_time), "
                        + " evening_time = VALUES(evening_time), group_enabled = VALUES(group_enabled), "
                        + " personal_enabled = VALUES(personal_enabled), receiver_scope = VALUES(receiver_scope), "
                        + " morning_template_key = VALUES(morning_template_key), "
                        + " evening_template_key = VALUES(evening_template_key), "
                        + " personal_template_key = VALUES(personal_template_key), "
                        + " updated_by = VALUES(updated_by), deleted = 0, updated_at = NOW()",
                CONFIG_SLOT, bool(form.getEnabled(), true), morning, evening,
                bool(form.getGroupEnabled(), true), bool(form.getPersonalEnabled(), true), scope,
                morningKey, eveningKey, personalKey, operator);
        log.info("日报推送配置已更新: 晨报={}, 晚报={}, 群报={}, 个人={}, 范围={}, operator={}",
                morning, evening, form.getGroupEnabled(), form.getPersonalEnabled(), scope, operator);
        return loadConfig();
    }

    /* ==================== 推送模板 ==================== */

    /** 模板列表（配置页「推送模板」tab）。channel 为空则返回全部。 */
    public List<Template> listTemplates(String channel) {
        String sql = "SELECT * FROM rdm_daily_report_template WHERE deleted = 0"
                + (StringUtils.hasText(channel) ? " AND channel = ?" : "")
                + " ORDER BY is_preset DESC, channel, report_type, id";
        return StringUtils.hasText(channel)
                ? jdbc.query(sql, (rs, i) -> mapTemplate(rs), channel.trim())
                : jdbc.query(sql, (rs, i) -> mapTemplate(rs));
    }

    /**
     * 保存模板：{@code templateKey} 为空表示「另存为新模板」（服务端发键），否则按 id/key 更新。
     * <p><b>预置模板允许改文案但不允许改 key/channel</b>：key 被配置行引用，改了会让配置指向空气；
     * 用户想大改应「另存为新模板」，预置行始终留着当恢复默认的底。
     */
    public Template saveTemplate(TemplateForm form, String operator) {
        if (form == null) {
            throw new BusinessException("模板不能为空");
        }
        String name = requireText(form.getName(), 100, "模板名称");
        String titleTpl = requireText(form.getTitleTpl(), 200, "标题模板");
        String contentTpl = requireText(form.getContentTpl(), 8000, "正文模板");
        String channel = StringUtils.hasText(form.getChannel()) ? form.getChannel().trim() : null;
        String reportType = StringUtils.hasText(form.getReportType()) ? form.getReportType().trim() : null;

        Template existing = StringUtils.hasText(form.getTemplateKey())
                ? findByKey(form.getTemplateKey().trim()) : null;
        if (existing != null) {
            // 更新既有模板：channel/reportType 沿用原值，不接受前端改（避免配置行引用错位）
            jdbc.update("UPDATE rdm_daily_report_template SET name = ?, title_tpl = ?, content_tpl = ?, "
                            + "enabled = ?, remark = ?, updated_by = ?, updated_at = NOW() "
                            + "WHERE template_key = ? AND deleted = 0",
                    name, titleTpl, contentTpl, bool(form.getEnabled(), true), form.getRemark(),
                    operator, existing.getTemplateKey());
            if (Boolean.TRUE.equals(form.getApplyAsDefault())) {
                applyAsSelected(existing.getTemplateKey(), operator);
            }
            return findByKey(existing.getTemplateKey());
        }

        if (channel == null || !CHANNELS.contains(channel)) {
            throw new BusinessException("投放通道不合法: " + channel);
        }
        if (reportType == null || !TEMPLATE_TYPES.contains(reportType)) {
            throw new BusinessException("适用档位不合法: " + reportType);
        }
        String key = StringUtils.hasText(form.getTemplateKey())
                ? form.getTemplateKey().trim() : "custom_" + System.currentTimeMillis();
        if (findByKey(key) != null) {
            throw new BusinessException("模板键已存在: " + key);
        }
        jdbc.update("INSERT INTO rdm_daily_report_template "
                        + "(template_key, name, channel, report_type, title_tpl, content_tpl, "
                        + " is_preset, is_default, enabled, remark, created_by, updated_by) "
                        + "VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)",
                key, name, channel, reportType, titleTpl, contentTpl,
                bool(form.getEnabled(), true), form.getRemark(), operator, operator);
        if (Boolean.TRUE.equals(form.getApplyAsDefault())) {
            applyAsSelected(key, operator);
        }
        log.info("日报模板已新建: key={}, channel={}, reportType={}, operator={}", key, channel, reportType, operator);
        return findByKey(key);
    }

    /**
     * 删除模板。<b>预置模板与正被配置选用的模板不可删</b>：删掉正在用的模板会让下一次推送渲染不出文案，
     * 删掉预置模板会让「恢复默认」失去底线。两者都只能停用。
     */
    public void deleteTemplate(Long id, String operator) {
        if (id == null) {
            throw new BusinessException("模板ID不能为空");
        }
        List<Template> rows = jdbc.query("SELECT * FROM rdm_daily_report_template WHERE id = ? AND deleted = 0",
                (rs, i) -> mapTemplate(rs), id);
        if (rows.isEmpty()) {
            throw new BusinessException("模板不存在或已删除");
        }
        Template t = rows.get(0);
        if (Boolean.TRUE.equals(t.getPreset())) {
            throw new BusinessException("预置模板不可删除，如需停用请关闭启用开关");
        }
        Config cfg = loadConfig();
        if (t.getTemplateKey().equals(cfg.getMorningTemplateKey())
                || t.getTemplateKey().equals(cfg.getEveningTemplateKey())
                || t.getTemplateKey().equals(cfg.getPersonalTemplateKey())) {
            throw new BusinessException("该模板正在被推送配置选用，请先改用其他模板");
        }
        jdbc.update("UPDATE rdm_daily_report_template SET deleted = 1, updated_by = ?, updated_at = NOW() WHERE id = ?",
                operator, id);
        log.info("日报模板已删除: key={}, operator={}", t.getTemplateKey(), operator);
    }

    /** 「設為當前使用」：把模板键写进配置行对应档位（晨/晚按 reportType，个人按 channel） */
    public void applyAsSelected(String templateKey, String operator) {
        Template t = findByKey(templateKey);
        if (t == null) {
            throw new BusinessException("模板不存在: " + templateKey);
        }
        if (!Boolean.TRUE.equals(t.getEnabled())) {
            throw new BusinessException("模板已停用，无法设为当前使用: " + templateKey);
        }
        String column = RdmDailyReportTemplates.CHANNEL_PERSONAL.equals(t.getChannel())
                ? "personal_template_key"
                : RdmDailyReportTemplates.TYPE_EVENING.equals(t.getReportType())
                ? "evening_template_key" : "morning_template_key";
        // 列名来自上面的三选一常量，不是用户输入，因此不存在拼接注入面
        jdbc.update("UPDATE rdm_daily_report_config SET " + column + " = ?, updated_by = ?, updated_at = NOW() "
                + "WHERE config_slot = ? AND deleted = 0", templateKey, operator, CONFIG_SLOT);
        log.info("日报模板已设为当前使用: {} -> {}, operator={}", column, templateKey, operator);
    }

    /* ==================== 快照构建 ==================== */

    /**
     * 构建日报快照。
     *
     * @param date          口径日（晨报看今日到期，晚报看当日完成与明日到期）
     * @param reportType    morning / evening（内容口径，决定模板与汇总侧重）
     * @param projectId     目标项目；null=全部在途项目（仅预览无项目上下文时用）
     * @param iterationCode 目标迭代；非空时快照<b>只含该迭代</b>的需求（按迭代推送时用）
     */
    public Snapshot buildSnapshot(LocalDate date, String reportType, Long projectId, String iterationCode) {
        LocalDate day = date == null ? LocalDate.now() : date;
        String type = normalizeReportType(reportType);

        RdmFactVO.FactQuery query = new RdmFactVO.FactQuery();
        query.setIncludeTodos(true);
        List<RdmFactVO.ProjectFact> facts = factService.projectFactsForSystem(query);

        // 在途口径：未关闭的项目（PROJECT_ACTIVE_STATUSES 含 preparing/in_progress/partial_delivered/all_delivered）。
        // 暂停项目仍纳入并带 ⏸ 标记：把暂停项目彻底藏起来会让管理者失去「为什么停了、停了多久」的视野。
        List<RdmFactVO.ProjectFact> active = facts.stream()
                .filter(f -> f != null && f.getProjectId() != null)
                .filter(f -> RdmConstants.PROJECT_ACTIVE_STATUSES.contains(f.getStatus()))
                .filter(f -> projectId == null || projectId.equals(f.getProjectId()))
                .toList();

        Config cfg = loadConfig();
        boolean riskOnly = "risk_only".equals(cfg.getReceiverScope()) && projectId == null;

        Map<String, String> statusLabels = loadStatusLabels();
        List<Long> projectIds = active.stream().map(RdmFactVO.ProjectFact::getProjectId).toList();
        Map<Long, List<IterationRow>> iterationsByProject = loadIterations(projectIds);
        Map<Long, List<RequirementNode>> reqsByProject = loadRequirements(projectIds, statusLabels);

        Snapshot snapshot = new Snapshot();
        snapshot.setReportDate(day.format(DATE_FMT));
        snapshot.setReportType(type);
        snapshot.setReportTypeLabel(slotLabel(type));
        snapshot.setGeneratedAt(java.time.LocalDateTime.now()
                .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));

        List<ProjectNode> nodes = new ArrayList<>();
        boolean scopedToIteration = StringUtils.hasText(iterationCode);
        for (RdmFactVO.ProjectFact f : active) {
            List<IterationRow> iters = iterationsByProject.getOrDefault(f.getProjectId(), List.of());
            List<RequirementNode> reqs = reqsByProject.getOrDefault(f.getProjectId(), List.of());
            if (scopedToIteration) {
                // 迭代视角：只保留该迭代与其需求。推到 B1 却带出 B2 的需求，是比不发更糟的误导
                iters = iters.stream().filter(x -> iterationCode.equals(x.code())).toList();
                reqs = reqs.stream().filter(x -> iterationCode.equals(x.getIterationCode())).toList();
            }
            nodes.add(toProjectNode(f, iters, reqs));
        }
        // 需关注的排前面：管理者先看到异常，而不是按编号顺序翻到最后才发现逾期
        nodes.sort(Comparator.comparing((ProjectNode n) -> !n.isAttention())
                .thenComparing(n -> n.getProjectNo() == null ? "" : n.getProjectNo()));
        if (riskOnly) {
            nodes = nodes.stream().filter(ProjectNode::isAttention).toList();
        }
        snapshot.setProjects(new ArrayList<>(nodes));
        List<IterationRow> unassignedRows = iterationsByProject.getOrDefault(UNASSIGNED_KEY, List.of());
        if (scopedToIteration) {
            // 迭代视角下，未归属迭代只保留同一个 code（否则会把别的 hotfix 也带进来）
            unassignedRows = unassignedRows.stream().filter(x -> iterationCode.equals(x.code())).toList();
        }
        snapshot.setUnassignedIterations(buildUnassignedIterations(unassignedRows,
                loadRequirementsByCodes(unassignedRows.stream().map(IterationRow::code)
                        .filter(StringUtils::hasText).distinct().toList(), statusLabels)));
        snapshot.setSummary(buildSummary(nodes, projectIds, day));
        return snapshot;
    }

    /** 项目节点：指标全部搬事实源字段，本方法不做任何再计算（剩余工作只做 total-completed 的减法） */
    static ProjectNode toProjectNode(RdmFactVO.ProjectFact f, List<IterationRow> iterations,
                                     List<RequirementNode> requirements) {
        ProjectNode n = new ProjectNode();
        n.setProjectId(f.getProjectId());
        n.setProjectNo(f.getProjectNo());
        n.setProjectName(f.getProjectName());
        n.setStatus(f.getStatus());
        n.setPmUserId(f.getPmUserId());
        n.setPmUserName(f.getPmUserName());
        n.setProductOwnerUserId(f.getProductOwnerUserId());
        n.setProductOwnerUserName(f.getProductOwnerUserName());
        n.setPlanStartDate(f.getPlanStartDate());
        n.setPlanEndDate(f.getPlanEndDate());
        n.setRiskFlag(f.getRiskFlag());
        n.setOverdueFlag(f.getOverdueFlag());
        n.setPausedFlag(f.getPausedFlag());
        n.setRequirementTotal(f.getRequirementTotal());
        n.setDeliveryItemTotal(f.getDeliveryItemTotal());
        n.setDeliveryItemCompleted(f.getDeliveryItemCompleted());
        // 剩余工作 = 总数 - 已完成；总数为 0 时展示侧必须短路成「尚未排定」，不能读成「全部完成」
        n.setRemainingCount(Math.max(0, f.getDeliveryItemTotal() - f.getDeliveryItemCompleted()));
        n.setDeliveryItemOverdue(f.getDeliveryItemOverdue());
        n.setDeliveryItemBlocked(f.getDeliveryItemBlocked());
        n.setDeliveryItemTesting(f.getDeliveryItemTesting());
        n.setDeliveryItemPendingAcceptance(f.getDeliveryItemPendingAcceptance());
        n.setTaskTotal(f.getTaskTotal());
        n.setTaskCompleted(f.getTaskCompleted());
        n.setTodoTotal(f.getTodoTotal());
        n.setNextDeliveryDate(f.getNextDeliveryDate());
        n.setAttention(f.isAttention() || f.getDeliveryItemOverdue() > 0 || f.getDeliveryItemBlocked() > 0);
        n.setDetailUrl(RdmConstants.projectDetailRoute(f.getProjectId()));

        // 需求按 iteration_code 挂到迭代下；code 为空的归「未排迭代」（如实展示，不强行塑到某个迭代里）
        Map<String, List<RequirementNode>> byCode = new LinkedHashMap<>();
        List<RequirementNode> unscheduled = new ArrayList<>();
        for (RequirementNode r : requirements) {
            String code = r.getIterationCode();
            if (!StringUtils.hasText(code)) {
                unscheduled.add(r);
            } else {
                byCode.computeIfAbsent(code, k -> new ArrayList<>()).add(r);
            }
        }
        List<IterationNode> iterationNodes = new ArrayList<>();
        for (IterationRow row : iterations) {
            IterationNode it = new IterationNode();
            it.setIterationId(row.id());
            it.setProjectId(row.projectId());
            it.setCode(row.code());
            it.setName(row.name());
            it.setIterationType(row.iterationType());
            it.setStatus(row.status());
            it.setStartDate(row.startDate());
            it.setEndDate(row.endDate());
            it.setOwnerName(row.ownerName());
            List<RequirementNode> reqs = byCode.getOrDefault(row.code(), List.of());
            it.setRequirements(new ArrayList<>(reqs));
            it.setRequirementCount(reqs.size());
            it.setRequirementDoneCount((int) reqs.stream()
                    .filter(r -> "released".equals(r.getStatus()) || "closed".equals(r.getStatus())).count());
            iterationNodes.add(it);
        }
        n.setIterations(iterationNodes);
        n.setUnscheduledRequirements(unscheduled);
        return n;
    }

    /* ==================== 内部：迭代与需求装载 ==================== */

    /** 迭代原始行（避免为只读聚合再建实体；包级可见供单测构造） */
    record IterationRow(Long id, Long projectId, String code, String name, String iterationType,
                        String status, String startDate, String endDate, String ownerName) {
    }

    /**
     * 载迭代：既取在途项目的迭代，也取 {@code project_id IS NULL} 的未归属迭代。
     * <p>未归属有两类合法来源：hotfix（跨项目平台级热修，管理员已裁决可不挂）与存量待补挂
     * （v3.15 刻意不回填）。日报如实列出，绝不塞进某个项目下充数。
     */
    private Map<Long, List<IterationRow>> loadIterations(List<Long> projectIds) {
        Map<Long, List<IterationRow>> byProject = new HashMap<>();
        List<IterationRow> rows = queryIterations(projectIds);
        for (IterationRow r : rows) {
            if (r.projectId() == null) {
                byProject.computeIfAbsent(UNASSIGNED_KEY, k -> new ArrayList<>()).add(r);
            } else {
                byProject.computeIfAbsent(r.projectId(), k -> new ArrayList<>()).add(r);
            }
        }
        return byProject;
    }

    /** 未归属迭代的分组键（Map 内部使用，不是真实项目 ID） */
    private static final Long UNASSIGNED_KEY = -1L;

    private List<IterationRow> queryIterations(List<Long> projectIds) {
        String sql = "SELECT id, project_id, code, name, iteration_type, status, start_date, end_date, owner_name "
                + "FROM rdm_iteration WHERE deleted = 0 AND (project_id IS NULL"
                + (projectIds.isEmpty() ? "" : " OR project_id IN (" + placeholders(projectIds.size()) + ")")
                + ") ORDER BY start_date, code";
        return (projectIds.isEmpty() ? jdbc.query(sql, (rs, i) -> mapIteration(rs))
                : jdbc.query(sql, (rs, i) -> mapIteration(rs), projectIds.toArray()));
    }

    private IterationRow mapIteration(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new IterationRow(rs.getLong("id"),
                (Long) rs.getObject("project_id"),
                rs.getString("code"), rs.getString("name"), rs.getString("iteration_type"),
                rs.getString("status"), formatDate(rs.getDate("start_date")), formatDate(rs.getDate("end_date")),
                rs.getString("owner_name"));
    }

    /**
     * 载需求并按项目分组（<b>一次查询</b>取齐全部所需列）。
     * <p>需求与迭代的挂接键是 {@code iteration_code}（字符串），迭代 code 全局唯一
     * （{@code uk_rdm_iteration_code}），因此按 code 分组不会串项目。
     * <p>{@code req_no} 在延迟发号口径下认领前为空，如实保留空值，不编造编号。
     */
    private Map<Long, List<RequirementNode>> loadRequirements(List<Long> projectIds, Map<String, String> statusLabels) {
        Map<Long, List<RequirementNode>> byProject = new HashMap<>();
        if (projectIds.isEmpty()) {
            return byProject;
        }
        String sql = "SELECT id, req_no, title, status, priority, assignee_pm_name, project_id, iteration_code, "
                + "plan_release_date, overdue_flag, blocked_flag, progress "
                + "FROM rdm_requirement WHERE deleted = 0 AND project_id IN ("
                + placeholders(projectIds.size()) + ") ORDER BY priority, id";
        for (Map<String, Object> row : jdbc.queryForList(sql, projectIds.toArray())) {
            Long pid = toLong(row.get("project_id"));
            if (pid == null) {
                continue;
            }
            byProject.computeIfAbsent(pid, k -> new ArrayList<>()).add(toRequirementNode(row, statusLabels));
        }
        return byProject;
    }

    /** 行映射：需求原始行 → 展示节点（状态中文名查 rdm_status_def，不硬编码） */
    private RequirementNode toRequirementNode(Map<String, Object> row, Map<String, String> statusLabels) {
        RequirementNode r = new RequirementNode();
        Long reqId = toLong(row.get("id"));
        r.setReqId(reqId);
        r.setReqNo((String) row.get("req_no"));
        r.setTitle((String) row.get("title"));
        String status = (String) row.get("status");
        r.setStatus(status);
        r.setStatusLabel(statusLabels.getOrDefault(status, status));
        r.setPriority((String) row.get("priority"));
        r.setAssigneePmName((String) row.get("assignee_pm_name"));
        r.setIterationCode((String) row.get("iteration_code"));
        r.setPlanReleaseDate(toDateString(row.get("plan_release_date")));
        r.setOverdueFlag(toInt(row.get("overdue_flag")));
        r.setBlockedFlag(toInt(row.get("blocked_flag")));
        r.setProgress(toInt(row.get("progress")));
        if (reqId != null) {
            r.setDetailUrl(RdmConstants.requirementRoute(reqId));
        }
        return r;
    }

    /** 状态编码 → 中文名（取 rdm_status_def.label，不硬编码状态文案） */
    private Map<String, String> loadStatusLabels() {
        Map<String, String> labels = new HashMap<>();
        // 同上：参数化 lambda 在 RowCallbackHandler / ResultSetExtractor 间有歧义，统一走 queryForList
        for (Map<String, Object> row : jdbc.queryForList("SELECT code, label FROM rdm_status_def WHERE deleted = 0")) {
            labels.put((String) row.get("code"), (String) row.get("label"));
        }
        return labels;
    }

    /**
     * 未归属迭代（{@code project_id IS NULL}）：带其下需求一并列出。
     * <p>需求归属看的是 {@code rdm_requirement.iteration_code}，<b>不看需求的 project_id</b>：
     * 未挂项目的迭代（如平台级 hotfix）下的需求完全可能已挂到某个项目，按迭代 code 抓才不会漏。
     *
     * @param byCode 迭代 code → 需求列表（由调用方查库后传入，使本方法成为可单测的纯函数）
     */
    static List<IterationNode> buildUnassignedIterations(List<IterationRow> unassignedRows,
                                                         Map<String, List<RequirementNode>> byCode) {
        if (unassignedRows == null || unassignedRows.isEmpty()) {
            return new ArrayList<>();
        }
        List<IterationNode> list = new ArrayList<>();
        for (IterationRow row : unassignedRows) {
            IterationNode it = new IterationNode();
            it.setIterationId(row.id());
            it.setProjectId(null);
            it.setCode(row.code());
            it.setName(row.name());
            it.setIterationType(row.iterationType());
            it.setStatus(row.status());
            it.setStartDate(row.startDate());
            it.setEndDate(row.endDate());
            it.setOwnerName(row.ownerName());
            List<RequirementNode> reqs = byCode.getOrDefault(row.code(), List.of());
            it.setRequirements(new ArrayList<>(reqs));
            it.setRequirementCount(reqs.size());
            it.setRequirementDoneCount((int) reqs.stream()
                    .filter(r -> "released".equals(r.getStatus()) || "closed".equals(r.getStatus())).count());
            list.add(it);
        }
        return list;
    }

    /** 按迭代 code 集合聚合需求（仅给未归属迭代用，codes 为空时不发 SQL） */
    private Map<String, List<RequirementNode>> loadRequirementsByCodes(List<String> codes,
                                                                       Map<String, String> statusLabels) {
        Map<String, List<RequirementNode>> byCode = new LinkedHashMap<>();
        if (codes == null || codes.isEmpty()) {
            return byCode;
        }
        String sql = "SELECT id, req_no, title, status, priority, assignee_pm_name, iteration_code, "
                + "plan_release_date, overdue_flag, blocked_flag, progress "
                + "FROM rdm_requirement WHERE deleted = 0 AND iteration_code IN ("
                + placeholders(codes.size()) + ") ORDER BY priority, id";
        for (Map<String, Object> row : jdbc.queryForList(sql, codes.toArray())) {
            String code = (String) row.get("iteration_code");
            if (!StringUtils.hasText(code)) {
                continue;
            }
            byCode.computeIfAbsent(code, k -> new ArrayList<>()).add(toRequirementNode(row, statusLabels));
        }
        return byCode;
    }

    /* ==================== 内部：汇总计数 ==================== */

    /**
     * 汇总计数。单位口径写死在字段名里（{@code *ItemCount} 是交付项、{@code *ProjectCount} 是项目），
     * 避免管理者把「3」读成 3 个项目还是 3 个交付项。
     *
     * <p><b>当日完成的口径限制（如实标注）</b>：{@code todayDoneItemCount} 取
     * {@code status='done' AND DATE(updated_at)=当日}。交付项状态重算只在手动 recalculate 与
     * 新建范围版本两个时机触发，验收通过不联动重算，因此该计数可能漏计「已验收但状态未刷新」的交付项。
     * 这是既有的状态字段陈旧问题，不是日报新引入的；当日上线数用 {@code actual_release_date}
     * （明确事实）、当日变更数用 {@code rdm_status_log}（度量真值），两者不受此影响。
     *
     * <p>晨晚报共用同一套汇总字段（全都算），由模板决定展示哪几个——因此本方法不接 reportType：
     * 口径不分档位，才不会造成「同一天的晨报与晚报对不上数」。
     */
    private Summary buildSummary(List<ProjectNode> nodes, List<Long> projectIds, LocalDate day) {
        Summary s = new Summary();
        s.setProjectCount(nodes.size());
        s.setRiskProjectCount((int) nodes.stream().filter(ProjectNode::isAttention).count());
        s.setNormalProjectCount(Math.max(0, nodes.size() - s.getRiskProjectCount()));
        for (ProjectNode n : nodes) {
            s.setRequirementTotal(s.getRequirementTotal() + n.getRequirementTotal());
            s.setDeliveryItemTotal(s.getDeliveryItemTotal() + n.getDeliveryItemTotal());
            s.setDeliveryItemCompleted(s.getDeliveryItemCompleted() + n.getDeliveryItemCompleted());
            s.setTodoTotal(s.getTodoTotal() + n.getTodoTotal());
        }
        if (!projectIds.isEmpty()) {
            String in = placeholders(projectIds.size());
            Object[] ids = projectIds.toArray();
            // rdm_delivery_item 无 deleted 列（Batch 1 建表即无逻辑删除），故不带 deleted 条件
            s.setTodayDueItemCount(countItems(" AND status <> 'done' AND plan_end_date = ?", day, in, ids));
            s.setOverdueItemCount(countItems(" AND status <> 'done' AND plan_end_date < ?", day, in, ids));
            s.setTomorrowDueItemCount(countItems(" AND status <> 'done' AND plan_end_date = ?", day.plusDays(1), in, ids));
            s.setTodayDoneItemCount(countItems(" AND status = 'done' AND DATE(updated_at) = ?", day, in, ids));
            s.setTodayReleasedCount(countOne(
                    "SELECT COUNT(*) FROM rdm_requirement WHERE deleted = 0 AND project_id IN (" + in
                            + ") AND actual_release_date = ?", appendArg(ids, day)));
            s.setTodayChangedCount(countOne(
                    "SELECT COUNT(*) FROM rdm_status_log l JOIN rdm_requirement r ON r.id = l.req_id "
                            + "WHERE l.deleted = 0 AND r.deleted = 0 AND r.project_id IN (" + in
                            + ") AND DATE(l.enter_time) = ?", appendArg(ids, day)));
        }
        return s;
    }

    private int countItems(String condition, LocalDate date, String in, Object[] ids) {
        return countOne("SELECT COUNT(*) FROM rdm_delivery_item WHERE project_id IN (" + in + ")"
                + condition, appendArg(ids, date));
    }

    private int countOne(String sql, Object... args) {
        Integer v = jdbc.queryForObject(sql, Integer.class, args);
        return v == null ? 0 : v;
    }

    private static Object[] appendArg(Object[] base, Object extra) {
        Object[] out = new Object[base.length + 1];
        System.arraycopy(base, 0, out, 0, base.length);
        out[base.length] = extra;
        return out;
    }

    private static String placeholders(int n) {
        return String.join(",", java.util.Collections.nCopies(n, "?"));
    }

    /** queryForList 返回的数值列可能是 Integer/Long/BigInteger，统一转 Long（不假定驱动类型） */
    private static Long toLong(Object value) {
        return value instanceof Number n ? n.longValue() : null;
    }

    private static Integer toInt(Object value) {
        return value instanceof Number n ? n.intValue() : null;
    }

    /** DATE 列经 queryForList 回来是 java.sql.Date，转成 yyyy-MM-dd 字符串供展示与模板使用 */
    private static String toDateString(Object value) {
        if (value instanceof java.sql.Date d) {
            return d.toLocalDate().format(DATE_FMT);
        }
        if (value instanceof LocalDate ld) {
            return ld.format(DATE_FMT);
        }
        return value == null ? null : String.valueOf(value);
    }

    /* ==================== 推送编排 ==================== */

    /**
     * 手动真发的节流闸（包级可见以便单测）。
     *
     * @return {@code null} = 放行（并已记下本次时刻）；非 null = 拒绝原因
     */
    String checkManualThrottle(String slot, Long projectId, long nowMillis) {
        String key = slot + ":" + (projectId == null ? "all" : projectId);
        Long last = lastManualPushAt.get(key);
        if (last != null && nowMillis - last < MANUAL_THROTTLE_MS) {
            return "距上次手動推送不足 1 分鐘，請稍後再試（避免重複刷屏）";
        }
        lastManualPushAt.put(key, nowMillis);
        return null;
    }

    /**
     * 一次推送的目标与口径（规则推送与手动触发共用同一套执行链路）。
     *
     * <p>把「发什么范围、用哪个模板、算哪一档内容」抽成一个值对象，是为了让定时与手动
     * <b>只有触发方式不同</b>：两边都调用 {@link #push}，不存在两套并行实现各自漂移。
     *
     * @param ruleId              规则ID（手动触发为 null）
     * @param ruleName            规则名称快照（记入快照，规则日后改名/删除历史记录仍可读）
     * @param projectId           目标项目（必填：规则与手动触发都按项目维度）
     * @param iterationCode       目标迭代（null=该项目全部迭代）
     * @param contentType         morning=今日焦点 / evening=当日复盘（决定模板与汇总侧重）
     * @param groupTemplateKey    群报模板（空=按档位默认）
     * @param personalTemplateKey 个人模板（空=按档位默认）
     */
    public record TriggerTarget(Long ruleId, String ruleName, Long projectId, String iterationCode,
                                String contentType, String groupTemplateKey, String personalTemplateKey) {
        /**
         * 范围键（幂等维度）：规则=rule:{id}；手动=manual:{projectId}:{iterationCode}。
         * <p>同一天同一档可能有多条规则/多次手动推送，必须有它才能各自成行、互不覆盖。
         */
        public String scopeKey() {
            return ruleId != null
                    ? "rule:" + ruleId
                    : "manual:" + projectId + ":" + (iterationCode == null ? "" : iterationCode);
        }
    }

    /* ==================== 推送规则维护 ==================== */

    /** 规则列表（连项目编号/名称一次取齐，迭代名由 {@link #fillIterationNames} 补） */
    public List<Rule> listRules() {
        List<Rule> rules = jdbc.query("SELECT r.*, p.project_no, p.name AS project_name "
                        + "FROM rdm_daily_report_rule r "
                        + "LEFT JOIN rdm_project p ON p.id = r.project_id "
                        + "WHERE r.deleted = 0 ORDER BY r.enabled DESC, r.push_time, r.id",
                (rs, i) -> mapRule(rs));
        fillIterationNames(rules);
        return rules;
    }

    /** 单条规则；不存在/已删除返回 null */
    public Rule findRule(Long id) {
        if (id == null) {
            return null;
        }
        List<Rule> rows = jdbc.query("SELECT r.*, p.project_no, p.name AS project_name "
                        + "FROM rdm_daily_report_rule r "
                        + "LEFT JOIN rdm_project p ON p.id = r.project_id "
                        + "WHERE r.id = ? AND r.deleted = 0",
                (rs, i) -> mapRule(rs), id);
        if (rows.isEmpty()) {
            return null;
        }
        fillIterationNames(rows);
        return rows.get(0);
    }

    /**
     * 批量补迭代名称。
     *
     * <p><b>为什么不在 SQL 里 JOIN rdm_iteration</b>：该表 {@code code} 建表时未显式指定排序规则，
     * 实际是库默认的 {@code utf8mb4_0900_ai_ci}；而本规则表与同域其他 rdm_* 表是
     * {@code utf8mb4_unicode_ci}。两者直接 {@code i.code = r.iteration_code} 会抛
     * 「Illegal mix of collations ... for operation '='」（真库实测 code 1267，mock 测不出来）。
     * 改为把 code 作为<b>参数</b>回查迭代表，比较发生在同一列上，不再涉及跨表排序规则；
     * 同时一次 IN 批查，避开逐行查迭代的 N+1。
     */
    private void fillIterationNames(List<Rule> rules) {
        if (rules == null || rules.isEmpty()) {
            return;
        }
        java.util.LinkedHashSet<String> codes = new java.util.LinkedHashSet<>();
        for (Rule r : rules) {
            if (r != null && StringUtils.hasText(r.getIterationCode())) {
                codes.add(r.getIterationCode());
            }
        }
        if (codes.isEmpty()) {
            return;
        }
        Map<String, String> names = new HashMap<>();
        // 用 queryForList 而不是 jdbc.query(sql, rs -> {...})：后者在 RowCallbackHandler（void）与
        // ResultSetExtractor<T> 两个单参重载间对"值兼容"的 lambda 存在歧义，ECJ/javac 都可能报错。
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT code, name FROM rdm_iteration WHERE deleted = 0 AND code IN ("
                        + placeholders(codes.size()) + ")",
                codes.toArray());
        for (Map<String, Object> row : rows) {
            names.put((String) row.get("code"), (String) row.get("name"));
        }
        for (Rule r : rules) {
            if (r != null && StringUtils.hasText(r.getIterationCode())) {
                r.setIterationName(names.get(r.getIterationCode()));
            }
        }
    }

    /**
     * 保存规则（新增/编辑）。
     *
     * <p>服务端逐项校验，不信任前端：项目必须存在且未删除、指定迭代必须属于该项目、
     * 时间必须 HH:mm、档位在白名单内、模板存在且启用且通道匹配。任一项不合格就直接拒绝——
     * 规则是「到点自动向群里发消息」的配置，配错不会报错，只会在某天静默发错或发不出去。
     */
    public Rule saveRule(RuleForm form, String operator) {
        if (form == null) {
            throw new BusinessException("推送规则不能为空");
        }
        String name = requireText(form.getName(), 100, "规则名称");
        if (form.getProjectId() == null) {
            throw new BusinessException("請選擇推送目標項目");
        }
        // 注意：rdm_project 没有逻辑删除列（Batch 1 建表即无），不能写 deleted = 0，否则真库报 Unknown column
        Integer projectExists = jdbc.queryForObject(
                "SELECT COUNT(*) FROM rdm_project WHERE id = ?", Integer.class, form.getProjectId());
        if (projectExists == null || projectExists == 0) {
            throw new BusinessException("推送目標項目不存在或已刪除: " + form.getProjectId());
        }
        String iteration = normalizeIteration(form.getProjectId(), form.getIterationCode());
        String pushTime = normalizeTime(form.getPushTime(), "09:00", "推送時間");
        String slot = normalizeReportType(form.getContentType());
        String groupKey = form.getGroupTemplateKey();
        if (StringUtils.hasText(groupKey)) {
            requireTemplateKey(groupKey, RdmDailyReportTemplates.CHANNEL_GROUP, slot, "群報模板");
        }
        String personalKey = form.getPersonalTemplateKey();
        if (StringUtils.hasText(personalKey)) {
            requireTemplateKey(personalKey, RdmDailyReportTemplates.CHANNEL_PERSONAL,
                    RdmDailyReportTemplates.TYPE_ANY, "個人通知模板");
        }

        if (form.getId() != null) {
            Rule existing = findRule(form.getId());
            if (existing == null) {
                throw new BusinessException("規則不存在或已刪除: " + form.getId());
            }
            jdbc.update("UPDATE rdm_daily_report_rule SET name = ?, project_id = ?, iteration_code = ?, "
                            + "push_time = ?, content_type = ?, group_template_key = ?, personal_template_key = ?, "
                            + "enabled = ?, remark = ?, updated_by = ?, updated_at = NOW() WHERE id = ? AND deleted = 0",
                    name, form.getProjectId(), iteration, pushTime, slot,
                    blankToNull(groupKey), blankToNull(personalKey), bool(form.getEnabled(), true),
                    form.getRemark(), operator, form.getId());
            log.info("日報推送規則已更新: id={}, project={}, iteration={}, time={}, slot={}, operator={}",
                    form.getId(), form.getProjectId(), iteration, pushTime, slot, operator);
            return findRule(form.getId());
        }

        // 新增：用自增主键回读本次插入的行。
        // 不能写「ORDER BY id DESC LIMIT 1」——并发下两个管理员同时新增时，
        // 后一个可能拿到前一个刚插入的规则，界面会显示成「保存后变成了别人那条」。
        org.springframework.jdbc.support.KeyHolder keyHolder =
                new org.springframework.jdbc.support.GeneratedKeyHolder();
        jdbc.update(connection -> {
            java.sql.PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO rdm_daily_report_rule "
                            + "(name, project_id, iteration_code, push_time, content_type, group_template_key, "
                            + " personal_template_key, enabled, remark, created_by, updated_by) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    java.sql.Statement.RETURN_GENERATED_KEYS);
            int i = 1;
            ps.setString(i++, name);
            ps.setLong(i++, form.getProjectId());
            ps.setString(i++, iteration);
            ps.setString(i++, pushTime);
            ps.setString(i++, slot);
            ps.setString(i++, blankToNull(groupKey));
            ps.setString(i++, blankToNull(personalKey));
            ps.setInt(i++, bool(form.getEnabled(), true));
            ps.setString(i++, form.getRemark());
            ps.setString(i++, operator);
            ps.setString(i, operator);
            return ps;
        }, keyHolder);
        Number key = keyHolder.getKey();
        Long newId = key == null ? null : key.longValue();
        log.info("日報推送規則已新建: id={}, project={}, iteration={}, time={}, slot={}, operator={}",
                newId, form.getProjectId(), iteration, pushTime, slot, operator);
        return newId == null ? null : findRule(newId);
    }

    /**
     * 删除规则（软删）。
     * <p>只影响后续推送：已发出的快照与发送记录保留，历史可追溯；不做物理删除，
     * 否则记录页上的 rule_id 会指向不存在的行，"这条日报是哪条规则发的"就断了。
     */
    public void deleteRule(Long id, String operator) {
        Rule existing = findRule(id);
        if (existing == null) {
            throw new BusinessException("規則不存在或已刪除");
        }
        jdbc.update("UPDATE rdm_daily_report_rule SET deleted = 1, updated_by = ?, updated_at = NOW() WHERE id = ?",
                operator, id);
        log.info("日報推送規則已刪除: id={}, name={}, operator={}", id, existing.getName(), operator);
    }

    /* ==================== 推送入口 ==================== */

    /**
     * 定时入口：按规则推送。
     * <p>与手动触发的差别只有三点：{@code manual=false}（当日该规则该档已推送则跳过）、
     * {@code operator=null}（非人为）、{@code dryRun=false}（是否真发仍由
     * {@code rdm.notify.dry-run} 与全局开关决定，不在这里绕开）。
     */
    public TriggerResult runRule(long ruleId) {
        Rule rule = findRule(ruleId);
        if (rule == null) {
            TriggerResult skipped = new TriggerResult();
            skipped.setReportDate(LocalDate.now().format(DATE_FMT));
            skipped.setMessage("規則不存在或已刪除，跳過");
            return skipped;
        }
        return push(new TriggerTarget(rule.getId(), rule.getName(), rule.getProjectId(), rule.getIterationCode(),
                rule.getContentType(), rule.getGroupTemplateKey(), rule.getPersonalTemplateKey()), false, null, false);
    }

    /**
     * 手动触发：选定项目（可选指定迭代）+ 内容档位，立即推送。
     * <p><b>项目必填</b>：规则与手动触发都是项目维度，避免「不选项目=一次性给全公司所有人刷一遍」的误操作。
     * <p>手动推送写 {@code report_type=manual} 行，不被定时幂等拦住（补发本就是合法语义），
     * 且 scope_key 带项目/迭代，不同项目的补发互不覆盖。
     */
    public TriggerResult triggerManual(String contentType, Long projectId, String iterationCode,
                                       String operator, boolean dryRun) {
        String slot = normalizeReportType(contentType);
        if (projectId == null) {
            throw new BusinessException("請選擇要推送的項目");
        }
        // 同上：rdm_project 无逻辑删除列
        Integer projectExists = jdbc.queryForObject(
                "SELECT COUNT(*) FROM rdm_project WHERE id = ?", Integer.class, projectId);
        if (projectExists == null || projectExists == 0) {
            throw new BusinessException("推送目標項目不存在或已刪除: " + projectId);
        }
        String iteration = normalizeIteration(projectId, iterationCode);
        return push(new TriggerTarget(null, null, projectId, iteration, slot, null, null), true, operator, dryRun);
    }

    /**
     * 推送核心：定时与手动<b>共用</b>这一条链路（开关、幂等、节流、渲染、两通道、落库）。
     *
     * @param manual true=手动触发（写 manual 档 + 节流）；false=定时（当日该范围该档已推送则跳过）
     */
    public TriggerResult push(TriggerTarget target, boolean manual, String operator, boolean dryRun) {
        // slot = 内容口径档位（决定模板与汇总侧重）；storedType = 快照行的 report_type。
        // 两者必须分开：手动补发推的仍是一份晨报/晚报内容，但不能占用定时档的幂等行。
        String slot = normalizeReportType(target.contentType());
        String storedType = manual ? RdmDailyReportTemplates.TYPE_MANUAL : slot;
        String scopeKey = target.scopeKey();
        LocalDate day = LocalDate.now();
        TriggerResult result = new TriggerResult();
        result.setReportDate(day.format(DATE_FMT));
        result.setReportType(storedType);

        Config cfg = loadConfig();
        boolean effectiveDryRun = dryRun || notifyDryRun;
        result.setDryRun(effectiveDryRun);

        if (!Boolean.TRUE.equals(cfg.getEnabled())) {
            result.setMessage("日报总开关已关闭，未推送");
            log.info("日报推送被总开关拦下: scope={}, slot={}", scopeKey, slot);
            return result;
        }
        if (manual && !effectiveDryRun) {
            // 节流只对「真发」生效：预览/干跑可以反复点，不应被拦。
            // 刻意放在总开关判定之后：被开关拦下的尝试不消耗节流窗口，否则管理员
            // 刚打开开关立即补发会被告知「距上次不足 1 分钟」，而其实一次都没发出去。
            String reject = checkManualThrottle(slot, target.projectId(), System.currentTimeMillis());
            if (reject != null) {
                throw new BusinessException(reject);
            }
        }
        if (!manual && snapshotExists(day, slot, scopeKey)) {
            // 定时幂等：多实例并发 tick、重启补跑都不重发（唯一键之外的第二道闸）
            result.setMessage("該範圍當日該檔快照已存在，定時任務跳過（如需重發請用手動觸發）");
            log.info("日报定时任务跳过（当日该范围已推送）: date={}, scope={}, slot={}", day, scopeKey, slot);
            return result;
        }

        Snapshot snapshot = buildSnapshot(day, slot, target.projectId(), target.iterationCode());
        snapshot.setScopeProjectId(target.projectId());
        snapshot.setScopeIterationCode(target.iterationCode());
        snapshot.setScopeLabel(scopeLabel(target));
        if (manual) {
            // 快照自身也要标成 manual：详情页按 URL 的 type 取数，标错就会读不到这一行
            snapshot.setReportType(RdmDailyReportTemplates.TYPE_MANUAL);
            snapshot.setReportTypeLabel("手動補發·" + slotLabel(slot));
        }
        result.setProjectCount(snapshot.getSummary().getProjectCount());
        String baseUrl = resolvePortalBaseUrl();
        String detailUrl = buildDetailUrl(baseUrl, day, storedType, null);

        // 规则可各自指定模板；未指定时回落到全局该档默认模板，再回落到代码内预置
        String groupKey = StringUtils.hasText(target.groupTemplateKey())
                ? target.groupTemplateKey()
                : (RdmDailyReportTemplates.TYPE_MORNING.equals(slot)
                ? cfg.getMorningTemplateKey() : cfg.getEveningTemplateKey());
        Template groupTpl = resolveTemplate(RdmDailyReportTemplates.CHANNEL_GROUP, slot, groupKey);
        Rendered group = renderer.renderGroup(groupTpl.getTitleTpl(), groupTpl.getContentTpl(), snapshot, detailUrl);
        result.setGroupTitle(group.title());
        result.setGroupContent(group.content());

        boolean groupDispatched = false;
        if (Boolean.TRUE.equals(cfg.getGroupEnabled()) && !effectiveDryRun) {
            // 群报走 outbox：RdmNotifyService 登记后由 RdmNotifyDispatcher 抢占发送并退避重试
            notifyService.notifyUsers(RdmConstants.EVENT_DAILY_REPORT, null, List.of(), group.title(), group.content());
            groupDispatched = true;
        }
        result.setGroupDispatched(groupDispatched);

        int[] personal = pushPersonal(snapshot, cfg, slot, storedType, baseUrl, detailUrl,
                target.personalTemplateKey(), effectiveDryRun);
        result.setPersonalSent(personal[0]);
        result.setPersonalSkipped(personal[1]);

        if (!effectiveDryRun) {
            persistSnapshot(snapshot, group, personal[0], manual, operator, scopeKey, target);
        }
        result.setMessage(buildMessage(snapshot, groupDispatched, personal[0], personal[1], effectiveDryRun));
        log.info("日报推送完成: date={}, scope={}, slot={}, storedType={}, manual={}, 项目={}, 群报={}, 个人发送={}, 个人跳过={}, dryRun={}",
                day, scopeKey, slot, storedType, manual, snapshot.getSummary().getProjectCount(), groupDispatched,
                personal[0], personal[1], effectiveDryRun);
        return result;
    }

    /** 范围说明（快照与记录页复用的可读文案） */
    private static String scopeLabel(TriggerTarget target) {
        String project = target.projectId() == null ? "—" : "項目#" + target.projectId();
        return StringUtils.hasText(target.iterationCode())
                ? project + " / 迭代 " + target.iterationCode()
                : project + " / 全部迭代";
    }

    /**
     * 个人工作通知：按收件人聚合其负责的全部项目，一人一条（避免同一人收到多条刷屏）。
     *
     * @param slot    内容口径档位（morning/evening），用于选个人模板
     * @param urlType 快照行的 report_type（手动触发为 manual），用于拼详情链接——
     *                <b>两者不可混用</b>：手动补发存的是 manual 行，链接写成 ?type=morning
     *                会指向一个不存在的快照，收件人点开就是空页
     * @return {@code [已发送人数, 跳过人数]}
     */
    private int[] pushPersonal(Snapshot snapshot, Config cfg, String slot, String urlType, String baseUrl,
                               String detailUrl, String personalTemplateKey, boolean dryRun) {
        int sent = 0;
        int skipped = 0;
        if (!Boolean.TRUE.equals(cfg.getPersonalEnabled())) {
            return new int[]{0, 0};
        }
        Credentials app = appService.resolve(NotificationAppService.RDM_DAILY_REPORT);
        if (app == null) {
            // 场景未绑定应用/未启用：这是配置状态而非故障，记 info 并跳过，群报照常
            log.info("日报个人通知跳过：场景 {} 未绑定启用的企业应用（请在通知渠道配置页绑定）",
                    NotificationAppService.RDM_DAILY_REPORT);
            return new int[]{0, countReceivers(snapshot)};
        }
        // 规则可指定个人模板；未指定回落到全局默认
        String key = StringUtils.hasText(personalTemplateKey) ? personalTemplateKey : cfg.getPersonalTemplateKey();
        Template tpl = resolveTemplate(RdmDailyReportTemplates.CHANNEL_PERSONAL, slot, key);

        // 收件人 → 其负责的项目（PM 或产品负责人），用 LinkedHashSet 去重且保持稳定顺序
        Map<Long, List<ProjectNode>> byReceiver = new LinkedHashMap<>();
        for (ProjectNode p : snapshot.getProjects()) {
            if (p.getPmUserId() != null) {
                byReceiver.computeIfAbsent(p.getPmUserId(), k -> new ArrayList<>()).add(p);
            }
            if (p.getProductOwnerUserId() != null && !p.getProductOwnerUserId().equals(p.getPmUserId())) {
                byReceiver.computeIfAbsent(p.getProductOwnerUserId(), k -> new ArrayList<>()).add(p);
            }
        }

        for (Map.Entry<Long, List<ProjectNode>> e : byReceiver.entrySet()) {
            SysUser user = userMapper.selectById(e.getKey());
            if (user == null || !StringUtils.hasText(user.getDingtalkUserId())) {
                // fail-closed：未绑定钉钉 userId 就跳过这个人，绝不用手机号群发或降级到群里 @
                skipped++;
                log.info("日报个人通知跳过（未绑定钉钉 userId）: userId={}", e.getKey());
                continue;
            }
            List<ProjectNode> mine = e.getValue();
            String myUrl = mine.size() == 1
                    ? buildDetailUrl(baseUrl, LocalDate.parse(snapshot.getReportDate(), DATE_FMT), urlType, mine.get(0).getProjectId())
                    : detailUrl;
            Rendered r = renderer.renderPersonal(tpl.getTitleTpl(), tpl.getContentTpl(), snapshot, myUrl,
                    buildPersonalView(user.getName(), mine));
            if (dryRun) {
                sent++;
                continue;
            }
            try {
                dingTalkAppService.sendWorkNotification(NotificationAppService.RDM_DAILY_REPORT, app.getId(),
                        List.of(user.getDingtalkUserId()), r.title(), r.content());
                sent++;
            } catch (RuntimeException ex) {
                // 单人失败不影响其他人：日报是周期性汇总，漏一个人下次时点自然补上
                skipped++;
                log.warn("日报个人通知发送失败: userId={}, error={}", e.getKey(), ex.getClass().getSimpleName());
            }
        }
        return new int[]{sent, skipped};
    }

    /** 个人视角数据：从该收件人负责的项目节点聚合，不另查库（与群报同源同批） */
    private PersonalView buildPersonalView(String userName, List<ProjectNode> mine) {
        int todo = 0;
        int overdue = 0;
        int todayDue = 0;
        int reqTotal = 0;
        int deliveryTotal = 0;
        int deliveryDone = 0;
        for (ProjectNode p : mine) {
            todo += p.getTodoTotal();
            overdue += p.getDeliveryItemOverdue();
            reqTotal += p.getRequirementTotal();
            deliveryTotal += p.getDeliveryItemTotal();
            deliveryDone += p.getDeliveryItemCompleted();
        }
        // 今日到期按项目级事实无法拆分到人，这里用其项目的逾期交付项近似不了，故只报项目维度可得的口径：
        // todayDue 取其项目下「下次交付日 == 今天」的项目数，避免给出一个来源不明的数字。
        LocalDate today = LocalDate.now();
        for (ProjectNode p : mine) {
            if (p.getNextDeliveryDate() != null && p.getNextDeliveryDate().equals(today.format(DATE_FMT))) {
                todayDue++;
            }
        }
        int reqDone = (int) mine.stream().flatMap(p -> p.getIterations().stream())
                .flatMap(it -> it.getRequirements().stream())
                .filter(r -> "released".equals(r.getStatus()) || "closed".equals(r.getStatus())).count();
        return new PersonalView(userName, mine, todo, overdue, todayDue, reqTotal, reqDone, deliveryTotal, deliveryDone);
    }

    private int countReceivers(Snapshot snapshot) {
        Set<Long> ids = new LinkedHashSet<>();
        for (ProjectNode p : snapshot.getProjects()) {
            if (p.getPmUserId() != null) {
                ids.add(p.getPmUserId());
            }
            if (p.getProductOwnerUserId() != null) {
                ids.add(p.getProductOwnerUserId());
            }
        }
        return ids.size();
    }

    /* ==================== 快照落库与查询 ==================== */

    /**
     * 落库快照（每天每档一行，覆盖写）。
     * <p>覆盖而非追加：手动补发时刷新的是同一份权威快照，详情页与通知因此始终读到同一份数字。
     */
    private void persistSnapshot(Snapshot snapshot, Rendered group, int personalSent, boolean manual,
                                 String operator, String scopeKey, TriggerTarget target) {
        String json;
        try {
            json = objectMapper.writeValueAsString(snapshot);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            // 序列化失败说明快照结构有问题，宁可抛出让人看见，也不要落一条内容为空的快照
            throw new BusinessException("日报快照序列化失败: " + e.getClass().getSimpleName());
        }
        jdbc.update("INSERT INTO rdm_daily_report "
                        + "(report_date, report_type, scope_key, rule_id, project_id, iteration_code, "
                        + " project_count, content_json, group_title, group_content, "
                        + " personal_count, push_count, trigger_type, trigger_by, last_push_at, deleted) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(), 0) "
                        + "ON DUPLICATE KEY UPDATE rule_id = VALUES(rule_id), project_id = VALUES(project_id), "
                        + " iteration_code = VALUES(iteration_code), project_count = VALUES(project_count), "
                        + " content_json = VALUES(content_json), group_title = VALUES(group_title), "
                        + " group_content = VALUES(group_content), personal_count = VALUES(personal_count), "
                        + " push_count = push_count + 1, trigger_type = VALUES(trigger_type), "
                        + " trigger_by = VALUES(trigger_by), last_push_at = NOW(), deleted = 0, "
                        + " updated_at = NOW()",
                snapshot.getReportDate(), snapshot.getReportType(), scopeKey, target.ruleId(),
                target.projectId(), target.iterationCode(),
                snapshot.getSummary().getProjectCount(), json, group.title(), group.content(),
                personalSent, manual ? "manual" : "schedule", operator);
    }

    private boolean snapshotExists(LocalDate day, String type, String scopeKey) {
        Integer c = jdbc.queryForObject("SELECT COUNT(*) FROM rdm_daily_report WHERE report_date = ? "
                + "AND report_type = ? AND scope_key = ? AND deleted = 0", Integer.class,
                day.format(DATE_FMT), type, scopeKey);
        return c != null && c > 0;
    }

    /**
     * 读某日某档快照（移动端日报页数据源）；不存在返回 null，由调用方决定 404 或空态。
     *
     * <p>同一日期同一档位可能有多条快照（多规则各自推送、或手动补发不同项目），
     * 所以必须按 {@code projectId} 收敛；未带项目时取最新一条（{@code ORDER BY id DESC}），
     * 否则 {@code LIMIT 1} 会稳定命中最早那条，导致通知链接打开别的项目的日报。
     */
    public Snapshot getSnapshot(LocalDate date, String reportType, Long projectId) {
        String type = normalizeReadableType(reportType);
        String sql = "SELECT content_json FROM rdm_daily_report "
                + "WHERE report_date = ? AND report_type = ? AND deleted = 0"
                + (projectId == null ? "" : " AND project_id = ?")
                + " ORDER BY id DESC LIMIT 1";
        List<String> rows = projectId == null
                ? jdbc.queryForList(sql, String.class, date.format(DATE_FMT), type)
                : jdbc.queryForList(sql, String.class, date.format(DATE_FMT), type, projectId);
        if (rows.isEmpty() || !StringUtils.hasText(rows.get(0))) {
            return null;
        }
        try {
            return objectMapper.readValue(rows.get(0), Snapshot.class);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            // 历史快照结构演进后可能读不出：返回 null 让页面显示空态，不让整页 500
            log.error("日报快照反序列化失败: date={}, type={}, error={}", date, type, e.getClass().getSimpleName());
            return null;
        }
    }

    /** 发送记录（配置页「發送記錄」tab），按日期倒序 */
    public List<ReportRecord> listRecords(Integer limit) {
        int n = limit == null || limit <= 0 || limit > 365 ? DEFAULT_RECORD_LIMIT : limit;
        return jdbc.query("SELECT d.id, d.report_date, d.report_type, d.rule_id, d.project_id, d.iteration_code, "
                        + "d.project_count, d.personal_count, d.push_count, d.trigger_type, d.trigger_by, "
                        + "d.last_push_at, d.created_at, d.updated_at, "
                        + "r.name AS rule_name, p.project_no, p.name AS project_name "
                        + "FROM rdm_daily_report d "
                        + "LEFT JOIN rdm_daily_report_rule r ON r.id = d.rule_id "
                        + "LEFT JOIN rdm_project p ON p.id = d.project_id "
                        + "WHERE d.deleted = 0 ORDER BY d.report_date DESC, d.report_type, d.id LIMIT " + n,
                (rs, i) -> {
                    ReportRecord r = new ReportRecord();
                    r.setId(rs.getLong("id"));
                    r.setReportDate(formatDate(rs.getDate("report_date")));
                    r.setReportType(rs.getString("report_type"));
                    r.setRuleId((Long) rs.getObject("rule_id"));
                    r.setRuleName(rs.getString("rule_name"));
                    r.setProjectId((Long) rs.getObject("project_id"));
                    r.setProjectNo(rs.getString("project_no"));
                    r.setProjectName(rs.getString("project_name"));
                    r.setIterationCode(rs.getString("iteration_code"));
                    r.setProjectCount((Integer) rs.getObject("project_count"));
                    r.setPersonalCount((Integer) rs.getObject("personal_count"));
                    r.setPushCount((Integer) rs.getObject("push_count"));
                    r.setTriggerType(rs.getString("trigger_type"));
                    r.setTriggerBy(rs.getString("trigger_by"));
                    r.setLastPushAt(formatDateTime(rs.getTimestamp("last_push_at")));
                    r.setCreatedAt(formatDateTime(rs.getTimestamp("created_at")));
                    r.setUpdatedAt(formatDateTime(rs.getTimestamp("updated_at")));
                    return r;
                });
    }

    /**
     * 预览：按（可能是未存盘的草稿）模板渲染真实数据，不发送、不落库。
     * <p>供配置页「实时预览」与手动触发的「預覽不發送」共用。
     */
    public PreviewResult preview(PreviewForm form) {
        String type = normalizeReportType(form == null ? null : form.getReportType());
        String channel = form != null && RdmDailyReportTemplates.CHANNEL_PERSONAL.equals(form.getChannel())
                ? RdmDailyReportTemplates.CHANNEL_PERSONAL : RdmDailyReportTemplates.CHANNEL_GROUP;
        LocalDate day = LocalDate.now();
        Snapshot snapshot = buildSnapshot(day, type, form == null ? null : form.getProjectId(),
                form == null ? null : form.getIterationCode());
        Config cfg = loadConfig();
        String baseUrl = resolvePortalBaseUrl();

        String titleTpl;
        String contentTpl;
        if (form != null && StringUtils.hasText(form.getContentTpl())) {
            // 草稿模板：用户在编辑框里改的内容直接渲染，不需要先存盘
            titleTpl = form.getTitleTpl() == null ? "" : form.getTitleTpl();
            contentTpl = form.getContentTpl();
        } else {
            Template t = resolveTemplate(channel, type, RdmDailyReportTemplates.CHANNEL_PERSONAL.equals(channel)
                    ? cfg.getPersonalTemplateKey()
                    : RdmDailyReportTemplates.TYPE_MORNING.equals(type) ? cfg.getMorningTemplateKey() : cfg.getEveningTemplateKey());
            titleTpl = t.getTitleTpl();
            contentTpl = t.getContentTpl();
        }

        PreviewResult out = new PreviewResult();
        out.setReportDate(day.format(DATE_FMT));
        out.setReportType(type);
        Rendered r;
        if (RdmDailyReportTemplates.CHANNEL_PERSONAL.equals(channel)) {
            Long requested = form == null ? null : form.getReceiverUserId();
            // lambda 捕获要求 effectively final：先算出最终值再给 lambda 用，不在 lambda 外重新赋值
            final Long receiverId = requested != null ? requested
                    : snapshot.getProjects().stream().map(ProjectNode::getPmUserId)
                    .filter(java.util.Objects::nonNull).findFirst().orElse(null);
            List<ProjectNode> mine = receiverId == null ? List.of()
                    : snapshot.getProjects().stream()
                    .filter(p -> receiverId.equals(p.getPmUserId()) || receiverId.equals(p.getProductOwnerUserId()))
                    .toList();
            SysUser user = receiverId == null ? null : userMapper.selectById(receiverId);
            r = renderer.renderPersonal(titleTpl, contentTpl, snapshot,
                    buildDetailUrl(baseUrl, day, type, null),
                    buildPersonalView(user == null ? "預覽使用者" : user.getName(), mine));
        } else {
            r = renderer.renderGroup(titleTpl, contentTpl, snapshot, buildDetailUrl(baseUrl, day, type, null));
        }
        out.setTitle(r.title());
        out.setContent(r.content());
        out.setUnknownPlaceholders(r.unknownPlaceholders());
        return out;
    }

    /* ==================== 定时命中判定 ==================== */

    /**
     * 判断某条规则此刻是否到点（作业每分钟 tick 用）。
     *
     * <p>按 HH:mm 字符串相等判定而不是比 LocalTime：配置存的就是分钟粒度，秒与纳秒在格式化时归零，
     * 否则 09:00:30 的 tick 会错过 09:00 的配置——整条规则当天静默不发，日志里也没有任何错误。
     */
    static boolean isPushTime(String pushTime, LocalTime now) {
        return StringUtils.hasText(pushTime) && now != null
                && pushTime.trim().equals(now.format(DateTimeFormatter.ofPattern("HH:mm")));
    }

    /**
     * 当前到点的启用规则（作业用）。
     * <p>全部开关（全局总开关）关闭时直接返回空：作业层不必自己判断开关，避免两处口径。
     */
    public List<Rule> rulesDueAt(LocalTime now) {
        Config cfg = loadConfig();
        if (!Boolean.TRUE.equals(cfg.getEnabled()) || now == null) {
            return List.of();
        }
        String hhmm = now.format(DateTimeFormatter.ofPattern("HH:mm"));
        /*
         * 不在 SQL 里 JOIN rdm_iteration：该表 code 是库默认 utf8mb4_0900_ai_ci，
         * 规则表是 utf8mb4_unicode_ci，直接比较会抛 1267（真库实测，mock 测不出来）。
         * 迭代名统一由 fillIterationNames 参数化回查。
         */
        List<Rule> due = jdbc.query("SELECT r.*, p.project_no, p.name AS project_name "
                        + "FROM rdm_daily_report_rule r "
                        + "LEFT JOIN rdm_project p ON p.id = r.project_id "
                        + "WHERE r.deleted = 0 AND r.enabled = 1 AND r.push_time = ? ORDER BY r.id",
                (rs, i) -> mapRule(rs), hhmm);
        fillIterationNames(due);
        return due;
    }

    /* ==================== 内部工具 ==================== */

    /**
     * 解析门户基址（拼详情链接用）。
     * <p>优先取日报场景绑定应用的 {@code base_url}（与资产领用签署链接同模式）；场景未绑定时
     * 回退到任一已启用的企业应用；都没有则返回空串——此时链接只含 {@code /#/rdm-daily?...} 路径，
     * 钉钉里点不开，但不影响消息正文本身的正确性，且日志会提示配置缺失。
     */
    private String resolvePortalBaseUrl() {
        Credentials app = appService.resolve(NotificationAppService.RDM_DAILY_REPORT);
        if (app != null && StringUtils.hasText(app.getBaseUrl())) {
            return trimBase(app.getBaseUrl());
        }
        List<String> urls = jdbc.queryForList("SELECT base_url FROM sys_notification_app "
                + "WHERE enabled = 1 AND base_url IS NOT NULL AND base_url <> '' ORDER BY updated_at DESC LIMIT 1",
                String.class);
        if (!urls.isEmpty() && StringUtils.hasText(urls.get(0))) {
            log.info("日报场景未绑定应用，详情链接回退使用其他已启用企业应用的 base_url");
            return trimBase(urls.get(0));
        }
        log.warn("未找到可用的门户基址，日报详情链接将只含路径（请在通知渠道配置页为企业应用填写站点地址）");
        return "";
    }

    /** 去掉尾部斜杠与 #：前端是 HashRouter，query 必须落在 #/ 之后才能被路由识别 */
    private static String trimBase(String base) {
        String b = base.trim();
        while (b.endsWith("/") || b.endsWith("#")) {
            b = b.substring(0, b.length() - 1);
        }
        return b;
    }

    /**
     * 拼移动端日报页链接。
     * <p>路径 {@code /rdm-daily} 由前端路由注册；这里刻意不复用 {@code RdmConstants.ROUTE_*}，
     * 因为那些常量是给系统内跳转用的相对路径，而钉钉里必须是完整外部 URL（含 {@code /#/}）。
     */
    private String buildDetailUrl(String baseUrl, LocalDate day, String type, Long projectId) {
        StringBuilder sb = new StringBuilder(baseUrl == null ? "" : baseUrl);
        sb.append("/#/rdm-daily?date=").append(day.format(DATE_FMT)).append("&type=").append(type);
        if (projectId != null) {
            sb.append("&projectId=").append(projectId);
        }
        return sb.toString();
    }

    /**
     * 取模板：配置选用的 key → 该档位默认模板 → 代码内预置兜底。
     * <p>三级兜底是为了「配置被改坏也不能让日报发不出去」；走到第三级会记 warn，
     * 因为那意味着库里的模板行被删或被停用，需要人去修。
     */
    private Template resolveTemplate(String channel, String reportType, String configuredKey) {
        if (StringUtils.hasText(configuredKey)) {
            Template t = findByKey(configuredKey.trim());
            if (t != null && Boolean.TRUE.equals(t.getEnabled())) {
                return t;
            }
            log.warn("日报配置选用的模板不可用（不存在或已停用），回退默认模板: key={}", configuredKey);
        }
        List<Template> defaults = jdbc.query(
                "SELECT * FROM rdm_daily_report_template WHERE deleted = 0 AND enabled = 1 AND channel = ? "
                        + "AND (report_type = ? OR report_type = 'any') AND is_default = 1 LIMIT 1",
                (rs, i) -> mapTemplate(rs), channel, reportType);
        if (!defaults.isEmpty()) {
            return defaults.get(0);
        }
        // 最后兜底：代码内预置定义（库被清空也能发出内容正确的日报）
        String presetKey = RdmDailyReportTemplates.defaultKeyOf(channel, reportType);
        RdmDailyReportTemplates.Preset preset = RdmDailyReportTemplates.findPreset(presetKey);
        if (preset == null) {
            throw new BusinessException("找不到可用的日报模板: channel=" + channel + ", reportType=" + reportType);
        }
        log.warn("日报模板库中无默认模板，使用代码内预置兜底: key={}", presetKey);
        Template t = new Template();
        t.setTemplateKey(preset.key());
        t.setName(preset.name());
        t.setChannel(preset.channel());
        t.setReportType(preset.reportType());
        t.setTitleTpl(preset.titleTpl());
        t.setContentTpl(preset.contentTpl());
        t.setPreset(true);
        t.setDefaultTemplate(true);
        t.setEnabled(true);
        return t;
    }

    private Template findByKey(String key) {
        List<Template> rows = jdbc.query("SELECT * FROM rdm_daily_report_template "
                + "WHERE template_key = ? AND deleted = 0 LIMIT 1", (rs, i) -> mapTemplate(rs), key);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private String buildMessage(Snapshot snapshot, boolean groupDispatched, int personalSent,
                                int personalSkipped, boolean dryRun) {
        if (dryRun) {
            return "预览模式：已渲染未发送（在途项目 " + snapshot.getSummary().getProjectCount() + " 个）";
        }
        StringBuilder sb = new StringBuilder();
        sb.append(groupDispatched ? "群报已入队投递" : "群报未发送（开关关闭）");
        sb.append("；个人通知发送 ").append(personalSent).append(" 人");
        if (personalSkipped > 0) {
            sb.append("，跳过 ").append(personalSkipped).append(" 人（未绑定钉钉 userId 或发送失败）");
        }
        return sb.toString();
    }

    private Config mapConfig(java.sql.ResultSet rs) throws java.sql.SQLException {
        Config c = new Config();
        c.setEnabled(rs.getBoolean("enabled"));
        c.setMorningTime(rs.getString("morning_time"));
        c.setEveningTime(rs.getString("evening_time"));
        c.setGroupEnabled(rs.getBoolean("group_enabled"));
        c.setPersonalEnabled(rs.getBoolean("personal_enabled"));
        c.setReceiverScope(rs.getString("receiver_scope"));
        c.setMorningTemplateKey(rs.getString("morning_template_key"));
        c.setEveningTemplateKey(rs.getString("evening_template_key"));
        c.setPersonalTemplateKey(rs.getString("personal_template_key"));
        c.setUpdatedBy(rs.getString("updated_by"));
        c.setUpdatedAt(formatDateTime(rs.getTimestamp("updated_at")));
        return c;
    }

    /** 规则行映射（LEFT JOIN 出项目编号/名称与迭代名称；规则已删项目时为 null） */
    private Rule mapRule(java.sql.ResultSet rs) throws java.sql.SQLException {
        Rule r = new Rule();
        r.setId(rs.getLong("id"));
        r.setName(rs.getString("name"));
        r.setProjectId(rs.getLong("project_id"));
        r.setProjectNo(rs.getString("project_no"));
        r.setProjectName(rs.getString("project_name"));
        r.setIterationCode(rs.getString("iteration_code"));
        // 迭代名不在本查询里 JOIN（跨表排序规则不一致，见 fillIterationNames），由调用方回填
        r.setIterationName(null);
        r.setPushTime(rs.getString("push_time"));
        r.setContentType(rs.getString("content_type"));
        r.setGroupTemplateKey(rs.getString("group_template_key"));
        r.setPersonalTemplateKey(rs.getString("personal_template_key"));
        r.setEnabled(rs.getBoolean("enabled"));
        r.setRemark(rs.getString("remark"));
        r.setUpdatedBy(rs.getString("updated_by"));
        r.setUpdatedAt(formatDateTime(rs.getTimestamp("updated_at")));
        return r;
    }

    /**
     * 迭代归属校验：空值视为「项目全部迭代」；非空时必须真实存在且属于该项目。
     * <p>为什么不信任前端传的 iterationCode：规则存的是字符串，一旦存进一个不属于该项目的迭代，
     * 每天到点都会发出一份「项目头上挂着别人家迭代」的错数据，而且不会报错。
     */
    private String normalizeIteration(Long projectId, String iterationCode) {
        if (!StringUtils.hasText(iterationCode)) {
            return null;
        }
        String code = iterationCode.trim();
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM rdm_iteration "
                + "WHERE code = ? AND project_id = ? AND deleted = 0", Integer.class, code, projectId);
        if (count == null || count == 0) {
            throw new BusinessException("所選迭代不屬於該項目或不存在: " + code);
        }
        return code;
    }

    private static String blankToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private Template mapTemplate(java.sql.ResultSet rs) throws java.sql.SQLException {
        Template t = new Template();
        t.setId(rs.getLong("id"));
        t.setTemplateKey(rs.getString("template_key"));
        t.setName(rs.getString("name"));
        t.setChannel(rs.getString("channel"));
        t.setReportType(rs.getString("report_type"));
        t.setTitleTpl(rs.getString("title_tpl"));
        t.setContentTpl(rs.getString("content_tpl"));
        t.setPreset(rs.getBoolean("is_preset"));
        t.setDefaultTemplate(rs.getBoolean("is_default"));
        t.setEnabled(rs.getBoolean("enabled"));
        t.setRemark(rs.getString("remark"));
        t.setUpdatedBy(rs.getString("updated_by"));
        t.setUpdatedAt(formatDateTime(rs.getTimestamp("updated_at")));
        return t;
    }

    /** 库不可用时的配置兜底（只在补插也失败时用，避免 NPE 打断作业） */
    private static Config fallbackConfig() {
        Config c = new Config();
        c.setEnabled(true);
        c.setMorningTime("09:00");
        c.setEveningTime("18:00");
        c.setGroupEnabled(true);
        c.setPersonalEnabled(true);
        c.setReceiverScope("all_projects");
        c.setMorningTemplateKey(RdmDailyReportTemplates.KEY_GROUP_MORNING_OVERVIEW);
        c.setEveningTemplateKey(RdmDailyReportTemplates.KEY_GROUP_EVENING_REVIEW);
        c.setPersonalTemplateKey(RdmDailyReportTemplates.KEY_PERSONAL_TODO);
        return c;
    }

    static String normalizeReportType(String reportType) {
        String t = reportType == null ? "" : reportType.trim();
        if (RdmDailyReportTemplates.TYPE_EVENING.equals(t)) {
            return RdmDailyReportTemplates.TYPE_EVENING;
        }
        if (!RdmDailyReportTemplates.TYPE_MORNING.equals(t)) {
            throw new BusinessException("日报档位不合法（只接受 morning / evening）: " + reportType);
        }
        return RdmDailyReportTemplates.TYPE_MORNING;
    }

    /**
     * 读取侧的档位归一：比写入侧多接受 {@code manual}。
     * <p>手动触发存的快照行 report_type='manual'，详情页要能按通知链接里的
     * {@code ?type=manual} 读到它；但<b>触发与模板选择仍只接受 morning/evening</b>
     * （手动推的总是一份晨报或晚报内容，manual 只是存储档位）。
     */
    static String normalizeReadableType(String reportType) {
        String t = reportType == null ? "" : reportType.trim();
        if (RdmDailyReportTemplates.TYPE_MANUAL.equals(t)) {
            return RdmDailyReportTemplates.TYPE_MANUAL;
        }
        return normalizeReportType(t);
    }

    /** 档位中文标签（快照与模板共用一套文案，不在两处各写一份） */
    static String slotLabel(String slot) {
        return RdmDailyReportTemplates.TYPE_EVENING.equals(slot) ? "晚報" : "晨報";
    }

    static String normalizeTime(String value, String fallback, String label) {
        if (!StringUtils.hasText(value)) {
            return fallback;
        }
        String v = value.trim();
        if (!TIME_PATTERN.matcher(v).matches()) {
            throw new BusinessException(label + "格式必须为 HH:mm（24 小时制）: " + value);
        }
        return v;
    }

    /** 校验模板 key 可用（存在、启用、通道与档位匹配）；空值回落到该档默认模板 key */
    private String requireTemplateKey(String key, String channel, String reportType, String label) {
        if (!StringUtils.hasText(key)) {
            return RdmDailyReportTemplates.defaultKeyOf(channel, reportType);
        }
        Template t = findByKey(key.trim());
        if (t == null) {
            throw new BusinessException(label + "不存在: " + key);
        }
        if (!Boolean.TRUE.equals(t.getEnabled())) {
            throw new BusinessException(label + "已停用，请先启用或改用其他模板: " + key);
        }
        if (!channel.equals(t.getChannel())) {
            throw new BusinessException(label + "通道不匹配（需要 " + channel + "，实际 " + t.getChannel() + "）: " + key);
        }
        return t.getTemplateKey();
    }

    private static String requireText(String value, int max, String label) {
        if (!StringUtils.hasText(value)) {
            throw new BusinessException(label + "不能为空");
        }
        String v = value.trim();
        if (v.length() > max) {
            throw new BusinessException(label + "超长（上限 " + max + " 字）");
        }
        return v;
    }

    private static int bool(Boolean value, boolean fallback) {
        return (value == null ? fallback : value) ? 1 : 0;
    }

    private static String formatDate(java.sql.Date date) {
        return date == null ? null : date.toLocalDate().format(DATE_FMT);
    }

    private static String formatDateTime(java.sql.Timestamp ts) {
        return ts == null ? null : ts.toLocalDateTime().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }
}

