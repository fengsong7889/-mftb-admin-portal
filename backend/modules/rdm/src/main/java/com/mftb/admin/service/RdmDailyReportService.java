package com.mftb.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.constant.RdmDailyReportTemplates;
import com.mftb.admin.dto.RdmDailyReportVO.Config;
import com.mftb.admin.dto.RdmDailyReportVO.ConfigForm;
import com.mftb.admin.dto.RdmDailyReportVO.BuiltinLayout;
import com.mftb.admin.dto.RdmDailyReportVO.IterationNode;
import com.mftb.admin.dto.RdmDailyReportVO.MessageFieldOptions;
import com.mftb.admin.dto.RdmDailyReportVO.PreviewForm;
import com.mftb.admin.dto.RdmDailyReportVO.PreviewResult;
import com.mftb.admin.dto.RdmDailyReportVO.ProjectNode;
import com.mftb.admin.dto.RdmDailyReportVO.PublicView;
import com.mftb.admin.dto.RdmDailyReportVO.ReceiverPreview;
import com.mftb.admin.dto.RdmDailyReportVO.ReceiverPreviewItem;
import com.mftb.admin.dto.RdmDailyReportVO.ReportRecord;
import com.mftb.admin.dto.RdmDailyReportVO.RequirementNode;
import com.mftb.admin.dto.RdmDailyReportVO.Rule;
import com.mftb.admin.dto.RdmDailyReportVO.RuleForm;
import com.mftb.admin.dto.RdmDailyReportVO.Snapshot;
import com.mftb.admin.dto.RdmDailyReportVO.Summary;
import com.mftb.admin.dto.RdmDailyReportVO.TaskNode;
import com.mftb.admin.dto.RdmDailyReportVO.Template;
import com.mftb.admin.dto.RdmDailyReportVO.TemplateForm;
import com.mftb.admin.dto.RdmDailyReportVO.TriggerResult;
import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.NotificationAppService.Credentials;
import com.mftb.admin.service.RdmDailyReportRenderer.PersonalView;
import com.mftb.admin.service.RdmDailyReportRenderer.Rendered;
import com.mftb.admin.util.RdmDailyReportViewTokenUtil;
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
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
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

    /**
     * 看板开放链接的 HMAC 密钥：由 JWT 密钥按域隔离派生。
     * <p>不直接复用 JWT 密钥：拿到看板链接签名能力不等于能伪造登录令牌，反之亦然。
     */
    @Value("${jwt.secret}")
    private String jwtSecret;

    private static final String CONFIG_SLOT = "default";
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    /** HH:mm 严格校验：非法时间会让作业永远命不中或每分钟都命中，必须在写入时就拦下 */
    private static final Pattern TIME_PATTERN = Pattern.compile("^([01]\\d|2[0-3]):[0-5]\\d$");
    /**
     * 个人日报收件角色白名单。
     * <p>全部取自 {@code rdm_project} 的六类负责人列与 {@code rdm_project_member}（成员）。
     * <p><b>为何不纳入迭代/任务负责人</b>：{@code rdm_iteration} / {@code rdm_task} 只存
     * {@code owner_name} 姓名快照、没有 user_id，按姓名反查 {@code sys_user} 会因重名发错人。
     */
    private static final List<String> RECEIVER_ROLES = List.of(
            "pm", "product_owner", "tech_lead", "qa_lead", "ui_designer", "ops_lead", "project_member");
    /** 默认收件角色 = 收件人可配之前的实际发送对象，保证升级当天发送行为不变 */
    private static final List<String> DEFAULT_RECEIVER_ROLES = List.of("pm", "product_owner");
    /** 追加/排除名单上限：到这个量级说明配置方式错了（应当用角色），而不是继续堆人 */
    private static final int MAX_RECEIVER_USER_IDS = 100;
    private static final Set<String> CHANNELS = Set.of(
            RdmDailyReportTemplates.CHANNEL_GROUP, RdmDailyReportTemplates.CHANNEL_PERSONAL);
    private static final Set<String> TEMPLATE_TYPES = Set.of(
            RdmDailyReportTemplates.TYPE_MORNING, RdmDailyReportTemplates.TYPE_EVENING,
            RdmDailyReportTemplates.TYPE_ANY);
    /** 发送记录默认取近 60 行（每天两档 ≈ 一个月） */
    private static final int DEFAULT_RECORD_LIMIT = 60;

    /** 看板链接默认有效期（天）与允许区间：太长等于把内部进度长期挂在公网，太短读者来不及回看 */
    private static final int DEFAULT_BOARD_LINK_VALID_DAYS = 30;
    private static final int MIN_BOARD_LINK_VALID_DAYS = 1;
    private static final int MAX_BOARD_LINK_VALID_DAYS = 90;
    /** 看板链接路径（前端公开路由，不套后台布局、不要求登录） */
    private static final String PUBLIC_VIEW_PATH = "/#/rdm-daily-view";

    /** 钉钉消息模式：固定框架（默认）/ 自定义模板文本 */
    private static final String MESSAGE_MODE_FIXED = "fixed";
    private static final String MESSAGE_MODE_TEMPLATE = "template";
    private static final Set<String> MESSAGE_MODES = Set.of(MESSAGE_MODE_FIXED, MESSAGE_MODE_TEMPLATE);

    /** 无异常日降噪：照常发完整摘要（改造前行为，回滚用） */
    private static final String QUIET_FULL = "full";
    /** 无异常日降噪：只发一句结论（默认） */
    private static final String QUIET_BRIEF = "brief";
    /** 无异常日降噪：当日不发（仍落快照，打开日报页可看） */
    private static final String QUIET_SKIP = "skip";
    private static final Set<String> QUIET_POLICIES = Set.of(QUIET_FULL, QUIET_BRIEF, QUIET_SKIP);
    private static final String DEFAULT_QUIET_POLICY = QUIET_BRIEF;

    /**
     * 卡片按钮文案（钉钉限制 20 字符内）。
     * <p>群报与个人用不同文案：个人按钮明确写「項目進度詳情」，避免读者以为点进了全公司报表。
     */
    private static final String CARD_BTN_GROUP = "查看完整日報";
    private static final String CARD_BTN_PERSONAL = "查看項目進度詳情";

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
                        + " morning_template_key, evening_template_key, personal_template_key, updated_by) "
                        + "VALUES (?, 1, '09:00', '18:00', 1, 1, ?, ?, ?, 'system')",
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
        // 收件人：三字段为 null 时回落库中现值——旧客户端只改开关不应把已配名单重置成默认；
        // 传空数组是「主动清空」，必须与 null 区分开（roles 清空后只要还有追加人仍可发）
        List<String> roles = form.getReceiverRoles() == null
                ? safeStringList(current.getReceiverRoles()) : normalizeReceiverRoles(form.getReceiverRoles());
        List<Long> extra = form.getExtraReceiverUserIds() == null
                ? safeLongList(current.getExtraReceiverUserIds())
                : normalizeReceiverUserIds(form.getExtraReceiverUserIds(), "追加收件人");
        List<Long> exclude = form.getExcludeReceiverUserIds() == null
                ? safeLongList(current.getExcludeReceiverUserIds())
                : normalizeReceiverUserIds(form.getExcludeReceiverUserIds(), "排除收件人");
        // 两道拒绝都是为了让「开了个人渠道却一个人也发不出去」在保存时就暴露，而不是等到推送时静默空转
        if (roles.isEmpty() && extra.isEmpty()) {
            throw new BusinessException("個人日報至少需要選擇一個收件角色或指定追加收件人");
        }
        if (roles.isEmpty() && extra.stream().allMatch(exclude::contains)) {
            throw new BusinessException("排除收件人已覆蓋全部追加收件人，個人日報將無人可發");
        }
        String morningKey;
        String eveningKey;
        String personalKey;
        String messageMode = normalizeMessageMode(form.getMessageMode(), current.getMessageMode());
        if (MESSAGE_MODE_TEMPLATE.equals(messageMode)) {
            // 自定义模板模式：模板是渲染真值源，必须存在且启用
            morningKey = requireTemplateKey(form.getMorningTemplateKey(),
                    RdmDailyReportTemplates.CHANNEL_GROUP, RdmDailyReportTemplates.TYPE_MORNING, "晨報模板");
            eveningKey = requireTemplateKey(form.getEveningTemplateKey(),
                    RdmDailyReportTemplates.CHANNEL_GROUP, RdmDailyReportTemplates.TYPE_EVENING, "晚報模板");
            personalKey = requireTemplateKey(form.getPersonalTemplateKey(),
                    RdmDailyReportTemplates.CHANNEL_PERSONAL, RdmDailyReportTemplates.TYPE_ANY, "個人通知模板");
        } else {
            // 固定框架模式：模板不参与渲染，不再校验存在性——否则用户删掉旧自定义模板后连开关都存不了
            morningKey = blankToNull(form.getMorningTemplateKey());
            eveningKey = blankToNull(form.getEveningTemplateKey());
            personalKey = blankToNull(form.getPersonalTemplateKey());
        }
        int validDays = normalizeBoardLinkValidDays(form.getBoardLinkValidDays(), current.getBoardLinkValidDays());
        // 展示参数不传时沿用库中现值：老页面/旧客户端只改开关，不应该把看板展示设置静默重置
        boolean showRequirements = form.getBoardShowRequirements() == null
                ? Boolean.TRUE.equals(current.getBoardShowRequirements()) : form.getBoardShowRequirements();
        boolean showOwners = form.getBoardShowOwners() == null
                ? Boolean.TRUE.equals(current.getBoardShowOwners()) : form.getBoardShowOwners();
        boolean showUnassigned = form.getBoardShowUnassigned() == null
                ? Boolean.TRUE.equals(current.getBoardShowUnassigned()) : form.getBoardShowUnassigned();
        // 字段开关不传时沿用现值（与展示参数同理）；传了就以表单为准整体覆盖，避免逐个字段 merge 的歧义
        MessageFieldOptions fields = form.getMessageFields() == null
                ? current.getMessageFields() : form.getMessageFields();
        String fieldsJson = writeMessageFields(fields);
        // 降噪策略不传时沿用库中现值（与展示参数同理）；传了必须命中白名单，不接受静默回退
        String quietPolicy = normalizeQuietPolicy(form.getQuietPolicy(), current.getQuietPolicy());

        jdbc.update("INSERT INTO rdm_daily_report_config "
                        + "(config_slot, enabled, morning_time, evening_time, group_enabled, personal_enabled, "
                        + " receiver_roles_json, extra_receiver_user_ids_json, exclude_receiver_user_ids_json, "
                        + " morning_template_key, evening_template_key, personal_template_key, "
                        + " board_link_valid_days, board_show_requirements, board_show_owners, board_show_unassigned, "
                        + " message_mode, message_field_options, quiet_policy, updated_by, deleted) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0) "
                        + "ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), morning_time = VALUES(morning_time), "
                        + " evening_time = VALUES(evening_time), group_enabled = VALUES(group_enabled), "
                        + " personal_enabled = VALUES(personal_enabled), "
                        + " receiver_roles_json = VALUES(receiver_roles_json), "
                        + " extra_receiver_user_ids_json = VALUES(extra_receiver_user_ids_json), "
                        + " exclude_receiver_user_ids_json = VALUES(exclude_receiver_user_ids_json), "
                        + " morning_template_key = VALUES(morning_template_key), "
                        + " evening_template_key = VALUES(evening_template_key), "
                        + " personal_template_key = VALUES(personal_template_key), "
                        + " board_link_valid_days = VALUES(board_link_valid_days), "
                        + " board_show_requirements = VALUES(board_show_requirements), "
                        + " board_show_owners = VALUES(board_show_owners), "
                        + " board_show_unassigned = VALUES(board_show_unassigned), "
                        + " message_mode = VALUES(message_mode), "
                        + " message_field_options = VALUES(message_field_options), "
                        + " quiet_policy = VALUES(quiet_policy), "
                        + " updated_by = VALUES(updated_by), deleted = 0, updated_at = NOW()",
                CONFIG_SLOT, bool(form.getEnabled(), true), morning, evening,
                bool(form.getGroupEnabled(), true), bool(form.getPersonalEnabled(), true),
                writeStringList(roles), writeLongList(extra), writeLongList(exclude),
                morningKey, eveningKey, personalKey, validDays, showRequirements, showOwners, showUnassigned,
                messageMode, fieldsJson, quietPolicy, operator);
        log.info("日报推送配置已更新: 晨报={}, 晚报={}, 群报={}, 个人={}, 收件角色={}, 追加={}人, 排除={}人, 看板链接={}天, 消息模式={}, 降噪={}, operator={}",
                morning, evening, form.getGroupEnabled(), form.getPersonalEnabled(), roles,
                extra.size(), exclude.size(), validDays, messageMode, quietPolicy, operator);
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
     * 员工候选：按关键字模糊搜索，或按 ID 批量回显。
     *
     * <p>只返回 value（sys_user.id 的字符串）与 label（姓名(工号)）：部门/职位/职级属于个人敏感信息，
     * 不应为了一个查询条件批量暴露。权限由控制器锚定到日报菜单，不依赖 employee-management。
     *
     * <p><b>为何要支持 ids</b>：多选收件人编辑态回显时，若控件拿不到已选项的 label，
     * antd 会直接把 userId 渲染成裸数字，用户无法确认自己选的是谁。
     */
    public List<Map<String, Object>> employeeOptions(String keyword, String ids) {
        if (StringUtils.hasText(ids)) {
            List<Long> idList = parseIdCsv(ids);
            if (idList.isEmpty()) {
                return List.of();
            }
            // 回显不过滤 status：已选的人后来停用了也要显示出来，否则管理员看不到、也就无法移除它
            return userMapper.selectBatchIds(idList).stream().map(this::toEmployeeOption).toList();
        }
        String kw = StringUtils.hasText(keyword) ? keyword.trim() : null;
        LambdaQueryWrapper<SysUser> qw = new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getStatus, 1)
                .and(kw != null, w -> w.like(SysUser::getName, kw).or().like(SysUser::getEmpId, kw))
                .orderByAsc(SysUser::getEmpId)
                .last("LIMIT 50");
        return userMapper.selectList(qw).stream().map(this::toEmployeeOption).toList();
    }

    private Map<String, Object> toEmployeeOption(SysUser u) {
        Map<String, Object> option = new LinkedHashMap<>();
        option.put("value", String.valueOf(u.getId()));
        option.put("label", (u.getName() == null ? "" : u.getName())
                + "(" + (u.getEmpId() == null ? "" : u.getEmpId()) + ")");
        return option;
    }

    /** 逗号分隔 ID 解析：非法片段丢弃，不因一个坏参数让整次回显失败 */
    private static List<Long> parseIdCsv(String ids) {
        List<Long> out = new ArrayList<>();
        for (String part : ids.split(",")) {
            String value = part.trim();
            if (value.isEmpty()) {
                continue;
            }
            try {
                long id = Long.parseLong(value);
                if (id > 0 && !out.contains(id)) {
                    out.add(id);
                }
            } catch (NumberFormatException ignored) {
                // 忽略非法片段
            }
        }
        return out;
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
     * @param projectId     目标项目；null=全部在途项目（仅预览无项目上下文时用）。
     *                      迭代非空且未带项目时，先按迭代归属推导项目；迭代未挂项目（紧急修复）
     *                      则快照只含该未归属迭代，绝不退化成「全部在途项目」。
     * @param iterationCode 目标迭代；非空时快照<b>只含该迭代</b>的需求（按迭代推送时用）
     */
    public Snapshot buildSnapshot(LocalDate date, String reportType, Long projectId, String iterationCode) {
        return buildSnapshot(date, reportType,
                projectId == null ? List.of() : List.of(projectId), iterationCode);
    }

    /**
     * 多项目/全部项目快照。
     * <p>范围语义：
     * <ul>
     *   <li>{@code projectIds} 非空：只取这些项目；</li>
     *   <li>{@code projectIds} 为空且无迭代：全部在途项目（“全部项目”规则/手动触发）；</li>
     *   <li>{@code projectIds} 为空且有迭代：仅该未挂项目迭代（紧急修复），不退化拉全部项目。</li>
     * </ul>
     * 多项目 + 单迭代是歧义范围（迭代只属于一个项目），直接拒绝。
     */
    public Snapshot buildSnapshot(LocalDate date, String reportType, List<Long> projectIds, String iterationCode) {
        LocalDate day = date == null ? LocalDate.now() : date;
        String type = normalizeReportType(reportType);
        List<Long> ids = projectIds == null ? List.of() : projectIds.stream()
                .filter(java.util.Objects::nonNull).distinct().toList();
        boolean iterationOnly = false;
        if (StringUtils.hasText(iterationCode)) {
            if (ids.size() > 1) {
                throw new BusinessException("多項目範圍不能指定單一迭代");
            }
            Map<String, Object> iterationRow = findIterationRow(iterationCode.trim());
            if (iterationRow == null) {
                throw new BusinessException("所選迭代不存在或已刪除: " + iterationCode);
            }
            Long iterationProjectId = toLong(iterationRow.get("project_id"));
            if (ids.isEmpty()) {
                if (iterationProjectId == null) {
                    iterationOnly = true;
                } else {
                    ids = List.of(iterationProjectId);
                }
            } else if (iterationProjectId == null) {
                throw new BusinessException("未掛項目的迭代不能指定項目");
            } else if (!ids.get(0).equals(iterationProjectId)) {
                throw new BusinessException("所選迭代不屬於所選項目");
            }
        }
        final List<Long> scopeIds = ids;
        final boolean onlyUnassignedIteration = iterationOnly;
        Long scopeProjectId = ids.size() == 1 ? ids.get(0) : null;

        RdmFactVO.FactQuery query = new RdmFactVO.FactQuery();
        query.setIncludeTodos(true);
        List<RdmFactVO.ProjectFact> facts = factService.projectFactsForSystem(query);

        // 在途口径：未关闭的项目（PROJECT_ACTIVE_STATUSES 含 preparing/in_progress/partial_delivered/all_delivered）。
        // 暂停项目仍纳入并带 ⏸ 标记：把暂停项目彻底藏起来会让管理者失去「为什么停了、停了多久」的视野。
        List<RdmFactVO.ProjectFact> active = facts.stream()
                .filter(f -> f != null && f.getProjectId() != null)
                .filter(f -> RdmConstants.PROJECT_ACTIVE_STATUSES.contains(f.getStatus()))
                .filter(f -> !scopeIds.isEmpty() ? scopeIds.contains(f.getProjectId()) : !onlyUnassignedIteration)
                .toList();

        Config cfg = loadConfig();
        boolean riskOnly = "risk_only".equals(cfg.getReceiverScope()) && scopeProjectId == null;

        Map<String, String> statusLabels = loadStatusLabels();
        List<Long> activeProjectIds = active.stream().map(RdmFactVO.ProjectFact::getProjectId).toList();
        Map<Long, List<IterationRow>> iterationsByProject = loadIterations(activeProjectIds);
        Map<Long, List<RequirementNode>> reqsByProject = loadRequirements(activeProjectIds, statusLabels, day);

        Snapshot snapshot = new Snapshot();
        snapshot.setReportDate(day.format(DATE_FMT));
        snapshot.setReportType(type);
        snapshot.setReportTypeLabel(slotLabel(type));
        snapshot.setGeneratedAt(java.time.LocalDateTime.now()
                .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        // 范围也写进快照：迭代归属可能在规则保存后才补挂项目，渲染与记录要以「解析后的项目」为准
        snapshot.setScopeProjectId(scopeProjectId);
        snapshot.setScopeIterationCode(StringUtils.hasText(iterationCode) ? iterationCode.trim() : null);
        snapshot.setScopeLabel(buildScopeLabel(active, scopeIds, iterationCode, onlyUnassignedIteration));

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
            nodes.add(toProjectNode(f, iters, reqs, day));
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
                        .filter(StringUtils::hasText).distinct().toList(), statusLabels, day), day));
        // 「全部在途项目」口径才加载未挂项目、也未挂迭代的执行需求；
        // 单项目/多项目报告不把全公司孤儿需求塞进来。
        boolean includeUnassignedDetails = scopeIds.isEmpty() && !onlyUnassignedIteration;
        List<RequirementNode> unassignedRequirements = includeUnassignedDetails
                ? loadUnassignedRequirements(statusLabels, day) : List.of();
        snapshot.setUnassignedRequirements(new ArrayList<>(unassignedRequirements));
        snapshot.setSummary(buildSummary(nodes, snapshot.getUnassignedIterations(), unassignedRequirements,
                activeProjectIds, day, includeUnassignedDetails));
        return snapshot;
    }

    /** 未挂项目、也未挂迭代的执行需求（全部项目口径展示用；已排除执行侧地板中的准入前/需求池） */
    private List<RequirementNode> loadUnassignedRequirements(Map<String, String> statusLabels, LocalDate day) {
        String sql = "SELECT id, req_no, title, status, priority, assignee_pm_name, iteration_code, "
                + "plan_release_date, overdue_flag, blocked_flag, progress, complexity, status_enter_time "
                + "FROM rdm_requirement WHERE deleted = 0 " + executionFloorSql()
                + "AND project_id IS NULL AND (iteration_code IS NULL OR iteration_code = '') ORDER BY priority, id";
        List<Map<String, Object>> rows = jdbc.queryForList(sql);
        if (rows == null || rows.isEmpty()) {
            return new ArrayList<>();
        }
        List<RequirementNode> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            out.add(toRequirementNode(row, statusLabels, day));
        }
        attachTasks(out);
        return out;
    }

    /** 项目节点（不带报告日）：单测与历史调用方用，今日到期需求数因此记 0 */
    static ProjectNode toProjectNode(RdmFactVO.ProjectFact f, List<IterationRow> iterations,
                                     List<RequirementNode> requirements) {
        return toProjectNode(f, iterations, requirements, null);
    }

    /** 项目节点：指标全部搬事实源字段，本方法不做任何再计算（剩余工作只做 total-completed 的减法） */
    static ProjectNode toProjectNode(RdmFactVO.ProjectFact f, List<IterationRow> iterations,
                                     List<RequirementNode> requirements, LocalDate day) {
        ProjectNode n = new ProjectNode();
        n.setProjectId(f.getProjectId());
        n.setProjectNo(f.getProjectNo());
        n.setProjectName(f.getProjectName());
        n.setStatus(f.getStatus());
        n.setPmUserId(f.getPmUserId());
        n.setPmUserName(f.getPmUserName());
        n.setProductOwnerUserId(f.getProductOwnerUserId());
        n.setProductOwnerUserName(f.getProductOwnerUserName());
        // 四类角色 userId 与姓名一同带入快照：收件人按角色推导时只有姓名无法定位到人
        n.setTechLeadUserId(f.getTechLeadUserId());
        n.setTechLeadUserName(f.getTechLeadUserName());
        n.setQaLeadUserId(f.getQaLeadUserId());
        n.setQaLeadUserName(f.getQaLeadUserName());
        n.setUiDesignerUserId(f.getUiDesignerUserId());
        n.setUiDesignerUserName(f.getUiDesignerUserName());
        n.setOpsLeadUserId(f.getOpsLeadUserId());
        n.setOpsLeadUserName(f.getOpsLeadUserName());
        n.setPlanStartDate(f.getPlanStartDate());
        n.setPlanEndDate(f.getPlanEndDate());
        n.setRiskFlag(f.getRiskFlag());
        n.setOverdueFlag(f.getOverdueFlag());
        n.setPausedFlag(f.getPausedFlag());
        n.setDeliveryItemTotal(f.getDeliveryItemTotal());
        n.setDeliveryItemCompleted(f.getDeliveryItemCompleted());
        n.setDeliveryProgressPercent(clampPercent(f.getDeliveryItemTotal() <= 0 ? null
                : f.getDeliveryItemCompleted() * 100d / f.getDeliveryItemTotal()));
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
            applyIterationMetrics(it, reqs, row.capacityHours());
            applyIterationRiskCounts(it, reqs, day);
            iterationNodes.add(it);
        }
        // 需求挂了迭代编码、但该迭代不在当前项目的迭代集合里（迭代未挂项目/已删除）：
        // 不能静默丢行——否则项目需求数会小于系统清单。归入「未排迭代」如实展示。
        java.util.Set<String> knownIterationCodes = iterationNodes.stream()
                .map(IterationNode::getCode).filter(StringUtils::hasText)
                .collect(java.util.stream.Collectors.toSet());
        for (Map.Entry<String, List<RequirementNode>> e : byCode.entrySet()) {
            if (!knownIterationCodes.contains(e.getKey())) {
                unscheduled.addAll(e.getValue());
            }
        }
        n.setIterations(iterationNodes);
        n.setUnscheduledRequirements(unscheduled);
        // 需求总数按「可见需求」统计：挂到迭代的 + 未排迭代的。
        // 不能直接用事实源的项目全量（迭代视角会大于可见行），也不能只数原始查询结果
        // （需求挂了不存在的迭代时不会渲染出来，会造成卡片比列表多）。
        n.setRequirementTotal(unscheduled.size()
                + iterationNodes.stream().mapToInt(IterationNode::getRequirementCount).sum());
        // 在途迭代数：消息项目行的「迭代 N 個」只数未关闭的，把已交付版本计进去会让人高估工作量
        n.setIterationActiveCount((int) iterationNodes.stream()
                .filter(x -> !"closed".equals(x.getStatus())).count());
        return n;
    }

    /**
     * 迭代进度与产能（写入快照，消息与看板同一口径）。
      *
      * <p><b>迭代进度</b> = Σ(任务进度 × 计划工时) ÷ Σ计划工时。
      * 任务进度是每个人自己上报的最细粒度事实；未填计划工时的任务按“已填工时的平均值”计权
      * （全部未填则每条按 1h），避免未填工时的任务被直接忽略。无任务时不编造 0%，置 null。
      *
      * <p><b>产能</b> = 已填计划工时合计 ÷ {@code rdm_iteration.capacity_hours}；产能为 0 时置 null（未設定）。
      * 不使用 {@code rdm_requirement.progress}：该字段可能长期停留 0（任务已完成也不联动），
      * 用它算迭代进度会与执行侧甘特图矛盾。
      */
     static void applyIterationMetrics(IterationNode it, List<RequirementNode> reqs, int capacityHours) {
         List<TaskNode> tasks = new ArrayList<>();
         if (reqs != null) {
             for (RequirementNode r : reqs) {
                 if (r != null && r.getTasks() != null) {
                     tasks.addAll(r.getTasks());
                 }
             }
         }
         int total = tasks.size();
         int done = 0;
         double knownHours = 0d;
         int knownCount = 0;
         for (TaskNode t : tasks) {
             if (t == null) {
                 continue;
             }
             if ("done".equals(t.getStatus())) {
                 done++;
             }
             if (t.getPlanHours() != null && t.getPlanHours() > 0) {
                 knownHours += t.getPlanHours();
                 knownCount++;
             }
         }
         double fallbackHours = knownCount > 0 ? knownHours / knownCount : 1d;
         double weighted = 0d;
         double weight = 0d;
         for (TaskNode t : tasks) {
             if (t == null) {
                 continue;
             }
             int progress = t.getProgress() == null ? 0 : Math.max(0, Math.min(100, t.getProgress()));
             double taskWeight = t.getPlanHours() != null && t.getPlanHours() > 0
                     ? t.getPlanHours() : fallbackHours;
             weighted += progress * taskWeight;
             weight += taskWeight;
         }
         it.setTaskTotal(total);
         it.setTaskDone(done);
         it.setTaskHours(Math.round(knownHours * 10d) / 10d);
         it.setProgressPercent(weight > 0 ? clampPercent(weighted / weight) : null);
         it.setCapacityHours(Math.max(0, capacityHours));
         // 产能允许 >100%：超载必须看得见，不能被截成 100%
         it.setCapacityUsagePercent(capacityHours > 0
                 ? (int) Math.max(0, Math.round(knownHours * 100d / capacityHours)) : null);
     }
     
     /** 百分比夹在 0-100；入参 null 表示分母无效（如零承诺），返回 null 不编造数字 */
     private static Integer clampPercent(Double value) {
         if (value == null) {
             return null;
         }
         return (int) Math.max(0, Math.min(100, Math.round(value)));
     }
     
     /** 迭代级风险计数（逾期需求数、今日到期需求数）。
     *
     * <p>今日到期口径：{@code plan_release_date = 报告日} 且未上线。与项目级
     * {@code todayDueItemCount}（交付项口径）是两个单位，字段名已写清 Req/Item，不得混用。
     * 报告日为空（单测/历史调用）时不记今日到期，避得凭空造一个「今天」。
     */
    static void applyIterationRiskCounts(IterationNode it, List<RequirementNode> reqs, LocalDate day) {
        List<RequirementNode> list = reqs == null ? List.of() : reqs;
        it.setOverdueReqCount((int) list.stream().filter(r -> r != null && isOne(r.getOverdueFlag())).count());
        if (day == null) {
            return;
        }
        String dayText = day.format(DATE_FMT);
        it.setTodayDueReqCount((int) list.stream().filter(r -> r != null
                && dayText.equals(r.getPlanReleaseDate())
                && !"released".equals(r.getStatus()) && !"closed".equals(r.getStatus())).count());
    }

    private static boolean isOne(Integer flag) {
        return flag != null && flag == 1;
    }

    /* ==================== 内部：迭代与需求装载 ==================== */

    /** 迭代原始行（避免为只读聚合再建实体；包级可见供单测构造） */
    record IterationRow(Long id, Long projectId, String code, String name, String iterationType,
                        String status, String startDate, String endDate, String ownerName, int capacityHours) {
        /** 兼容历史构造：未提供产能时按 0（未設定）处理 */
        IterationRow(Long id, Long projectId, String code, String name, String iterationType,
                     String status, String startDate, String endDate, String ownerName) {
            this(id, projectId, code, name, iterationType, status, startDate, endDate, ownerName, 0);
        }
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
        String sql = "SELECT id, project_id, code, name, iteration_type, status, start_date, end_date, owner_name, "
                + "capacity_hours "
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
                rs.getString("owner_name"), rs.getInt("capacity_hours"));
    }

    /**
     * 载需求并按项目分组（<b>一次查询</b>取齐全部所需列）。
     * <p>需求与迭代的挂接键是 {@code iteration_code}（字符串），迭代 code 全局唯一
     * （{@code uk_rdm_iteration_code}），因此按 code 分组不会串项目。
     * <p>{@code req_no} 在延迟发号口径下认领前为空，如实保留空值，不编造编号。
     */
    private Map<Long, List<RequirementNode>> loadRequirements(List<Long> projectIds, Map<String, String> statusLabels,
                                                              LocalDate day) {
        Map<Long, List<RequirementNode>> byProject = new HashMap<>();
        if (projectIds.isEmpty()) {
            return byProject;
        }
        String sql = "SELECT id, req_no, title, status, priority, assignee_pm_name, project_id, iteration_code, "
                + "plan_release_date, overdue_flag, blocked_flag, progress, complexity, status_enter_time "
                + "FROM rdm_requirement WHERE deleted = 0 " + executionFloorSql() + "AND project_id IN ("
                + placeholders(projectIds.size()) + ") ORDER BY priority, id";
        List<RequirementNode> all = new ArrayList<>();
        for (Map<String, Object> row : jdbc.queryForList(sql, projectIds.toArray())) {
            Long pid = toLong(row.get("project_id"));
            if (pid == null) {
                continue;
            }
            RequirementNode node = toRequirementNode(row, statusLabels, day);
            byProject.computeIfAbsent(pid, k -> new ArrayList<>()).add(node);
            all.add(node);
        }
        attachTasks(all);
        return byProject;
    }

    /**
     * 执行侧地板：与需求跟进清单（executionOnly）同口径，排除准入前三态与需求池。
     *
     * <p>日报是执行进度汇报，不是需求台账：草稿/待准入/准入驳回/待分配尚未进入执行，
     * 如果计入「需求总数」，就会出现「日报比需求跟进清单多几条」的口径分叉。
     */
    private static String executionFloorSql() {
        return "AND status NOT IN ('" + RdmConstants.STATUS_DRAFT + "','"
                + RdmConstants.STATUS_INTAKE_PENDING + "','"
                + RdmConstants.STATUS_INTAKE_REJECTED + "','"
                + RdmConstants.STATUS_POOL + "') ";
    }

    /** 行映射：需求原始行 → 展示节点（状态中文名查 rdm_status_def，不硬编码） */
    private RequirementNode toRequirementNode(Map<String, Object> row, Map<String, String> statusLabels,
                                              LocalDate day) {
        RequirementNode r = new RequirementNode();
        Long reqId = toLong(row.get("id"));
        r.setReqId(reqId);
        r.setReqNo((String) row.get("req_no"));
        r.setTitle((String) row.get("title"));
        String status = (String) row.get("status");
        r.setStatus(status);
        r.setStatusLabel(statusLabels.getOrDefault(status, status));
        r.setComplexity((String) row.get("complexity"));
        r.setPriority((String) row.get("priority"));
        r.setAssigneePmName((String) row.get("assignee_pm_name"));
        r.setIterationCode((String) row.get("iteration_code"));
        r.setPlanReleaseDate(toDateString(row.get("plan_release_date")));
        r.setOverdueFlag(toInt(row.get("overdue_flag")));
        r.setBlockedFlag(toInt(row.get("blocked_flag")));
        r.setProgress(toInt(row.get("progress")));
        // 停留天数以 status_enter_time 为准（进入当前状态的时间），不拿 updated_at 冒充：
        // 改个备注也会刷新 updated_at，用它算停留天数会把“停留 30 天”重置成 0
        LocalDate entered = toLocalDate(row.get("status_enter_time"));
        if (entered != null && day != null) {
            r.setStayDays((int) Math.max(0, java.time.temporal.ChronoUnit.DAYS.between(entered, day)));
        }
        if (reqId != null) {
            r.setDetailUrl(RdmConstants.requirementRoute(reqId));
        }
        return r;
    }

    /**
     * 批量挂载任务的甘特数据：一次 IN 查询，避免逐需求查任务（N+1）。
     * <p>任务只读排期字段；负责人属于展示信息，公开看板会按 showOwners 开关裁剪。
     */
    private void attachTasks(List<RequirementNode> reqs) {
        List<Long> ids = reqs.stream().map(RequirementNode::getReqId)
                .filter(java.util.Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return;
        }
        String sql = "SELECT id, task_no, req_id, task_type, title, role_code, owner_name, owner_emp_no, progress, "
                + "plan_hours, plan_start_date, plan_finish_date, status "
                + "FROM rdm_work_task WHERE deleted = 0 AND req_id IN (" + placeholders(ids.size()) + ") "
                + "ORDER BY plan_start_date, plan_finish_date, id";
        Map<Long, List<TaskNode>> byReq = new HashMap<>();
        List<Map<String, Object>> rows = jdbc.queryForList(sql, ids.toArray());
        if (rows == null) {
            // 单元测试 mock 未桩任务查询时返回 null；生产 JdbcTemplate 永远不会返回 null
            return;
        }
        for (Map<String, Object> row : rows) {
            Long reqId = toLong(row.get("req_id"));
            if (reqId == null) {
                continue;
            }
            TaskNode t = new TaskNode();
            t.setTaskId(toLong(row.get("id")));
            t.setTaskNo((String) row.get("task_no"));
            t.setTitle((String) row.get("title"));
            t.setTaskType((String) row.get("task_type"));
            t.setRoleCode((String) row.get("role_code"));
            t.setOwnerName((String) row.get("owner_name"));
            t.setOwnerEmpNo((String) row.get("owner_emp_no"));
            t.setProgress(toInt(row.get("progress")));
            t.setPlanHours(toDouble(row.get("plan_hours")));
            t.setPlanStartDate(toDateString(row.get("plan_start_date")));
            t.setPlanFinishDate(toDateString(row.get("plan_finish_date")));
            t.setStatus((String) row.get("status"));
            byReq.computeIfAbsent(reqId, k -> new ArrayList<>()).add(t);
        }
        reqs.forEach(r -> r.setTasks(byReq.getOrDefault(r.getReqId(), new ArrayList<>())));
    }

    /** 数据库 DATETIME → LocalDate（空/非法一律 null，不让脏值打断日报） */
    private static LocalDate toLocalDate(Object value) {
        if (value instanceof java.sql.Timestamp ts) {
            return ts.toLocalDateTime().toLocalDate();
        }
        if (value instanceof java.time.LocalDateTime ldt) {
            return ldt.toLocalDate();
        }
        if (value instanceof java.sql.Date d) {
            return d.toLocalDate();
        }
        return null;
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
        return buildUnassignedIterations(unassignedRows, byCode, null);
    }

    static List<IterationNode> buildUnassignedIterations(List<IterationRow> unassignedRows,
                                                         Map<String, List<RequirementNode>> byCode,
                                                         LocalDate day) {
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
            applyIterationMetrics(it, reqs, row.capacityHours());
            applyIterationRiskCounts(it, reqs, day);
            list.add(it);
        }
        return list;
    }

    /**
     * 需求风险计数（逾期/阻塞/逾期风险去重）。
     *
     * <p>逾期风险数按“需求去重”：一条需求既逾期又阻塞只算 1，因为管理者要看的是
     * “有多少条需求需要人介入”，而不是标签个数之和。
     */
    private static void fillRequirementRiskCounts(Summary s, List<ProjectNode> nodes,
                                                  List<IterationNode> unassigned,
                                                  List<RequirementNode> unassignedRequirements) {
        java.util.Set<Long> overdue = new java.util.HashSet<>();
        java.util.Set<Long> blocked = new java.util.HashSet<>();
        java.util.Set<Long> risk = new java.util.HashSet<>();
        int[] nullIds = new int[3];
        List<RequirementNode> all = new ArrayList<>();
        if (nodes != null) {
            for (ProjectNode n : nodes) {
                if (n.getIterations() != null) {
                    n.getIterations().forEach(it -> {
                        if (it != null && it.getRequirements() != null) {
                            all.addAll(it.getRequirements());
                        }
                    });
                }
                if (n.getUnscheduledRequirements() != null) {
                    all.addAll(n.getUnscheduledRequirements());
                }
            }
        }
        if (unassigned != null) {
            unassigned.forEach(it -> {
                if (it != null && it.getRequirements() != null) {
                    all.addAll(it.getRequirements());
                }
            });
        }
        if (unassignedRequirements != null) {
            all.addAll(unassignedRequirements);
        }
        for (RequirementNode r : all) {
            if (r == null) {
                continue;
            }
            boolean od = isOne(r.getOverdueFlag());
            boolean bl = isOne(r.getBlockedFlag());
            Long id = r.getReqId();
            if (id == null) {
                if (od) {
                    nullIds[0]++;
                }
                if (bl) {
                    nullIds[1]++;
                }
                if (od || bl) {
                    nullIds[2]++;
                }
                continue;
            }
            if (od) {
                overdue.add(id);
            }
            if (bl) {
                blocked.add(id);
            }
            if (od || bl) {
                risk.add(id);
            }
        }
        s.setOverdueReqCount(overdue.size() + nullIds[0]);
        s.setBlockedReqCount(blocked.size() + nullIds[1]);
        s.setOverdueRiskReqCount(risk.size() + nullIds[2]);
    }

    /** 按迭代 code 集合聚合需求（仅给未归属迭代用，codes 为空时不发 SQL） */
    private Map<String, List<RequirementNode>> loadRequirementsByCodes(List<String> codes,
                                                                       Map<String, String> statusLabels,
                                                                       LocalDate day) {
        Map<String, List<RequirementNode>> byCode = new LinkedHashMap<>();
        if (codes == null || codes.isEmpty()) {
            return byCode;
        }
        String sql = "SELECT id, req_no, title, status, priority, assignee_pm_name, iteration_code, "
                + "plan_release_date, overdue_flag, blocked_flag, progress, complexity, status_enter_time "
                + "FROM rdm_requirement WHERE deleted = 0 " + executionFloorSql() + "AND iteration_code IN ("
                + placeholders(codes.size()) + ") ORDER BY priority, id";
        List<RequirementNode> all = new ArrayList<>();
        for (Map<String, Object> row : jdbc.queryForList(sql, codes.toArray())) {
            String code = (String) row.get("iteration_code");
            if (!StringUtils.hasText(code)) {
                continue;
            }
            RequirementNode node = toRequirementNode(row, statusLabels, day);
            byCode.computeIfAbsent(code, k -> new ArrayList<>()).add(node);
            all.add(node);
        }
        attachTasks(all);
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
    private Summary buildSummary(List<ProjectNode> nodes, List<IterationNode> unassignedIterations,
                                 List<RequirementNode> unassignedRequirements, List<Long> projectIds,
                                 LocalDate day, boolean includeUnassignedDetails) {
        Summary s = new Summary();
        s.setProjectCount(nodes.size());
        s.setRiskProjectCount((int) nodes.stream().filter(ProjectNode::isAttention).count());
        s.setNormalProjectCount(Math.max(0, nodes.size() - s.getRiskProjectCount()));
        // 在途迭代数 = 各项目在途迭代 + 未挂项目的在途迭代：看板顶部「迭代版本数」与消息汇总同源
        int activeIterations = nodes.stream().mapToInt(ProjectNode::getIterationActiveCount).sum();
        if (unassignedIterations != null) {
            activeIterations += (int) unassignedIterations.stream()
                    .filter(x -> x != null && !"closed".equals(x.getStatus())).count();
        }
        s.setIterationActiveCount(activeIterations);
        for (ProjectNode n : nodes) {
            s.setRequirementTotal(s.getRequirementTotal() + n.getRequirementTotal());
            s.setDeliveryItemTotal(s.getDeliveryItemTotal() + n.getDeliveryItemTotal());
            s.setDeliveryItemCompleted(s.getDeliveryItemCompleted() + n.getDeliveryItemCompleted());
            s.setTodoTotal(s.getTodoTotal() + n.getTodoTotal());
        }
        fillRequirementRiskCounts(s, nodes, unassignedIterations, unassignedRequirements);
        if (includeUnassignedDetails) {
            if (unassignedRequirements != null) {
                s.setRequirementTotal(s.getRequirementTotal() + unassignedRequirements.size());
            }
            if (unassignedIterations != null) {
                s.setRequirementTotal(s.getRequirementTotal()
                        + unassignedIterations.stream()
                        .filter(it -> it != null && !"closed".equals(it.getStatus()))
                        .mapToInt(IterationNode::getRequirementCount).sum());
            }
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

    private static Double toDouble(Object value) {
        return value instanceof Number n ? n.doubleValue() : null;
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
        return checkManualThrottle(slot, projectId, null, nowMillis);
    }

    /**
     * 手动真发节流（带发送对象维度）。
     * <p>「刚发完群、马上发个人」是合法操作，不能被同一个窗口拦住；
     * 反之只发同一个人也不能借不同对象绕过 1 分钟限制。
     */
    String checkManualThrottle(String slot, Long projectId, String recipientKey, long nowMillis) {
        String key = slot + ":" + (projectId == null ? "all" : projectId)
                + (StringUtils.hasText(recipientKey) ? ":" + recipientKey : "");
        Long last = lastManualPushAt.get(key);
        if (last != null && nowMillis - last < MANUAL_THROTTLE_MS) {
            return "距上次手動推送不足 1 分鐘，請稍後再試（避免重複刷屏）";
        }
        lastManualPushAt.put(key, nowMillis);
        return null;
    }

    /**
     * 手动触发的发送对象覆盖（只作用于手动触发；定时规则仍按推送配置的群+个人）。
     * <ul>
     *   <li>{@code all}（默认）：群 + 配置收件人；</li>
     *   <li>{@code group}：只发群，不发个人；</li>
     *   <li>{@code users}：只发指定人，不发群、不发其他收件人。</li>
     * </ul>
     * <p>指定人的内容口径是「本次推送范围全量汇总」：他们未必是项目成员，
     * 按项目归属裁剪会得到一份空日报。
     */
    public record RecipientOverride(String mode, List<Long> userIds) {
        public static final String MODE_ALL = "all";
        public static final String MODE_GROUP = "group";
        public static final String MODE_USERS = "users";

        public static RecipientOverride all() {
            return new RecipientOverride(MODE_ALL, List.of());
        }

        public boolean groupAllowed() {
            return !MODE_USERS.equals(mode);
        }

        public boolean personalAllowed() {
            return !MODE_GROUP.equals(mode);
        }

        public List<Long> targetUserIds() {
            return userIds == null ? List.of() : userIds;
        }

        /** 节流键后缀：不同发送对象各自计时 */
        public String throttleKey() {
            if (MODE_GROUP.equals(mode)) {
                return "group";
            }
            if (MODE_USERS.equals(mode)) {
                return "users:" + targetUserIds().stream().sorted()
                        .map(String::valueOf).collect(java.util.stream.Collectors.joining(","));
            }
            return null;
        }
    }

    /**
     * 一次推送的目标与口径（规则推送与手动触发共用同一套执行链路）。
     *
     * <p>把「发什么范围、用哪个模板、算哪一档内容」抽成一个值对象，是为了让定时与手动
     * <b>只有触发方式不同</b>：两边都调用 {@link #push}，不存在两套并行实现各自漂移。
     *
     * @param ruleId              规则ID（手动触发为 null）
     * @param ruleName            规则名称快照（记入快照，规则日后改名/删除历史记录仍可读）
     * @param projectId           目标项目；迭代未挂项目（紧急修复）时可为 null，此时只按 iterationCode 收敛
     * @param iterationCode       目标迭代（null=该项目全部迭代）
     * @param contentType         morning=今日焦点 / evening=当日复盘（决定模板与汇总侧重）
     * @param groupTemplateKey    群报模板（空=按档位默认）
     * @param personalTemplateKey 个人模板（空=按档位默认）
     */
    public record TriggerTarget(Long ruleId, String ruleName, Long projectId, List<Long> projectIds,
                                String iterationCode, String contentType, String groupTemplateKey,
                                String personalTemplateKey) {
        /** 兼容存量七参构造：单项目 / 仅迭代 / 全部项目 */
        public TriggerTarget(Long ruleId, String ruleName, Long projectId, String iterationCode,
                             String contentType, String groupTemplateKey, String personalTemplateKey) {
            this(ruleId, ruleName, projectId,
                    projectId == null ? List.of() : List.of(projectId), iterationCode,
                    contentType, groupTemplateKey, personalTemplateKey);
        }

        public List<Long> scopeProjectIds() {
            return projectIds == null ? List.of() : projectIds;
        }

        /** 空项目集合 + 无迭代 = 全部在途项目 */
        public boolean allProjects() {
            return scopeProjectIds().isEmpty() && !StringUtils.hasText(iterationCode);
        }

        /**
         * 范围键（幂等维度）：规则=rule:{id}；手动=manual:{projectId}:{iterationCode}。
         * <p>多项目/全部项目没有单一 projectId，用排序后的 id 集合/ALL 编码，保证同范围重复触发覆盖同一行、
         * 不同范围互不覆盖。
         */
        public String scopeKey() {
            if (ruleId != null) {
                return "rule:" + ruleId;
            }
            List<Long> ids = scopeProjectIds();
            if (ids.isEmpty()) {
                return allProjects() ? "manual:all"
                        : "manual:null:" + (iterationCode == null ? "" : iterationCode);
            }
            String suffix = iterationCode == null ? "" : iterationCode;
            if (ids.size() == 1) {
                return "manual:" + ids.get(0) + ":" + suffix;
            }
            return "manual:ids:" + ids.stream().sorted()
                    .map(String::valueOf).collect(java.util.stream.Collectors.joining(","));
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
        fillRuleProjectSummaries(rules);
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
        fillRuleProjectSummaries(rows);
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
        String iteration = blankToNull(form.getIterationCode());
        List<Long> ids = form.getProjectIds() == null ? new ArrayList<>() : form.getProjectIds().stream()
                .filter(java.util.Objects::nonNull).distinct().toList();
        if (ids.isEmpty() && form.getProjectId() != null) {
            ids = List.of(form.getProjectId());
        }
        if (iteration != null) {
            Map<String, Object> iterationRow = findIterationRow(iteration);
            if (iterationRow == null) {
                throw new BusinessException("所選迭代不存在或已刪除: " + iteration);
            }
            Long iterationProjectId = toLong(iterationRow.get("project_id"));
            if (iterationProjectId == null) {
                // 未挂项目的紧急修复迭代：规则不能再指定项目，否则范围会互相矛盾
                if (!ids.isEmpty()) {
                    throw new BusinessException("所選迭代未掛項目，規則不能再指定所屬項目（請清空項目後保存）");
                }
            } else {
                if (ids.size() > 1 || (!ids.isEmpty() && !ids.get(0).equals(iterationProjectId))) {
                    throw new BusinessException("指定迭代時只能選擇該迭代所屬項目");
                }
                ids = List.of(iterationProjectId);
            }
        }
        for (Long id : ids) {
            requireProjectExists(id);
        }
        if (ids.size() > 1 && iteration != null) {
            throw new BusinessException("多項目範圍不能指定單一迭代");
        }
        Long projectId = ids.size() == 1 ? ids.get(0) : null;
        String projectIdsJson = ids.size() > 1 ? writeProjectIds(ids) : null;
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
            jdbc.update("UPDATE rdm_daily_report_rule SET name = ?, project_id = ?, project_ids = ?, iteration_code = ?, "
                            + "push_time = ?, content_type = ?, group_template_key = ?, personal_template_key = ?, "
                            + "enabled = ?, remark = ?, updated_by = ?, updated_at = NOW() WHERE id = ? AND deleted = 0",
                    name, projectId, projectIdsJson, iteration, pushTime, slot,
                    blankToNull(groupKey), blankToNull(personalKey), bool(form.getEnabled(), true),
                    form.getRemark(), operator, form.getId());
            log.info("日報推送規則已更新: id={}, projects={}, iteration={}, time={}, slot={}, operator={}",
                    form.getId(), ids, iteration, pushTime, slot, operator);
            return findRule(form.getId());
        }

        // 新增：用自增主键回读本次插入的行。
        // 不能写「ORDER BY id DESC LIMIT 1」——并发下两个管理员同时新增时，
        // 后一个可能拿到前一个刚插入的规则，界面会显示成「保存后变成了别人那条」。
        org.springframework.jdbc.support.KeyHolder keyHolder =
                new org.springframework.jdbc.support.GeneratedKeyHolder();
        // lambda 捕获要求 effectively final：范围解析阶段可能重写过 projectId
        final Long insertProjectId = projectId;
        jdbc.update(connection -> {
            java.sql.PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO rdm_daily_report_rule "
                            + "(name, project_id, project_ids, iteration_code, push_time, content_type, group_template_key, "
                            + " personal_template_key, enabled, remark, created_by, updated_by) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    java.sql.Statement.RETURN_GENERATED_KEYS);
            int i = 1;
            ps.setString(i++, name);
            if (insertProjectId == null) {
                // 迭代未挂项目（紧急修复）：规则只以迭代为范围，project_id 必须落 NULL 而不是 0
                ps.setNull(i++, java.sql.Types.BIGINT);
            } else {
                ps.setLong(i++, insertProjectId);
            }
            ps.setString(i++, projectIdsJson);
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
        log.info("日報推送規則已新建: id={}, projects={}, iteration={}, time={}, slot={}, operator={}",
                newId, ids, iteration, pushTime, slot, operator);
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
        List<Long> ids = rule.getProjectIds() != null && !rule.getProjectIds().isEmpty()
                ? rule.getProjectIds()
                : (rule.getProjectId() == null ? List.of() : List.of(rule.getProjectId()));
        return push(new TriggerTarget(rule.getId(), rule.getName(), rule.getProjectId(), ids,
                rule.getIterationCode(), rule.getContentType(),
                rule.getGroupTemplateKey(), rule.getPersonalTemplateKey()), false, null, false);
    }

    /**
     * 手动触发：选定项目（可选指定迭代）+ 内容档位，立即推送。
     * <p><b>项目必填</b>：规则与手动触发都是项目维度，避免「不选项目=一次性给全公司所有人刷一遍」的误操作。
     * <p>手动推送写 {@code report_type=manual} 行，不被定时幂等拦住（补发本就是合法语义），
     * 且 scope_key 带项目/迭代，不同项目的补发互不覆盖。
     */
    public TriggerResult triggerManual(String contentType, Long projectId, String iterationCode,
                                       String operator, boolean dryRun) {
        // 旧单项目入口：不传项目仍按原语义拒绝（全部项目必须走新入口显式表达）
        if (projectId == null) {
            throw new BusinessException("請選擇要推送的項目");
        }
        return triggerManual(contentType, List.of(projectId), iterationCode, operator, dryRun);
    }

    /**
     * 手动触发（多项目/全部项目）：
     * <ul>
     *   <li>projectIds 非空：只推这些项目；</li>
     *   <li>projectIds 为空且无迭代：全部在途项目（显式“全部项目”）；</li>
     *   <li>projectIds 为空且有迭代：仅该未挂项目迭代。</li>
     * </ul>
     * 多项目 + 单迭代是歧义范围，直接拒绝。
     */
    public TriggerResult triggerManual(String contentType, List<Long> projectIds, String iterationCode,
                                       String operator, boolean dryRun) {
        return triggerManual(contentType, projectIds, iterationCode, operator, dryRun, null);
    }

    /**
     * 手动触发（带发送对象）：recipient 为空 = 群 + 个人（现状）；group = 仅群；users = 仅指定人。
     */
    public TriggerResult triggerManual(String contentType, List<Long> projectIds, String iterationCode,
                                       String operator, boolean dryRun, RecipientOverride recipient) {
        String slot = normalizeReportType(contentType);
        List<Long> ids = projectIds == null ? List.of() : projectIds.stream()
                .filter(java.util.Objects::nonNull).distinct().toList();
        String iteration = blankToNull(iterationCode);
        if (iteration != null) {
            if (ids.size() > 1) {
                throw new BusinessException("多項目範圍不能指定單一迭代");
            }
            Map<String, Object> iterationRow = findIterationRow(iteration);
            if (iterationRow == null) {
                throw new BusinessException("所選迭代不存在或已刪除: " + iteration);
            }
            Long iterationProjectId = toLong(iterationRow.get("project_id"));
            if (ids.isEmpty() && iterationProjectId != null) {
                ids = List.of(iterationProjectId);
            } else if (iterationProjectId == null && !ids.isEmpty()) {
                throw new BusinessException("未掛項目的迭代不能指定項目");
            } else if (!ids.isEmpty() && !ids.get(0).equals(iterationProjectId)) {
                throw new BusinessException("所選迭代不屬於所選項目");
            }
        }
        for (Long id : ids) {
            Integer projectExists = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM rdm_project WHERE id = ?", Integer.class, id);
            if (projectExists == null || projectExists == 0) {
                throw new BusinessException("推送目標項目不存在或已刪除: " + id);
            }
        }
        Long singleProjectId = ids.size() == 1 ? ids.get(0) : null;
        return push(new TriggerTarget(null, null, singleProjectId, ids, iteration, slot, null, null),
                true, operator, dryRun, recipient);
    }

    /**
     * 推送核心：定时与手动<b>共用</b>这一条链路（开关、幂等、节流、渲染、两通道、落库）。
     *
     * @param manual true=手动触发（写 manual 档 + 节流）；false=定时（当日该范围该档已推送则跳过）
     */
    public TriggerResult push(TriggerTarget target, boolean manual, String operator, boolean dryRun) {
        // 旧入口：未指定发送对象，按配置的「群 + 个人」
        return push(target, manual, operator, dryRun, null);
    }

    /**
     * 推送核心（带发送对象覆盖）。
     *
     * @param recipient 手动触发的发送对象覆盖；null = 按配置的群+个人（定时任务固定为 null）
     */
    public TriggerResult push(TriggerTarget target, boolean manual, String operator, boolean dryRun,
                              RecipientOverride recipient) {
        RecipientOverride recipients = recipient == null ? RecipientOverride.all() : recipient;
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
            String reject = checkManualThrottle(slot, target.projectId(), recipients.throttleKey(),
                    System.currentTimeMillis());
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

        Snapshot snapshot = buildSnapshot(day, slot, target.scopeProjectIds(), target.iterationCode());
        // 单项目/迭代范围以 target 兜底：buildSnapshot 已会写入，但单测/未来替身可能只返回内容；
        // 多项目/全部项目保持 null，快照靠 scopeKey 定位。
        if (target.scopeProjectIds().size() == 1) {
            snapshot.setScopeProjectId(target.scopeProjectIds().get(0));
        }
        if (StringUtils.hasText(target.iterationCode())) {
            snapshot.setScopeIterationCode(target.iterationCode().trim());
        }
        if (manual) {
            // 快照自身也要标成 manual：详情页按 URL 的 type 取数，标错就会读不到这一行
            snapshot.setReportType(RdmDailyReportTemplates.TYPE_MANUAL);
            snapshot.setReportTypeLabel("手動補發·" + slotLabel(slot));
        }
        result.setProjectCount(snapshot.getSummary().getProjectCount());
        String baseUrl = resolvePortalBaseUrl();
        // 多项目/全部项目没有单一 projectId，链接必须带 scopeKey 才能精确命中这份快照；
        // 单项目也一并带上，避免同日多规则时按「最新一条」打开别的范围。
        String detailUrl = buildViewUrl(baseUrl, day, storedType, snapshot.getScopeProjectId(),
                snapshot.getScopeIterationCode(), scopeKey, cfg.getBoardLinkValidDays());
        // 回传给手动触发页：弹窗查看看板用，与真正发出去的链接是同一个
        result.setDetailUrl(detailUrl);

        boolean eveningSlot = RdmDailyReportTemplates.TYPE_EVENING.equals(slot);
        // 降噪只作用于定时推送：手动触发是「我现在就要看」，预览更不能被降噪吞掉内容。
        // 三个条件里任何一个为真都保留完整摘要：manual / dryRun / 策略为 full 或当日有异常。
        String quietPolicy = normalizeQuietPolicy(cfg.getQuietPolicy(), DEFAULT_QUIET_POLICY);
        boolean quietGate = !manual && !effectiveDryRun && isQuietGroupDay(snapshot, eveningSlot);
        boolean quietSkip = quietGate && QUIET_SKIP.equals(quietPolicy);
        boolean quietBrief = quietGate && !QUIET_FULL.equals(quietPolicy);

        Rendered group;
        if (quietBrief) {
            // brief 与 skip 都渲染极简结论：skip 也要落快照，快照内容必须与「今日无异常」一致
            group = renderer.renderGroupQuiet(snapshot, eveningSlot, detailUrl);
        } else if (isFixedMode(cfg)) {
            // 固定框架模式：层级写死在渲染器，模板文本不参与渲染，因此不查模板（也不允许“改模板”改变框架）
            group = renderer.renderGroupFixed(snapshot, detailUrl, eveningSlot, cfg.getMessageFields());
        } else {
            // 自定义模板模式：规则可各自指定模板；未指定时回落到全局该档默认模板，再回落到代码内预置
            String groupKey = StringUtils.hasText(target.groupTemplateKey())
                    ? target.groupTemplateKey()
                    : (RdmDailyReportTemplates.TYPE_MORNING.equals(slot)
                    ? cfg.getMorningTemplateKey() : cfg.getEveningTemplateKey());
            Template groupTpl = resolveTemplate(RdmDailyReportTemplates.CHANNEL_GROUP, slot, groupKey);
            group = renderer.renderGroup(groupTpl.getTitleTpl(), groupTpl.getContentTpl(), snapshot, detailUrl);
        }
        result.setGroupTitle(group.title());
        result.setGroupContent(group.content());

        boolean groupDispatched = false;
        if (recipients.groupAllowed()
                && Boolean.TRUE.equals(cfg.getGroupEnabled()) && !effectiveDryRun && !quietSkip) {
            // 群报走 outbox：RdmNotifyService 登记后由 RdmNotifyDispatcher 抢占发送并退避重试
            if (useCard(cfg, detailUrl)) {
                notifyService.notifyActionCard(RdmConstants.EVENT_DAILY_REPORT, group.title(), group.content(),
                        CARD_BTN_GROUP, detailUrl);
            } else {
                // 模板模式或链接不是绝对地址（钉钉不认站内相对路径，按钮会点不动）时保持 markdown
                notifyService.notifyUsers(RdmConstants.EVENT_DAILY_REPORT, null, List.of(),
                        group.title(), group.content());
            }
            groupDispatched = true;
        }
        result.setGroupDispatched(groupDispatched);

        int[] personal;
        if (quietSkip || !recipients.personalAllowed()) {
            personal = new int[]{0, 0};
        } else if (!recipients.targetUserIds().isEmpty()) {
            // 仅指定人：内容按本次推送范围全量汇总（指定人未必是项目成员，不能按项目归属裁剪）
            personal = pushPersonalToUsers(snapshot, cfg, slot, storedType, baseUrl, detailUrl,
                    target.personalTemplateKey(), effectiveDryRun, quietBrief, recipients.targetUserIds());
        } else {
            personal = pushPersonal(snapshot, cfg, slot, storedType, baseUrl, detailUrl,
                    target.personalTemplateKey(), effectiveDryRun, quietBrief);
        }
        result.setPersonalSent(personal[0]);
        result.setPersonalSkipped(personal[1]);

        if (!effectiveDryRun) {
            persistSnapshot(snapshot, group, personal[0], manual, operator, scopeKey, target);
        }
        if (quietSkip) {
            // 跳发不是失败：快照已落库，详情页能打开，消息中心也能解释「今天为什么没发」
            result.setMessage("今日無異常，已按降噪策略（skip）跳過發送；日報已生成，可手動打開查看");
        } else {
            result.setMessage(buildMessage(snapshot, groupDispatched, personal[0], personal[1], effectiveDryRun));
        }
        log.info("日报推送完成: date={}, scope={}, slot={}, storedType={}, manual={}, 项目={}, 群报={}, 个人发送={}, 个人跳过={}, dryRun={}, quiet={}",
                day, scopeKey, slot, storedType, manual, snapshot.getSummary().getProjectCount(), groupDispatched,
                personal[0], personal[1], effectiveDryRun, quietSkip ? "skip" : quietBrief ? "brief" : "full");
        return result;
    }

    /** 范围说明（快照与记录页复用的可读文案） */
    private static String scopeLabel(Long projectId, String iterationCode) {
        String project = projectId == null ? "未掛項目" : "項目#" + projectId;
        return StringUtils.hasText(iterationCode)
                ? project + " / 迭代 " + iterationCode
                : project + " / 全部迭代";
    }

    /** 多项目/全部项目的可读范围：「全部在途項目」或「A、B、C」 */
    private static String buildScopeLabel(List<RdmFactVO.ProjectFact> active, List<Long> ids,
                                          String iterationCode, boolean iterationOnly) {
        if (iterationOnly) {
            return "未掛項目 / 迭代 " + iterationCode;
        }
        if (ids.isEmpty()) {
            return "全部在途項目";
        }
        if (ids.size() == 1) {
            return scopeLabel(ids.get(0), iterationCode);
        }
        List<String> names = active.stream()
                .map(f -> StringUtils.hasText(f.getProjectName()) ? f.getProjectName() : "項目#" + f.getProjectId())
                .limit(6).toList();
        if (names.isEmpty()) {
            return ids.size() + " 個項目";
        }
        String text = String.join("、", names);
        if (active.size() > 6) {
            text += " 等" + active.size() + " 個項目";
        }
        return text;
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
                               String detailUrl, String personalTemplateKey, boolean dryRun, boolean quietBrief) {
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
            return new int[]{0, countReceivers(snapshot, cfg)};
        }
        // 规则可指定个人模板；未指定回落到全局默认。固定框架模式下模板不参与渲染，不白查一次库
        boolean fixed = isFixedMode(cfg);
        boolean eveningSlot = RdmDailyReportTemplates.TYPE_EVENING.equals(slot);
        Template tpl = null;
        if (!fixed) {
            String key = StringUtils.hasText(personalTemplateKey)
                    ? personalTemplateKey : cfg.getPersonalTemplateKey();
            tpl = resolveTemplate(RdmDailyReportTemplates.CHANNEL_PERSONAL, slot, key);
        }

        // 收件人 → 其可见项目：角色收件人只拿自己参与的项目，追加收件人拿规则范围全量
        Map<Long, Receiver> byReceiver = resolveReceivers(snapshot, cfg);

        for (Map.Entry<Long, Receiver> e : byReceiver.entrySet()) {
            SysUser user = userMapper.selectById(e.getKey());
            if (user == null || !StringUtils.hasText(user.getDingtalkUserId())) {
                // fail-closed：未绑定钉钉 userId 就跳过这个人，绝不用手机号群发或降级到群里 @
                skipped++;
                log.info("日报个人通知跳过（未绑定钉钉 userId）: userId={}", e.getKey());
                continue;
            }
            List<ProjectNode> mine = e.getValue().getProjects();
            // 统一用本次快照的 scopeKey 链接：多项目/全部项目下，按单个项目拼链接可能命中不存在的单项目快照，
            // 打开后就是空页；单项目时 scopeKey 也精确命中同一份快照。
            String myUrl = detailUrl;
            PersonalView personal = buildPersonalView(user.getName(), mine);
            // 个人降噪口径与群报不同：一个人可能全公司无异常、但他自己负责的项目有逾期，此时照常发完整内容
            boolean quiet = quietBrief && isQuietPersonalDay(personal);
            Rendered r = quiet
                    ? renderer.renderPersonalQuiet(snapshot, eveningSlot, personal, myUrl)
                    : (fixed
                    ? renderer.renderPersonalFixed(snapshot, myUrl, eveningSlot, personal, cfg.getMessageFields())
                    : renderer.renderPersonal(tpl.getTitleTpl(), tpl.getContentTpl(), snapshot, myUrl, personal));
            if (dryRun) {
                sent++;
                continue;
            }
            try {
                if (useCard(cfg, myUrl)) {
                    // 个人日报用圆角按钮（独立跳转 ActionCard），与会议详情的按钮一致
                    dingTalkAppService.sendWorkActionCardPill(NotificationAppService.RDM_DAILY_REPORT, app.getId(),
                            List.of(user.getDingtalkUserId()), r.title(), r.content(),
                            CARD_BTN_PERSONAL, myUrl);
                } else {
                    dingTalkAppService.sendWorkNotification(NotificationAppService.RDM_DAILY_REPORT, app.getId(),
                            List.of(user.getDingtalkUserId()), r.title(), r.content());
                }
                sent++;
            } catch (RuntimeException ex) {
                // 单人失败不影响其他人：日报是周期性汇总，漏一个人下次时点自然补上
                skipped++;
                log.warn("日报个人通知发送失败: userId={}, error={}", e.getKey(), ex.getClass().getSimpleName());
            }
        }
        return new int[]{sent, skipped};
    }

    /**
     * 仅指定人的个人通知（手动触发）。
     * <p>与 {@link #pushPersonal} 的差异只有两点：收件人来自参数；内容按本次推送范围全量汇总
     * （指定人未必是项目成员，按项目归属裁剪会得到空日报）。渲染、降噪、发送口径必须与其一致，
     * 改一处必须同步另一处。
     */
    private int[] pushPersonalToUsers(Snapshot snapshot, Config cfg, String slot, String urlType, String baseUrl,
                                      String detailUrl, String personalTemplateKey, boolean dryRun,
                                      boolean quietBrief, List<Long> userIds) {
        if (!Boolean.TRUE.equals(cfg.getPersonalEnabled()) && !dryRun) {
            // 个人渠道是管理员关掉的闸：指定人不能绕过它，否则「关掉个人通知」形同虚设；
            // 干跑只是预览内容，不发送，不受渠道开关限制
            throw new BusinessException("個人通知渠道已關閉，無法只發給指定人；請先在推送配置開啟個人渠道");
        }
        Credentials app = dryRun ? null : appService.resolve(NotificationAppService.RDM_DAILY_REPORT);
        if (!dryRun && app == null) {
            throw new BusinessException("個人通知渠道未綁定企業應用，請先在通知渠道配置頁綁定");
        }
        boolean fixed = isFixedMode(cfg);
        boolean eveningSlot = RdmDailyReportTemplates.TYPE_EVENING.equals(slot);
        Template tpl = null;
        if (!fixed) {
            String key = StringUtils.hasText(personalTemplateKey)
                    ? personalTemplateKey : cfg.getPersonalTemplateKey();
            tpl = resolveTemplate(RdmDailyReportTemplates.CHANNEL_PERSONAL, slot, key);
        }
        List<ProjectNode> scopeProjects = snapshot.getProjects() == null ? List.of() : snapshot.getProjects();
        int sent = 0;
        int skipped = 0;
        for (Long userId : userIds) {
            SysUser user = userMapper.selectById(userId);
            if (user == null || !StringUtils.hasText(user.getDingtalkUserId())) {
                skipped++;
                log.info("日报指定人通知跳过（用户不存在或未绑定钉钉 userId）: userId={}", userId);
                continue;
            }
            PersonalView personal = buildPersonalView(user.getName(), scopeProjects);
            boolean quiet = quietBrief && isQuietPersonalDay(personal);
            Rendered r = quiet
                    ? renderer.renderPersonalQuiet(snapshot, eveningSlot, personal, detailUrl)
                    : (fixed
                    ? renderer.renderPersonalFixed(snapshot, detailUrl, eveningSlot, personal, cfg.getMessageFields())
                    : renderer.renderPersonal(tpl.getTitleTpl(), tpl.getContentTpl(), snapshot, detailUrl, personal));
            if (dryRun) {
                sent++;
                continue;
            }
            try {
                if (useCard(cfg, detailUrl)) {
                    // 指定人补发同样用圆角按钮，避免两条入口样式不一致
                    dingTalkAppService.sendWorkActionCardPill(NotificationAppService.RDM_DAILY_REPORT, app.getId(),
                            List.of(user.getDingtalkUserId()), r.title(), r.content(),
                            CARD_BTN_PERSONAL, detailUrl);
                } else {
                    dingTalkAppService.sendWorkNotification(NotificationAppService.RDM_DAILY_REPORT, app.getId(),
                            List.of(user.getDingtalkUserId()), r.title(), r.content());
                }
                sent++;
            } catch (RuntimeException ex) {
                skipped++;
                log.warn("日报指定人通知发送失败: userId={}, error={}", userId, ex.getClass().getSimpleName());
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

    private int countReceivers(Snapshot snapshot, Config cfg) {
        return resolveReceivers(snapshot, cfg).size();
    }

    /* ==================== 收件人解析（推送与预览共用同一口径） ==================== */

    /**
     * 收件人 → 其可见项目 + 命中来源。
     *
     * <p><b>两类收件人的视角不同，不能混为一谈</b>：
     * <ul>
     *   <li><b>角色收件人</b>：只拿到自己在该规则范围内的项目（按项目归属分配）；</li>
     *   <li><b>追加收件人</b>：没有项目归属，拿到规则范围的全部项目汇总。</li>
     * </ul>
     * 排除名单在最后一步剔除，优先级最高。同一人命中多个角色时按 projectId 去重，
     * 避免同一个项目在个人报里重复出现。
     *
     * <p>推送与预览必须共用本方法：两处各写一套必然漂移，出现「预览说有 10 人、实发 8 人」。
     */
    private Map<Long, Receiver> resolveReceivers(Snapshot snapshot, Config cfg) {
        // null = 配置对象未携带该字段（旧调用方/测试桩），按默认角色处理；
        // 空数组 = 管理员主动清空角色、只留追加人，不能回落到默认值
        List<String> roles = cfg.getReceiverRoles() == null
                ? new ArrayList<>(DEFAULT_RECEIVER_ROLES) : safeStringList(cfg.getReceiverRoles());
        List<ProjectNode> projects = snapshot.getProjects() == null ? List.of() : snapshot.getProjects();
        // 成员表一次批量查：逐项目回查在「全部项目」规则下就是 N+1，推送会被拖到超时
        Map<Long, List<Long>> memberUserIds = roles.contains("project_member")
                ? loadActiveMemberUserIds(projects) : Map.of();

        Map<Long, Receiver> byReceiver = new LinkedHashMap<>();
        for (ProjectNode p : projects) {
            for (String role : roles) {
                for (Long userId : userIdsOfRole(p, role, memberUserIds)) {
                    Receiver receiver = byReceiver.computeIfAbsent(userId, k -> new Receiver());
                    receiver.getProjects().add(p);
                    receiver.getSources().add(role);
                }
            }
        }

        // 追加收件人：规则范围全量。取并集而非覆盖——他可能既是某项目 PM 又在追加名单里，
        // 两重身份应当合并成「全量」，而不是按遍历顺序随机取一边
        for (Long userId : safeLongList(cfg.getExtraReceiverUserIds())) {
            Receiver receiver = byReceiver.computeIfAbsent(userId, k -> new Receiver());
            receiver.getProjects().clear();
            receiver.getProjects().addAll(projects);
            receiver.getSources().add("extra");
        }

        // 排除优先于角色与追加
        for (Long userId : safeLongList(cfg.getExcludeReceiverUserIds())) {
            byReceiver.remove(userId);
        }

        byReceiver.values().forEach(Receiver::distinctProjects);
        return byReceiver;
    }

    /** 收件人快照：可见项目 + 来源（来源只用于预览展示，推送侧不消费） */
    private static final class Receiver {
        private final List<ProjectNode> projects = new ArrayList<>();
        private final Set<String> sources = new LinkedHashSet<>();

        List<ProjectNode> getProjects() {
            return projects;
        }

        Set<String> getSources() {
            return sources;
        }

        /** 同一人命中多角色 / 同一项目被追加覆盖时会重复，按 projectId 去重且保持快照顺序 */
        void distinctProjects() {
            Map<Long, ProjectNode> seen = new LinkedHashMap<>();
            for (ProjectNode p : projects) {
                seen.putIfAbsent(p.getProjectId(), p);
            }
            projects.clear();
            projects.addAll(seen.values());
        }
    }

    /** 单个项目上某角色对应的 userId；project_member 走成员表（一人多角色会返回同一 id，由去重兜底） */
    private List<Long> userIdsOfRole(ProjectNode p, String role, Map<Long, List<Long>> memberUserIds) {
        return switch (role) {
            case "pm" -> singleId(p.getPmUserId());
            case "product_owner" -> singleId(p.getProductOwnerUserId());
            case "tech_lead" -> singleId(p.getTechLeadUserId());
            case "qa_lead" -> singleId(p.getQaLeadUserId());
            case "ui_designer" -> singleId(p.getUiDesignerUserId());
            case "ops_lead" -> singleId(p.getOpsLeadUserId());
            case "project_member" -> memberUserIds.getOrDefault(p.getProjectId(), List.of());
            default -> List.of();
        };
    }

    private static List<Long> singleId(Long userId) {
        return userId == null ? List.of() : List.of(userId);
    }

    /**
     * 在途项目成员：一次 IN 查询返回 projectId → userId 列表。
     * <p>只取 {@code leave_time IS NULL}：已离任成员不应继续收到日报，否则换人后旧成员会一直被打扰。
     */
    private Map<Long, List<Long>> loadActiveMemberUserIds(List<ProjectNode> projects) {
        List<Long> projectIds = projects.stream().map(ProjectNode::getProjectId)
                .filter(Objects::nonNull).distinct().toList();
        if (projectIds.isEmpty()) {
            return Map.of();
        }
        String placeholders = String.join(",", Collections.nCopies(projectIds.size(), "?"));
        Map<Long, List<Long>> byProject = new HashMap<>();
        jdbc.query("SELECT project_id, user_id FROM rdm_project_member "
                        + "WHERE leave_time IS NULL AND project_id IN (" + placeholders + ")",
                (java.sql.ResultSet rs) -> {
                    long projectId = rs.getLong("project_id");
                    long userId = rs.getLong("user_id");
                    if (userId > 0) {
                        byProject.computeIfAbsent(projectId, k -> new ArrayList<>()).add(userId);
                    }
                },
                projectIds.toArray());
        return byProject;
    }

    /**
     * 收件人预览：按当前配置 + 指定规则的实时范围现算清单。
     *
     * <p><b>为何不读快照</b>：快照是「上次发了什么」，预览是「改完配置下次会怎样」；
     * 且历史快照不含四类新增角色 userId，读快照会把新勾选的角色全部漏掉。
     *
     * <p>ruleId 为空时按「全部在途项目」估算，与页面上未选规则时的默认范围一致。
     */
    public ReceiverPreview previewReceivers(Long ruleId) {
        Config cfg = loadConfig();
        List<Long> projectIds = List.of();
        String iterationCode = null;
        if (ruleId != null) {
            Rule rule = listRules().stream().filter(r -> Objects.equals(r.getId(), ruleId)).findFirst()
                    .orElseThrow(() -> new BusinessException(404, "推送規則不存在"));
            projectIds = rule.getProjectIds() == null ? List.of() : rule.getProjectIds();
            iterationCode = rule.getIterationCode();
        }
        // 预览取「晨报」档位：快照内容与档位无关，个人通知的人数与模板无关，档位只影响标题
        Snapshot snapshot = buildSnapshot(LocalDate.now(), RdmDailyReportTemplates.TYPE_MORNING,
                projectIds, iterationCode);
        Map<Long, Receiver> byReceiver = resolveReceivers(snapshot, cfg);

        ReceiverPreview out = new ReceiverPreview();
        out.setTotal(byReceiver.size());
        if (byReceiver.isEmpty()) {
            return out;
        }
        // 批量取员工：逐个 selectById 在这里就是 N+1，收件人一多预览会明显卡顿
        Map<Long, SysUser> users = new HashMap<>();
        userMapper.selectBatchIds(byReceiver.keySet()).forEach(u -> users.put(u.getId(), u));

        int unbound = 0;
        int extraCount = 0;
        List<ReceiverPreviewItem> items = new ArrayList<>();
        for (Map.Entry<Long, Receiver> entry : byReceiver.entrySet()) {
            Receiver receiver = entry.getValue();
            SysUser user = users.get(entry.getKey());
            ReceiverPreviewItem item = new ReceiverPreviewItem();
            item.setUserId(entry.getKey());
            item.setUserName(user == null ? null : user.getName());
            item.setEmpId(user == null ? null : user.getEmpId());
            item.setSources(new ArrayList<>(receiver.getSources()));
            item.setProjectCount(receiver.getProjects().size());
            boolean bound = user != null && StringUtils.hasText(user.getDingtalkUserId());
            item.setDingtalkBound(bound);
            if (!bound) {
                unbound++;
            }
            if (receiver.getSources().contains("extra")) {
                extraCount++;
            }
            items.add(item);
        }
        out.setUnbound(unbound);
        out.setExtraCount(extraCount);
        out.setReceivers(items);
        return out;
    }

    /* ---------- 收件人配置的校验与序列化 ---------- */

    /** 角色白名单校验：非法值直接拒绝，不做“静默丢弃”——否则管理员以为生效了 */
    private List<String> normalizeReceiverRoles(List<String> roles) {
        List<String> out = new ArrayList<>();
        if (roles == null) {
            return out;
        }
        for (String role : roles) {
            if (!StringUtils.hasText(role)) {
                continue;
            }
            String code = role.trim();
            if (!RECEIVER_ROLES.contains(code)) {
                throw new BusinessException("不支持的收件角色: " + code);
            }
            if (!out.contains(code)) {
                out.add(code);
            }
        }
        return out;
    }

    /**
     * 名单校验：上限、去重、员工存在性。
     * <p>存在性用一次 IN 查询；占位符按数量拼（值仍走参数绑定，不存在注入面）。
     */
    private List<Long> normalizeReceiverUserIds(List<Long> ids, String label) {
        if (ids == null) {
            return new ArrayList<>();
        }
        if (ids.size() > MAX_RECEIVER_USER_IDS) {
            throw new BusinessException(label + "最多支持 " + MAX_RECEIVER_USER_IDS + " 人");
        }
        List<Long> out = new ArrayList<>();
        for (Long id : ids) {
            if (id != null && id > 0 && !out.contains(id)) {
                out.add(id);
            }
        }
        if (out.isEmpty()) {
            return out;
        }
        String placeholders = String.join(",", Collections.nCopies(out.size(), "?"));
        List<Long> found = jdbc.queryForList(
                "SELECT id FROM sys_user WHERE status = 1 AND id IN (" + placeholders + ")",
                Long.class, out.toArray());
        if (found.size() != out.size()) {
            throw new BusinessException(label + "包含不存在或已停用的员工，請重新選擇");
        }
        return out;
    }

    private static List<String> safeStringList(List<String> values) {
        return values == null ? new ArrayList<>() : new ArrayList<>(values);
    }

    private static List<Long> safeLongList(List<Long> values) {
        return values == null ? new ArrayList<>() : new ArrayList<>(values);
    }

    /**
     * 读收件角色列：列缺失/为 NULL/坏 JSON 一律回落到默认角色（pm + product_owner），
     * 但 {@code []} 原样返回——那是管理员「只要追加收件人」的主动选择，不能被默认值覆盖。
     */
    private List<String> readReceiverRoles(String json) {
        if (!StringUtils.hasText(json)) {
            return new ArrayList<>(DEFAULT_RECEIVER_ROLES);
        }
        try {
            String[] values = objectMapper.readValue(json, String[].class);
            if (values == null) {
                return new ArrayList<>(DEFAULT_RECEIVER_ROLES);
            }
            List<String> out = new ArrayList<>();
            for (String value : values) {
                if (StringUtils.hasText(value) && RECEIVER_ROLES.contains(value) && !out.contains(value)) {
                    out.add(value);
                }
            }
            return out;
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            log.warn("日报收件角色解析失败，按默认角色处理: {}", e.getClass().getSimpleName());
            return new ArrayList<>(DEFAULT_RECEIVER_ROLES);
        }
    }

    /** 读 userId 名单列：坏数据不让整份配置不可读，丢弃非法值后按空处理 */
    private List<Long> readLongList(String json) {
        if (!StringUtils.hasText(json)) {
            return new ArrayList<>();
        }
        try {
            Long[] values = objectMapper.readValue(json, Long[].class);
            if (values == null) {
                return new ArrayList<>();
            }
            List<Long> out = new ArrayList<>();
            for (Long value : values) {
                if (value != null && value > 0 && !out.contains(value)) {
                    out.add(value);
                }
            }
            return out;
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            log.warn("日报收件人名单解析失败，按空处理: {}", e.getClass().getSimpleName());
            return new ArrayList<>();
        }
    }

    private String writeStringList(List<String> values) {
        try {
            return objectMapper.writeValueAsString(values == null ? List.of() : values);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new BusinessException("收件角色序列化失敗: " + e.getClass().getSimpleName());
        }
    }

    private String writeLongList(List<Long> values) {
        try {
            return objectMapper.writeValueAsString(values == null ? List.of() : values);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new BusinessException("收件人名单序列化失敗: " + e.getClass().getSimpleName());
        }
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
                // 范围取快照上「解析后的值」而非入参：迭代后来补挂了项目时，记录行也要反映真实归属
                snapshot.getReportDate(), snapshot.getReportType(), scopeKey, target.ruleId(),
                snapshot.getScopeProjectId(), snapshot.getScopeIterationCode(),
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
     * <p>同一日期同一档位可能有多条快照（多规则各自推送、或手动补发不同范围），
     * 所以必须按 {@code projectId} / {@code iterationCode} 收敛；都未带时取最新一条
     * （{@code ORDER BY id DESC}），否则 {@code LIMIT 1} 会稳定命中最早那条，导致通知链接打开别的范围的日报。
     */
    public Snapshot getSnapshot(LocalDate date, String reportType, Long projectId, String iterationCode) {
        return getSnapshot(date, reportType, projectId, iterationCode, null);
    }

    /**
     * 读快照（可选范围键）。
     *
     * <p>{@code scopeKey} 非空时按范围键精确读取：多项目/全部项目快照的 {@code project_id} 为空，
     * 只按项目/迭代收敛会打开同档位另一范围的日报。历史链接不带该参数，走原收敛逻辑。
     */
    public Snapshot getSnapshot(LocalDate date, String reportType, Long projectId, String iterationCode,
                                String scopeKey) {
        if (StringUtils.hasText(scopeKey)) {
            return getSnapshotByScopeKey(date, reportType, scopeKey.trim());
        }
        String type = normalizeReadableType(reportType);
        StringBuilder sql = new StringBuilder("SELECT content_json FROM rdm_daily_report "
                + "WHERE report_date = ? AND report_type = ? AND deleted = 0");
        List<Object> args = new ArrayList<>();
        args.add(date.format(DATE_FMT));
        args.add(type);
        if (projectId != null) {
            sql.append(" AND project_id = ?");
            args.add(projectId);
        }
        // 未挂项目的迭代规则只有 iteration_code 可收敛：不带它就会打开同档位其他规则的快照
        if (StringUtils.hasText(iterationCode)) {
            sql.append(" AND iteration_code = ?");
            args.add(iterationCode.trim());
        }
        sql.append(" ORDER BY id DESC LIMIT 1");
        List<String> rows = jdbc.queryForList(sql.toString(), String.class, args.toArray());
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

    /** 按范围键精确读快照（多项目/全部项目链接；同一天多规则不会串范围） */
    private Snapshot getSnapshotByScopeKey(LocalDate date, String reportType, String scopeKey) {
        List<String> rows = jdbc.queryForList("SELECT content_json FROM rdm_daily_report "
                        + "WHERE report_date = ? AND report_type = ? AND scope_key = ? AND deleted = 0 "
                        + "ORDER BY id DESC LIMIT 1",
                String.class, date.format(DATE_FMT), normalizeReadableType(reportType), scopeKey);
        if (rows.isEmpty() || !StringUtils.hasText(rows.get(0))) {
            return null;
        }
        try {
            return objectMapper.readValue(rows.get(0), Snapshot.class);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            log.error("日报快照反序列化失败: date={}, type={}, scopeKey={}, error={}",
                    date, reportType, scopeKey, e.getClass().getSimpleName());
            return null;
        }
    }

    /** 发送记录（配置页「發送記錄」tab），按日期倒序 */
    public List<ReportRecord> listRecords(Integer limit) {
        int n = limit == null || limit <= 0 || limit > 365 ? DEFAULT_RECORD_LIMIT : limit;
        Map<Long, String> projectLabels = projectLabels();
        return jdbc.query("SELECT d.id, d.report_date, d.report_type, d.rule_id, d.scope_key, d.project_id, d.iteration_code, "
                        + "d.project_count, d.personal_count, d.push_count, d.trigger_type, d.trigger_by, "
                        + "d.last_push_at, d.created_at, d.updated_at, "
                        + "r.name AS rule_name, r.project_ids AS rule_project_ids, p.project_no, p.name AS project_name "
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
                    r.setScopeLabel(recordScopeLabel(rs.getString("scope_key"), rs.getString("rule_project_ids"),
                            r.getProjectId(), r.getProjectNo(), r.getProjectName(), r.getIterationCode(), projectLabels));
                    // 范围键一并下发：多项目/全部项目没有单一项目，记录页「查看日報」必须靠它精确命中
                    r.setScopeKey(rs.getString("scope_key"));
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

    /** 项目 id → 「编号 名称」 */
    private Map<Long, String> projectLabels() {
        Map<Long, String> labels = new HashMap<>();
        for (Map<String, Object> row : jdbc.queryForList("SELECT id, project_no, name FROM rdm_project")) {
            Long id = toLong(row.get("id"));
            if (id != null) {
                labels.put(id, (StringUtils.hasText((String) row.get("project_no"))
                        ? row.get("project_no") + " " : "") + (row.get("name") == null ? "" : row.get("name")));
            }
        }
        return labels;
    }

    /** 发送记录的范围文案：规则多项目 / 手动多项目 / 全部项目 / 未挂项目迭代 */
    private String recordScopeLabel(String scopeKey, String ruleProjectIdsJson, Long projectId,
                                    String projectNo, String projectName, String iterationCode,
                                    Map<Long, String> projectLabels) {
        List<Long> ids = parseProjectIds(ruleProjectIdsJson);
        if (ids.isEmpty() && scopeKey != null && scopeKey.startsWith("manual:ids:")) {
            ids = java.util.Arrays.stream(scopeKey.substring("manual:ids:".length()).split(","))
                    .filter(StringUtils::hasText)
                    .map(s -> {
                        try {
                            return Long.parseLong(s.trim());
                        } catch (NumberFormatException e) {
                            return null;
                        }
                    }).filter(java.util.Objects::nonNull).toList();
        }
        if (!ids.isEmpty()) {
            return ids.stream().map(id -> projectLabels.getOrDefault(id, "項目#" + id))
                    .collect(java.util.stream.Collectors.joining("、"));
        }
        if (projectId != null) {
            return (StringUtils.hasText(projectNo) ? projectNo + " " : "") + (projectName == null ? "" : projectName);
        }
        if (StringUtils.hasText(iterationCode)) {
            return "未掛項目 / 迭代 " + iterationCode;
        }
        return "全部在途項目";
    }

    /* ==================== 内置版式（系统内置、不可编辑） ==================== */

    /** 内置版式类型：与模板配置页的三张内置卡片一一对应 */
    private static final Set<String> BUILTIN_LAYOUT_TYPES = Set.of("group_morning", "group_evening", "personal");

    /**
     * 内置版式示例：固定示例数据 + 固定框架渲染器，不读库、不读快照、不受当前消息模式影响。
     *
     * <p><b>为何不合并到 preview</b>：preview 按配置的 {@code messageMode} 分叉，
     * 用户选了自定义模板后看到的就不是内置版式；这里的答案必须恒定是内置版式的样子。
     * 示例数据也固定不读库——真实库可能全空，示例要能稳定展示「有异常的日子」的完整形态。
     */
    public BuiltinLayout builtinLayout(String type) {
        String layout = StringUtils.hasText(type) ? type.trim() : "group_morning";
        if (!BUILTIN_LAYOUT_TYPES.contains(layout)) {
            throw new BusinessException("內置版式類型不合法（只接受 group_morning / group_evening / personal）: " + type);
        }
        boolean evening = "group_evening".equals(layout);
        Snapshot demo = demoSnapshot(evening);
        Rendered rendered = "personal".equals(layout)
                ? renderer.renderPersonalFixed(demo, "", evening, demoPersonalView(demo), new MessageFieldOptions())
                : renderer.renderGroupFixed(demo, "", evening, new MessageFieldOptions());
        return new BuiltinLayout(layout, rendered.title(), rendered.content(), MESSAGE_MODE_FIXED);
    }

    /**
     * 内置版式的示例快照：一个风险项目 + 一个正常项目，迭代直接嵌在项目节点下。
     * <p>日期取今天，保证「今日到期」角标与相对时间在示例里真实可见。
     * <p>新版式正文是「项目 → 迭代进度」两级清单，示例数据必须把迭代嵌进项目，
     * 否则预览只会看到项目行、看不到迭代进度行，版式确认就失去意义。
     */
    private Snapshot demoSnapshot(boolean evening) {
        LocalDate day = LocalDate.now();
        Snapshot s = new Snapshot();
        s.setReportDate(day.format(DATE_FMT));
        s.setReportType(evening ? RdmDailyReportTemplates.TYPE_EVENING : RdmDailyReportTemplates.TYPE_MORNING);
        s.setReportTypeLabel(evening ? "晚報" : "晨報");
        Summary sum = new Summary();
        sum.setProjectCount(8);
        sum.setRiskProjectCount(1);
        sum.setNormalProjectCount(7);
        sum.setIterationActiveCount(6);
        sum.setTodayDueItemCount(1);
        sum.setOverdueItemCount(2);
        sum.setTomorrowDueItemCount(3);
        sum.setTodayDoneItemCount(5);
        sum.setTodayReleasedCount(2);
        s.setSummary(sum);

        ProjectNode attention = new ProjectNode();
        attention.setProjectId(-1L);
        attention.setProjectName("推廣金重構");
        attention.setProductOwnerUserName("李四");
        attention.setDeliveryItemTotal(10);
        attention.setDeliveryItemCompleted(3);
        attention.setDeliveryItemOverdue(2);
        attention.setDeliveryItemBlocked(1);
        attention.setRemainingCount(7);
        attention.setIterationActiveCount(2);
        attention.setRiskFlag(1);
        attention.setAttention(true);
        attention.setNextDeliveryDate(day.format(DATE_FMT));

        ProjectNode normal = new ProjectNode();
        normal.setProjectId(-2L);
        normal.setProjectName("內部工具");
        normal.setDeliveryItemTotal(4);
        normal.setDeliveryItemCompleted(4);
        normal.setAttention(false);

        IterationNode issue = new IterationNode();
        issue.setIterationId(-1L);
        issue.setCode("SP2026-DLV");
        issue.setName("迭代-交付鏈路");
        issue.setStatus("active");
        issue.setProgressPercent(50);
        issue.setRequirementCount(3);
        issue.setOverdueReqCount(1);
        issue.setOwnerName("馮松");

        IterationNode cleanIt = new IterationNode();
        cleanIt.setIterationId(-2L);
        cleanIt.setCode("SP202610001");
        cleanIt.setName("11月第一版迭代");
        cleanIt.setStatus("planning");
        cleanIt.setProgressPercent(30);
        cleanIt.setOwnerName("王五");

        IterationNode internalIt = new IterationNode();
        internalIt.setIterationId(-3L);
        internalIt.setCode("SP2026-INT");
        internalIt.setName("內部工具效率迭代");
        internalIt.setStatus("active");
        internalIt.setProgressPercent(100);
        internalIt.setOwnerName("趙六");

        attention.setIterations(new ArrayList<>(List.of(issue, cleanIt)));
        normal.setIterations(new ArrayList<>(List.of(internalIt)));
        normal.setIterationActiveCount(1);

        s.setProjects(new ArrayList<>(List.of(attention, normal)));
        // 迭代都已挂到项目下：不再造未挂项目迭代分组，预览只展示规则定义的两级清单
        s.setUnassignedIterations(new ArrayList<>());
        return s;
    }

    /** 个人版式的示例视角：1 项逾期 + 2 项今日到期，用于展示「要处理几件事」的结论 */
    private PersonalView demoPersonalView(Snapshot demo) {
        return new PersonalView("", demo.getProjects(), 3, 1, 2, 6, 2, 4, 1);
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

        boolean fixed = isFixedMode(cfg);
        String titleTpl = "";
        String contentTpl = "";
        if (!fixed) {
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
        }

        PreviewResult out = new PreviewResult();
        out.setReportDate(day.format(DATE_FMT));
        out.setReportType(type);
        // 告知前端当前预览走的是哪条路径：固定框架下草稿文本框不生效，页面必须说明而不是让人自猜
        out.setMessageMode(fixed ? MESSAGE_MODE_FIXED : MESSAGE_MODE_TEMPLATE);
        // 链接只算一次：模板里的 {{detailUrl}} 与预览页「打开链接看板」必须是同一个地址，
        // 否则用户复制去核对时会发现两处不一致
        String detailUrl = buildViewUrl(baseUrl, day, type, null, null, cfg.getBoardLinkValidDays());
        out.setDetailUrl(detailUrl);
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
            PersonalView personal = buildPersonalView(user == null ? "預覽使用者" : user.getName(), mine);
            r = fixed
                    ? renderer.renderPersonalFixed(snapshot, detailUrl,
                            RdmDailyReportTemplates.TYPE_EVENING.equals(type), personal, cfg.getMessageFields())
                    : renderer.renderPersonal(titleTpl, contentTpl, snapshot, detailUrl, personal);
        } else {
            r = fixed
                    ? renderer.renderGroupFixed(snapshot, detailUrl,
                            RdmDailyReportTemplates.TYPE_EVENING.equals(type), cfg.getMessageFields())
                    : renderer.renderGroup(titleTpl, contentTpl, snapshot, detailUrl);
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
     * 拼看板开放链接（免登，钉钉里点开直接看板，不先进系统）。
     *
     * <p><b>为何不再拼站内 {@code /rdm-daily}</b>：那条路由受登录与菜单守卫保护，
     * 未登录会先跳登录，登录后侧栏选中「推送配置」，读者看到的不是日报——
     * 推送链接必须自带只读通行证，才能做到「点开即看」。
     *
     * <p>令牌绑定快照范围（日期/档位/项目/迭代）与有效期；{@code validDays} 来自推送配置，
     * 每次发链接时快照定死，之后改配置只影响新链接（校验侧另用当前天数二次约束，见 publicView）。
     */
    private String buildViewUrl(String baseUrl, LocalDate day, String type, Long projectId, String iterationCode,
                                Integer validDays) {
        return buildViewUrl(baseUrl, day, type, projectId, iterationCode, null, validDays);
    }

    private String buildViewUrl(String baseUrl, LocalDate day, String type, Long projectId, String iterationCode,
                                String scopeKey, Integer validDays) {
        int days = configuredBoardDays(validDays);
        long issuedAt = System.currentTimeMillis();
        long expireAt = issuedAt + days * 24L * 60L * 60L * 1000L;
        String token = RdmDailyReportViewTokenUtil.generate(day, type, projectId,
                StringUtils.hasText(iterationCode) ? iterationCode.trim() : null, issuedAt, expireAt, scopeKey, viewSecret());
        return (baseUrl == null ? "" : baseUrl) + PUBLIC_VIEW_PATH + "?token=" + token;
    }

    /**
     * 看板开放页取数（无登录态）。
     *
     * <p>三道校验缺一不可：
     * <ol>
     *   <li><b>渠道隔离密钥验签</b>：防伪造/篡改范围；</li>
     *   <li><b>有效期双约束</b>：{@code now <= expireAt} 且 {@code now <= issuedAt + 当前配置天数}——
     *       后者让「把有效期改小」能立即约束已发出的旧链接，而不必等它们自然到期；</li>
     *   <li><b>快照仍要查库</b>：令牌只证明「哪份快照、在什么时间前」，快照被清理或从未生成时
     *       一律返回不可用，绝不凭空渲染。</li>
     * </ol>
     * <p>所有失败原因统一一句提示：区分「签名错/过期/不存在」等于允许用错误响应枚举有效令牌。
     */
    public PublicView publicView(String token) {
        PublicView view = new PublicView();
        // 公开接口只读：不能走 loadConfig()（缺行时会补插），缺行直接用内存默认值
        Config cfg = loadConfigForPublic();
        int validDays = configuredBoardDays(cfg.getBoardLinkValidDays());
        view.setShowRequirements(!Boolean.FALSE.equals(cfg.getBoardShowRequirements()));
        view.setShowOwners(!Boolean.FALSE.equals(cfg.getBoardShowOwners()));
        view.setShowUnassigned(!Boolean.FALSE.equals(cfg.getBoardShowUnassigned()));

        RdmDailyReportViewTokenUtil.Token parsed = RdmDailyReportViewTokenUtil.parse(token, viewSecret());
        long now = System.currentTimeMillis();
        if (parsed == null) {
            view.setMessage("連結無效或已失效");
            return view;
        }
        // 第二个上界故意用「签发时 + 当前配置天数」而不是 token 自带的 expireAt：
        // 管理员把有效期从 30 天改为 7 天后，已发出的旧链接也应在一周后失效。
        long currentLimit = parsed.issuedAt() + validDays * 24L * 60L * 60L * 1000L;
        long effectiveExpire = Math.min(parsed.expireAt(), currentLimit);
        view.setExpireAt(formatDateTime(new java.sql.Timestamp(effectiveExpire)));
        if (now > effectiveExpire) {
            view.setMessage("連結已過期，請聯繫推送人重新發送");
            return view;
        }
        Snapshot snapshot = parsed.scopeKey() != null
                ? getSnapshotByScopeKey(parsed.reportDate(), parsed.reportType(), parsed.scopeKey())
                : getSnapshot(parsed.reportDate(), parsed.reportType(),
                        parsed.projectId(), parsed.iterationCode());
        if (snapshot == null) {
            view.setMessage("該日期的日報尚未生成或已清理");
            return view;
        }
        view.setValid(true);
        view.setSnapshot(trimForPublic(snapshot, view.isShowRequirements(), view.isShowOwners(),
                view.isShowUnassigned()));
        return view;
    }

    /**
     * 看板实时预览：按当前数据现算一份快照视图，不发送、不落库。
     *
     * <p>与 {@link #publicView(String)} 的差异只在数据来源：公开链接读已落库快照，
     * 手动触发在推送前还没有快照，必须现算；展示参数仍取全局配置，裁剪规则完全一致，
     * 保证弹窗里看到的层级/字段与真正推出去后点开的看板一致。
     */
    public PublicView boardPreview(String type, Long projectId, String iterationCode) {
        return boardPreview(type, projectId == null ? List.of() : List.of(projectId), iterationCode);
    }

    public PublicView boardPreview(String type, List<Long> projectIds, String iterationCode) {
        PublicView view = new PublicView();
        // 预览是登录态管理动作，但仍用只读配置：缺行时不补插，避免看一次预览改库
        Config cfg = loadConfigForPublic();
        view.setShowRequirements(!Boolean.FALSE.equals(cfg.getBoardShowRequirements()));
        view.setShowOwners(!Boolean.FALSE.equals(cfg.getBoardShowOwners()));
        view.setShowUnassigned(!Boolean.FALSE.equals(cfg.getBoardShowUnassigned()));
        Snapshot snapshot = buildSnapshot(LocalDate.now(), normalizeReportType(type), projectIds, iterationCode);
        view.setValid(true);
        view.setSnapshot(trimForPublic(snapshot, view.isShowRequirements(), view.isShowOwners(),
                view.isShowUnassigned()));
        view.setMessage("即時預覽");
        return view;
    }

    /**
     * 按展示参数裁剪快照：<b>只动内容，不动样式</b>。
     *
     * <p>无论开关如何，{@code detailUrl} 一律置空——详情页需要登录，开放页给站内链接
     * 等于让读者点回去又碰一次登录墙，与「点开即看」的目标相反。
     */
    private Snapshot trimForPublic(Snapshot snapshot, boolean showRequirements, boolean showOwners,
                                   boolean showUnassigned) {
        for (ProjectNode p : snapshot.getProjects()) {
            p.setDetailUrl(null);
            // 内部用户 ID 对开放页没有展示价值：只保留姓名，最小化暴露面
            p.setPmUserId(null);
            p.setProductOwnerUserId(null);
            // 收件人可配后新增的四类角色 userId 同理，开放页一律不返回
            p.setTechLeadUserId(null);
            p.setQaLeadUserId(null);
            p.setUiDesignerUserId(null);
            p.setOpsLeadUserId(null);
            if (!showOwners) {
                p.setPmUserName(null);
                p.setProductOwnerUserName(null);
                p.setTechLeadUserName(null);
                p.setQaLeadUserName(null);
                p.setUiDesignerUserName(null);
                p.setOpsLeadUserName(null);
            }
            trimIterations(p.getIterations(), showRequirements, showOwners);
            if (showRequirements) {
                for (RequirementNode r : p.getUnscheduledRequirements()) {
                    r.setDetailUrl(null);
                    if (!showOwners) {
                        r.setAssigneePmName(null);
                        if (r.getTasks() != null) {
                            r.getTasks().forEach(t -> t.setOwnerName(null));
                        }
                    }
                }
            } else {
                p.setUnscheduledRequirements(new ArrayList<>());
            }
        }
        if (showUnassigned) {
            trimIterations(snapshot.getUnassignedIterations(), showRequirements, showOwners);
        } else {
            snapshot.setUnassignedIterations(new ArrayList<>());
        }
        if (showUnassigned && showRequirements) {
            for (RequirementNode r : snapshot.getUnassignedRequirements()) {
                r.setDetailUrl(null);
                if (!showOwners) {
                    r.setAssigneePmName(null);
                    if (r.getTasks() != null) {
                        r.getTasks().forEach(t -> {
                            t.setOwnerName(null);
                            t.setOwnerEmpNo(null);
                        });
                    }
                }
            }
        } else {
            snapshot.setUnassignedRequirements(new ArrayList<>());
        }
        return snapshot;
    }

    private void trimIterations(List<IterationNode> iterations, boolean showRequirements, boolean showOwners) {
        for (IterationNode it : iterations) {
            if (!showOwners) {
                it.setOwnerName(null);
            }
            if (!showRequirements) {
                it.setRequirements(new ArrayList<>());
                continue;
            }
            for (RequirementNode r : it.getRequirements()) {
                r.setDetailUrl(null);
                if (!showOwners) {
                    r.setAssigneePmName(null);
                    if (r.getTasks() != null) {
                        r.getTasks().forEach(t -> {
                            t.setOwnerName(null);
                            t.setOwnerEmpNo(null);
                        });
                    }
                }
            }
        }
    }

    /** 公开接口专用的只读配置读取：缺行不补插，直接回默认配置，保证匿名请求不产生写操作。 */
    private Config loadConfigForPublic() {
        List<Config> rows = jdbc.query(
                "SELECT * FROM rdm_daily_report_config WHERE config_slot = ? AND deleted = 0 LIMIT 1",
                (rs, i) -> mapConfig(rs), CONFIG_SLOT);
        return rows.isEmpty() ? fallbackConfig() : rows.get(0);
    }

    /**
     * 读取侧的有效天数：库值异常（null/越界）一律收敛到合法区间，不让一个坏值把公开页打成 500。
     * <p>写入侧仍用 {@link #normalizeBoardLinkValidDays} 严格拒绝越界。
     */
    private static int configuredBoardDays(Integer configured) {
        if (configured == null) {
            return DEFAULT_BOARD_LINK_VALID_DAYS;
        }
        return Math.max(MIN_BOARD_LINK_VALID_DAYS, Math.min(MAX_BOARD_LINK_VALID_DAYS, configured));
    }

    /**
     * 校验看板链接有效期：不传沿用库中现值；越界直接拒绝（不静默改为默认值，
     * 否则管理员以为存了 120 天、实际变成 90 天）。
     */
    private static int normalizeBoardLinkValidDays(Integer requested, Integer current) {
        if (requested == null) {
            return configuredBoardDays(current);
        }
        if (requested < MIN_BOARD_LINK_VALID_DAYS || requested > MAX_BOARD_LINK_VALID_DAYS) {
            throw new BusinessException("看板連結有效期必須在 " + MIN_BOARD_LINK_VALID_DAYS
                    + "~" + MAX_BOARD_LINK_VALID_DAYS + " 天之內: " + requested);
        }
        return requested;
    }

    /** 看板令牌签名密钥（域隔离派生，不直接拿 JWT 密钥签业务链接） */
    private String viewSecret() {
        return "rdm-daily-view:" + jwtSecret;
    }

    /** 当前配置是否为固定框架模式（未识别的值一律走固定框架，宁可不发乱码也不发错格式） */
    private static boolean isFixedMode(Config cfg) {
        return !MESSAGE_MODE_TEMPLATE.equals(
                cfg == null || cfg.getMessageMode() == null ? null : cfg.getMessageMode().trim());
    }

    /**
     * 是否发钉钉卡片：固定框架 + 链接是绝对地址，两个条件缺一不可。
     *
     * <p><b>为何要卡绝对地址</b>：卡片只有一个按钮作为出口，没有正文里的链接兜底；
     * 而 {@code /#/rdm-daily-view?token=...} 这种站内相对路径在钉钉客户端点开就是空白页。
     * 此时宁可退回 markdown（至少正文里还有一句引导）。
     */
    private static boolean useCard(Config cfg, String url) {
        return isFixedMode(cfg) && StringUtils.hasText(url) && url.startsWith("http");
    }

    /** 消息模式：不传沿用现值，非法值直接拒（静默回退会让用户以为切了模式而实际没切） */
    private static String normalizeMessageMode(String requested, String current) {
        if (!StringUtils.hasText(requested)) {
            String fallback = StringUtils.hasText(current) ? current.trim() : MESSAGE_MODE_FIXED;
            return MESSAGE_MODES.contains(fallback) ? fallback : MESSAGE_MODE_FIXED;
        }
        String mode = requested.trim();
        if (!MESSAGE_MODES.contains(mode)) {
            throw new BusinessException("消息模式不合法（只接受 fixed / template）: " + requested);
        }
        return mode;
    }

    /**
     * 降噪策略归一：不传沿用现值，非法值直接拒。
     *
     * <p><b>为何非法值不静默回退</b>：服务端回退会让用户以为「已改成 skip」而实际仍是 brief，
     * 属于“配了没生效”的典型纠纷；保存时直接报错才能让人看见。
     */
    private static String normalizeQuietPolicy(String requested, String current) {
        if (!StringUtils.hasText(requested)) {
            String fallback = StringUtils.hasText(current) ? current.trim() : DEFAULT_QUIET_POLICY;
            return QUIET_POLICIES.contains(fallback) ? fallback : DEFAULT_QUIET_POLICY;
        }
        String policy = requested.trim();
        if (!QUIET_POLICIES.contains(policy)) {
            throw new BusinessException("無異常降噪策略不合法（只接受 full / brief / skip）: " + requested);
        }
        return policy;
    }

    /**
     * 群报是否「无异常日」：没有任何需要行动的事项。
     *
     * <p>口径直接取快照（与正文同源，不再算一套）：
     * 晨报看今日到期/逾期/风险；晚报看明日到期/逾期/风险——
     * 「今天完成了多少」不属异常，不能拿它把晚报从降噪里拉回来。
     *
     * <p><b>未挂项目的迭代必须单独判一次</b>：它们的逾期/今日到期需求记在迭代节点上，
     * 不在 {@code summary} 的交付项口径里。漏这一步，一个有逾期需求的迭代会被判成
     * 「无异常日」走 brief，正文一句「今日無異常」就把逾期整个藏掉了。
     */
    private static boolean isQuietGroupDay(Snapshot snapshot, boolean evening) {
        Summary s = snapshot == null || snapshot.getSummary() == null ? new Summary() : snapshot.getSummary();
        if (s.getOverdueItemCount() > 0 || s.getRiskProjectCount() > 0) {
            return false;
        }
        if (evening ? s.getTomorrowDueItemCount() > 0 : s.getTodayDueItemCount() > 0) {
            return false;
        }
        return snapshot == null || snapshot.getUnassignedIterations() == null
                || snapshot.getUnassignedIterations().stream().noneMatch(it -> it != null
                && (it.getOverdueReqCount() > 0 || it.getTodayDueReqCount() > 0));
    }

    /**
     * 个人通知是否「无异常日」：只看收件人自己的口径。
     *
     * <p>另需排除项目级关注标记（风险/阻塞），否则会出现「正文说无异常、下面却列着需关注项目」的自相矛盾。
     */
    private static boolean isQuietPersonalDay(PersonalView personal) {
        if (personal == null) {
            return false;
        }
        if (personal.overdueItemCount() > 0 || personal.todayDueItemCount() > 0) {
            return false;
        }
        return personal.projects() == null || personal.projects().stream()
                .filter(p -> p != null)
                .noneMatch(p -> p.isAttention() || p.getDeliveryItemOverdue() > 0 || p.getDeliveryItemBlocked() > 0);
    }

    /** 字段开关序列化为 JSON 列值；写入失败直接抛出，不静默存空（存空会把管理员的勾选抹掉） */
    private String writeMessageFields(MessageFieldOptions fields) {
        MessageFieldOptions value = fields == null ? new MessageFieldOptions() : fields;
        try {
            return objectMapper.writeValueAsString(value);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new BusinessException("消息字段开关序列化失败: " + e.getMessage());
        }
    }

    /**
     * 字段开关反序列化：空值或脏 JSON 一律回到默认值。
     * <p>不抛异常：配置行可能在旧版本写入时为空，读不到不应该把推送打成 500。
     */
    private MessageFieldOptions readMessageFields(String json) {
        if (!StringUtils.hasText(json)) {
            return new MessageFieldOptions();
        }
        try {
            MessageFieldOptions parsed = objectMapper.readValue(json, MessageFieldOptions.class);
            return parsed == null ? new MessageFieldOptions() : parsed;
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            log.warn("日报消息字段开关解析失败，已用默认值: {}", e.getMessage());
            return new MessageFieldOptions();
        }
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
        c.setReceiverRoles(readReceiverRoles(rs.getString("receiver_roles_json")));
        c.setExtraReceiverUserIds(readLongList(rs.getString("extra_receiver_user_ids_json")));
        c.setExcludeReceiverUserIds(readLongList(rs.getString("exclude_receiver_user_ids_json")));
        c.setMorningTemplateKey(rs.getString("morning_template_key"));
        c.setEveningTemplateKey(rs.getString("evening_template_key"));
        c.setPersonalTemplateKey(rs.getString("personal_template_key"));
        c.setBoardLinkValidDays(rs.getInt("board_link_valid_days"));
        c.setBoardShowRequirements(rs.getBoolean("board_show_requirements"));
        c.setBoardShowOwners(rs.getBoolean("board_show_owners"));
        c.setBoardShowUnassigned(rs.getBoolean("board_show_unassigned"));
        c.setMessageMode(rs.getString("message_mode"));
        c.setMessageFields(readMessageFields(rs.getString("message_field_options")));
        c.setQuietPolicy(rs.getString("quiet_policy"));
        c.setUpdatedBy(rs.getString("updated_by"));
        c.setUpdatedAt(formatDateTime(rs.getTimestamp("updated_at")));
        return c;
    }

    /** 规则行映射（LEFT JOIN 出项目编号/名称与迭代名称；规则已删项目时为 null） */
    private Rule mapRule(java.sql.ResultSet rs) throws java.sql.SQLException {
        Rule r = new Rule();
        r.setId(rs.getLong("id"));
        r.setName(rs.getString("name"));
        // 不能用 getLong：NULL 会被读成 0，前端会显示「项目#0」而不是「未掛項目」
        Long projectId = (Long) rs.getObject("project_id");
        List<Long> projectIds = parseProjectIds(rs.getString("project_ids"));
        r.setProjectIds(projectIds);
        // 单项目以 project_ids 为真值源；多项目 project_id 为 NULL，范围由 project_ids 表达
        if (projectIds.size() == 1) {
            projectId = projectIds.get(0);
        }
        r.setProjectId(projectId);
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
     * 规则范围展示：全部项目 / 多项目 / 单项目 / 未挂项目迭代。
     * <p>项目列表仍以 rdm_project 为真值源（该表无 deleted 列），一次全量查询后内存拼接，
     * 避免多项目规则逐条回查。
     */
    private void fillRuleProjectSummaries(List<Rule> rules) {
        if (rules == null || rules.isEmpty()) {
            return;
        }
        Map<Long, String> labels = new HashMap<>();
        for (Map<String, Object> row : jdbc.queryForList("SELECT id, project_no, name FROM rdm_project")) {
            Long id = toLong(row.get("id"));
            if (id == null) {
                continue;
            }
            String no = (String) row.get("project_no");
            String name = (String) row.get("name");
            labels.put(id, (StringUtils.hasText(no) ? no + " " : "") + (name == null ? "" : name));
        }
        for (Rule r : rules) {
            if (r == null) {
                continue;
            }
            List<Long> ids = r.getProjectIds() == null ? List.of() : r.getProjectIds();
            if (ids.size() > 1) {
                r.setProjectSummary(ids.stream()
                        .map(id -> labels.getOrDefault(id, "項目#" + id))
                        .collect(java.util.stream.Collectors.joining("、")));
                r.setProjectId(null);
                continue;
            }
            Long id = ids.size() == 1 ? ids.get(0) : r.getProjectId();
            if (id != null) {
                String label = labels.get(id);
                if (label != null) {
                    r.setProjectId(id);
                    r.setProjectName(label.substring(label.indexOf(' ') + 1));
                    r.setProjectNo(label.contains(" ") ? label.substring(0, label.indexOf(' ')) : null);
                    r.setProjectSummary(label);
                } else {
                    r.setProjectSummary(r.getProjectName() == null ? "項目#" + id : r.getProjectName());
                }
            } else if (StringUtils.hasText(r.getIterationCode())) {
                r.setProjectSummary("未掛項目 / 迭代 " + r.getIterationCode());
            } else {
                r.setProjectSummary("全部在途項目");
            }
        }
    }

    /** project_ids JSON → List<Long>；老数据/脏数据一律回落空列表（按单项目/全部项目兼容） */
    private List<Long> parseProjectIds(String json) {
        if (!StringUtils.hasText(json)) {
            return new ArrayList<>();
        }
        try {
            Long[] ids = objectMapper.readValue(json, Long[].class);
            return ids == null ? new ArrayList<>() : new ArrayList<>(java.util.Arrays.asList(ids));
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            log.warn("规则 project_ids 解析失败，按空范围处理: {}", e.getClass().getSimpleName());
            return new ArrayList<>();
        }
    }

    private String writeProjectIds(List<Long> ids) {
        try {
            return objectMapper.writeValueAsString(ids);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new BusinessException("項目範圍序列化失敗: " + e.getClass().getSimpleName());
        }
    }

    /**
     * 规则范围解析：迭代归属项目是唯一真值源。
     * <ul>
     *   <li>迭代挂了项目：表单未选项目则自动带出；选了不一致的项目则拒绝；</li>
     *   <li>迭代未挂项目（紧急修复）：规则只以迭代为范围，表单不得再指定项目；</li>
     *   <li>无迭代时项目必选已由 {@link #saveRule} 前置校验。</li>
     * </ul>
     * <p>包级可见的纯函数，不触库，便于直接单测四种组合。
     */
    static Long resolveRuleProjectId(Long formProjectId, Long iterationProjectId) {
        if (iterationProjectId == null) {
            if (formProjectId != null) {
                throw new BusinessException("所選迭代未掛項目，規則不能再指定所屬項目（請清空項目後保存）");
            }
            return null;
        }
        if (formProjectId == null) {
            return iterationProjectId;
        }
        if (!formProjectId.equals(iterationProjectId)) {
            throw new BusinessException("所選迭代不屬於該項目: 迭代項目#" + iterationProjectId
                    + "，表單項目#" + formProjectId);
        }
        return iterationProjectId;
    }

    private void requireProjectExists(Long projectId) {
        // 注意：rdm_project 没有逻辑删除列（Batch 1 建表即无），不能写 deleted = 0，否则真库报 Unknown column
        Integer projectExists = jdbc.queryForObject(
                "SELECT COUNT(*) FROM rdm_project WHERE id = ?", Integer.class, projectId);
        if (projectExists == null || projectExists == 0) {
            throw new BusinessException("推送目標項目不存在或已刪除: " + projectId);
        }
    }

    /** 迭代原始行（只取归属判断所需列）；不存在返回 null */
    private Map<String, Object> findIterationRow(String code) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, project_id FROM rdm_iteration WHERE code = ? AND deleted = 0 LIMIT 1", code);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /**
     * 迭代归属校验（手动触发用）：非空时必頊真实存在且属于该项目。
     * <p>为什么不信任前端传的 iterationCode：每天到点都会发出一份「项目头上挂着别人家迭代」的错数据，
     * 而且不会报错。规则保存走 {@link #resolveRuleProjectId}，它额外允许未挂项目的迭代。
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
        c.setBoardLinkValidDays(DEFAULT_BOARD_LINK_VALID_DAYS);
        c.setBoardShowRequirements(true);
        c.setBoardShowOwners(true);
        c.setBoardShowUnassigned(true);
        c.setMessageMode(MESSAGE_MODE_FIXED);
        c.setMessageFields(new MessageFieldOptions());
        c.setQuietPolicy(DEFAULT_QUIET_POLICY);
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

