package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.mapper.RdmProjectMapper;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * RDM 待办通知与<b>工作日催办</b>（任务22 B.4 / B.5）。
 *
 * <p>本服务是「谁该被通知」的唯一决策处，<b>不负责发送</b>：
 * <ul>
 *   <li>待办事实来自 {@link RdmProjectFactService#todoBoard}（与看板/卡片/导出同源，
 *       因此「通知了 3 条」与「看板上 3 条」不可能对不上）；</li>
 *   <li>出站一律走 {@link RdmNotifyService#notifyDeduped}（事务内入队 → 提交后投递 →
 *       抢占领取 → 退避重试 → dry-run 严守），既有 outbox 语义一字不改；</li>
 *   <li>逾期工作日数与「今天要不要催」一律问 {@link RdmWorkingDayCalculator}（含请假/周末支援的
 *       <b>真实工作日历</b>），不用简单周一至周五折算。</li>
 * </ul>
 *
 * <p><b>B.5 PM 待办通知</b>：待办<b>产生或变更</b>时通知责任人。去重
 * {@code event_version = VERSION:<对象并发版本>}，版本由事实行一路带来
 * （{@link RdmFactVO.Todo#getRefVersion()}）：同一版本内无论扫描多少轮都只发一次，
 * 对象被真正改动、版本推进后才会再发一次。
 *
 * <p><b>B.4 工作日催办</b>：两道闸门，缺一不可。
 * <ol>
 *   <li><b>催不催</b>：按责任人真实工作日历判定「今天是不是他的工作日」。
 *       周末、请假日、被排成支援休息的日子一律<b>不催</b>（顺延到下一个工作日）——
 *       这正是不能用「周一至周五 cron」的原因：cron 只看星期几，看不见请假与调休，
 *       会在别人休假时催办，也会在长假后第一天一次性催出一堆噪音。</li>
 *   <li><b>催几次</b>：去重 {@code event_version = DATE:<提醒日>}，因此同一对象同一接收人
 *       <b>同一提醒日只催一次</b>，次日可再催；作业被重复触发、多实例并发触发都不会重复轰炸
 *       （并发兜底是数据库唯一索引 {@code uk_rdm_notify_dedupe}，不依赖命名锁）。</li>
 * </ol>
 *
 * <p><b>视角与数据范围</b>：本服务从不使用「全量视角」。
 * 指定项目时用调用方传入的认证主体作视角；作业模式（{@code projectId == null}）下
 * 逐个在途项目<b>用该项目自己的 PM</b> 作视角取待办，因此一条消息里的内容永远只属于同一个项目，
 * 也不会把 A 项目的待办泄露给 B 项目的 PM。项目没有 PM 时跳过并记日志（fail-closed），
 * 绝不退化成「拿不到视角就看全部」。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmTodoNotifyService {

    /** {@code rdm_notify_log.object_type} 列宽（238 冻结 DDL：VARCHAR(32)） */
    private static final int OBJECT_TYPE_MAX_LENGTH = 32;

    private final RdmProjectFactService factService;
    private final RdmNotifyService notifyService;
    private final RdmWorkingDayCalculator workingDayCalculator;
    private final RdmProjectMapper projectMapper;
    private final RdmIdempotentService idempotentService;

    /**
     * 一轮通知/催办的结果计数。
     * <p>各计数<b>互斥且穷尽</b>：{@code notified + deduped + unassigned + nonWorkingDay
     * + belowThreshold + failed == scannedTodos}（催办轮次里 {@code notified} 含抄送 PM 的那一条），
     * 因此作业日志能直接核对「扫了多少、发了多少、为什么没发」，不会只剩一个总数让人猜。
     */
    @Data
    public static class TodoNotifyResult {
        /** 扫描的项目数 */
        private int scannedProjects;
        /** 扫描到的待办条数（已去重后的看板行数） */
        private int scannedTodos;
        /** 本轮新入队（真正会产生一次出站） */
        private int notified;
        /** 同键已出站过，按去重跳过 */
        private int deduped;
        /** 无责任人：无法签发去重键（{@code receiver_user_id} 必须 &gt; 0），跳过并记日志 */
        private int unassigned;
        /** 今天不是责任人的工作日（周末/请假/支援休息），不催 */
        private int nonWorkingDay;
        /** 逾期工作日未达催办门槛，不催 */
        private int belowThreshold;
        /** 出站登记失败（已按「提交后重试登记」兜底，绝不降级直发） */
        private int failed;
        /** 提醒日（催办去重的 {@code DATE:} 语义基准） */
        private String remindDay;
        /** 过程说明（如「项目无 PM，跳过」），只用于排查，不参与计数 */
        private List<String> notes = new ArrayList<>();
    }

    /* ==================== B.5 PM 待办通知 ==================== */

    /**
     * 待办产生/变更通知（按去重键通知对应接收人）。
     *
     * @param projectId    指定项目；{@code null} = 作业模式，扫描全部在途项目（逐个用该项目 PM 作视角）
     * @param viewerUserId 认证主体（指定项目时必填，为 null 时 fail-closed 直接返回空结果）
     */
    public TodoNotifyResult notifyPendingTodos(Long projectId, Long viewerUserId) {
        LocalDate today = LocalDate.now();
        TodoNotifyResult result = newResult(today);
        for (ProjectView view : resolveViews(projectId, viewerUserId, result)) {
            RdmFactVO.TodoBoard board = view.board;
            result.setScannedTodos(result.getScannedTodos() + board.getTotal());
            for (RdmFactVO.Todo todo : board.getTodos()) {
                Long receiver = todo.getResponsibleUserId();
                if (receiver == null) {
                    // 未指派的待办没有接收人：去重键要求 receiver_user_id > 0，不能伪造一个「所有人」键
                    result.setUnassigned(result.getUnassigned() + 1);
                    log.warn("待辦未指派責任人，無法按人去重通知（請先在項目中指派）: project={}, objectType={}, refId={}",
                            view.project.getId(), todo.getObjectType(), todo.getRefId());
                    continue;
                }
                String eventVersion = RdmNotifyDedupeService.versionEventVersion(todo.getRefVersion());
                boolean enqueued = notifyService.notifyDeduped(RdmConstants.EVENT_PROJECT_TODO,
                        todoObjectType(todo), todo.getRefId(), eventVersion, receiver, null,
                        todoTitle(view.project, todo), todoText(todo, false, 0));
                count(result, enqueued);
            }
        }
        log.info("RDM 待辦通知完成: projects={}, todos={}, 新入隊={}, 去重跳過={}, 未指派={}, 失敗={}",
                result.getScannedProjects(), result.getScannedTodos(), result.getNotified(),
                result.getDeduped(), result.getUnassigned(), result.getFailed());
        return result;
    }

    /* ==================== B.4 工作日催办 ==================== */

    /**
     * 工作日催办（真实工作日历 + 提醒日去重）。
     *
     * @param projectId    指定项目；{@code null} = 作业模式，扫描全部在途项目
     * @param viewerUserId 认证主体；作业模式下传 {@code null}，逐项目改用该项目 PM 作视角
     * @param remindDay    提醒日（去重 {@code DATE:} 基准）；{@code null} 取今天
     */
    public TodoNotifyResult urgeOverdueTodos(Long projectId, Long viewerUserId, LocalDate remindDay) {
        LocalDate day = remindDay == null ? LocalDate.now() : remindDay;
        TodoNotifyResult result = newResult(day);
        for (ProjectView view : resolveViews(projectId, viewerUserId, result)) {
            RdmFactVO.TodoBoard board = view.board;
            result.setScannedTodos(result.getScannedTodos() + board.getTotal());
            for (RdmFactVO.Todo todo : board.getTodos()) {
                int overdueDays = todo.getOverdueWorkingDays() == null ? 0 : todo.getOverdueWorkingDays();
                if (overdueDays < RdmConstants.URGE_MIN_OVERDUE_WORKING_DAYS) {
                    result.setBelowThreshold(result.getBelowThreshold() + 1);
                    continue;
                }
                Long receiver = todo.getResponsibleUserId();
                if (receiver == null) {
                    result.setUnassigned(result.getUnassigned() + 1);
                    log.warn("逾期待辦未指派責任人，無法催辦（請先指派，否則這件事永遠沒人推進）: project={}, refId={}",
                            view.project.getId(), todo.getRefId());
                    continue;
                }
                // 闸门一：今天必须是责任人的真实工作日（周末/请假/支援休息一律不催，顺延到下一个工作日）
                if (!isWorkingDayFor(receiver, day)) {
                    result.setNonWorkingDay(result.getNonWorkingDay() + 1);
                    log.debug("今天不是責任人工作日，不催辦: receiver={}, day={}, nextUrgeDay={}",
                            receiver, day, nextUrgeDay(receiver, day));
                    continue;
                }
                // 闸门二：提醒日去重（DATE:yyyy-MM-dd），同一对象同一接收人同一天只催一次
                String eventVersion = RdmNotifyDedupeService.dateEventVersion(day);
                boolean enqueued = notifyService.notifyDeduped(RdmConstants.EVENT_PROJECT_URGE,
                        urgeObjectType(todo), todo.getRefId(), eventVersion, receiver, null,
                        urgeTitle(view.project, todo, overdueDays), todoText(todo, true, overdueDays));
                count(result, enqueued);
                // L3（逾期达 5 个工作日）额外抄送项目 PM：同一提醒日同样只抄一次
                if (overdueDays >= RdmConstants.URGE_L3_OVERDUE_WORKING_DAYS) {
                    Long pmUserId = view.project.getPmUserId();
                    if (pmUserId != null && !pmUserId.equals(receiver)) {
                        boolean ccEnqueued = notifyService.notifyDeduped(RdmConstants.EVENT_PROJECT_URGE,
                                urgeObjectType(todo), todo.getRefId(), eventVersion, pmUserId, null,
                                urgeTitle(view.project, todo, overdueDays),
                                ccText(view.project, todo, overdueDays, receiver));
                        if (ccEnqueued) {
                            result.setNotified(result.getNotified() + 1);
                        } else {
                            result.setDeduped(result.getDeduped() + 1);
                        }
                    }
                }
            }
        }
        log.info("RDM 工作日催辦完成: day={}, projects={}, todos={}, 新入隊={}, 去重跳過={}, 非工作日={}, "
                        + "未達門檻={}, 未指派={}, 失敗={}",
                day, result.getScannedProjects(), result.getScannedTodos(), result.getNotified(),
                result.getDeduped(), result.getNonWorkingDay(), result.getBelowThreshold(),
                result.getUnassigned(), result.getFailed());
        return result;
    }

    /**
     * 手动催办某个项目（接 {@link RdmIdempotentService#executeOnce} 原子幂等）。
     *
     * <p>为什么需要幂等：手动催办是「点一下就发一片消息」的操作，前端重复点击、网络重试、
     * 双击都会触发第二次；虽然每条催办本身有提醒日去重兜底，但整轮扫描重复执行仍会白跑一遍
     * 事实计算与数据库查询。这里用 {@code (operatorUserId, rdm_project_urge, project:<id>,
     * 当日请求ID, 请求内容摘要)} 保证<b>同一操作人同一项目同一天只执行一次</b>，
     * 重复请求直接回放首次结果。
     *
     * @throws BusinessException 未取得认证主体（fail-closed，不以系统身份代发）
     */
    public TodoNotifyResult urgeProjectManually(Long projectId, Long operatorUserId) {
        if (operatorUserId == null || operatorUserId <= 0L) {
            throw new BusinessException("未取得登錄身份，無法執行催辦");
        }
        if (projectId == null || projectId <= 0L) {
            throw new BusinessException("項目ID不能為空");
        }
        LocalDate today = LocalDate.now();
        String requestHash = RdmIdempotentService.sha256Hex(
                RdmConstants.BIZ_TYPE_PROJECT_URGE + "|" + projectId + "|" + today);
        IdempotentKey key = IdempotentKey.builder()
                .userId(operatorUserId)
                .bizType(RdmConstants.BIZ_TYPE_PROJECT_URGE)
                .resourceKey("project:" + projectId)
                .clientRequestId("urge-" + projectId + "-" + today)
                .requestHash(requestHash)
                .build();
        TodoNotifyResult result = idempotentService.executeOnce(key,
                () -> urgeOverdueTodos(projectId, operatorUserId, today), TodoNotifyResult.class);
        return result == null ? newResult(today) : result;
    }

    /* ==================== 工作日历判定 ==================== */

    /**
     * 今天是不是某人的<b>真实</b>工作日（含请假/周末支援/按人例外）。
     * <p>催办的第一道闸门。用 {@code capacity > 0} 判定，因此「排了 0 小时的调休日」也算不工作日。
     */
    public boolean isWorkingDayFor(Long userId, LocalDate day) {
        if (day == null) {
            return false;
        }
        RdmWorkingDayCalculator.DayCalendar calendar = workingDayCalculator.calendarFor(userId, day, day);
        return calendar.isWorking(day);
    }

    /**
     * 下一个催办日：从 {@code day} 的次日起、按该人真实工作日历归整到的第一个工作日。
     * <p>用于「今天不催，那什么时候催」的可解释性（写进作业日志），不改变任何判定口径。
     */
    public LocalDate nextUrgeDay(Long userId, LocalDate day) {
        LocalDate base = day == null ? LocalDate.now() : day;
        RdmWorkingDayCalculator.DayCalendar calendar =
                workingDayCalculator.calendarFor(userId, base, base.plusDays(60));
        return RdmWorkingDayCalculator.nextWorking(base.plusDays(1), calendar);
    }

    /* ==================== 视角解析（fail-closed） ==================== */

    /** 一个「项目 + 该项目视角下的待办看板」组合。 */
    private static final class ProjectView {
        private final RdmProject project;
        private final RdmFactVO.TodoBoard board;

        private ProjectView(RdmProject project, RdmFactVO.TodoBoard board) {
            this.project = project;
            this.board = board;
        }
    }

    /**
     * 解析本轮要扫描的「项目 + 视角」。
     *
     * <p><b>绝不使用全量视角</b>：指定项目时用传入的认证主体（为 null 直接空结果，
     * 因为事实源对 null 身份本就 fail-closed，这里提前返回只为省一次无意义计算）；
     * 作业模式下逐项目用<b>该项目自己的 PM</b>，没有 PM 的项目跳过并记 note。
     */
    private List<ProjectView> resolveViews(Long projectId, Long viewerUserId, TodoNotifyResult result) {
        List<ProjectView> views = new ArrayList<>();
        if (projectId != null) {
            if (viewerUserId == null) {
                result.getNotes().add("未取得认证主体，fail-closed 跳过 projectId=" + projectId);
                log.warn("待辦通知未取得認證主体，按 fail-closed 跳過（不退化為全量視角）: projectId={}", projectId);
                return views;
            }
            RdmProject project = projectMapper.selectById(projectId);
            if (project == null) {
                result.getNotes().add("项目不存在或已删除 projectId=" + projectId);
                return views;
            }
            addView(views, project, viewerUserId, result);
            return views;
        }
        // 作业模式：只扫在途项目（closed 不再推进，扫它只会产生噪音）
        List<RdmProject> projects = projectMapper.selectList(new LambdaQueryWrapper<RdmProject>()
                .in(RdmProject::getStatus, RdmConstants.PROJECT_ACTIVE_STATUSES));
        for (RdmProject project : projects) {
            if (project == null || project.getId() == null) {
                continue;
            }
            Long pmUserId = project.getPmUserId();
            if (pmUserId == null) {
                result.getNotes().add("项目无 PM，跳过 projectId=" + project.getId());
                log.warn("項目未設置 PM，無法確定待辦通知視角，跳過（不退化為全量視角）: projectId={}, projectNo={}",
                        project.getId(), project.getProjectNo());
                continue;
            }
            addView(views, project, pmUserId, result);
        }
        return views;
    }

    private void addView(List<ProjectView> views, RdmProject project, Long viewerUserId, TodoNotifyResult result) {
        try {
            // 事实源内部会做资源守卫：视角看不到该项目时抛异常，这里记 note 并跳过，绝不让作业整体失败
            RdmFactVO.TodoBoard board = factService.todoBoard(project.getId(), viewerUserId);
            if (board == null || !board.isAuthenticated()) {
                result.getNotes().add("视角无权限或看板为空 projectId=" + project.getId());
                return;
            }
            views.add(new ProjectView(project, board));
            result.setScannedProjects(result.getScannedProjects() + 1);
        } catch (RuntimeException e) {
            result.getNotes().add("项目待办计算失败 projectId=" + project.getId() + ": " + e.getMessage());
            log.error("待辦通知計算失敗，跳過該項目（不影響其它項目）: projectId={}, viewer={}, error={}",
                    project.getId(), viewerUserId, e.getMessage());
        }
    }

    /* ==================== 去重对象类型与文案 ==================== */

    /**
     * 待办通知的去重对象类型：{@code project_todo:<对象类型>}。
     *
     * <p><b>为什么要把对象类型拼进去</b>：{@code object_id} 只是各表自增主键，
     * 「问题 5」与「交付项 5」是两个完全不同的对象；若统一用 {@code project_todo} 作 object_type，
     * 两者会撞出同一个去重键，其中一个的通知被另一个永久抑制。
     * <p><b>为什么不用裸对象类型</b>：同一对象上的「待办通知」与「催办」是两种事件语义，
     * 共用 object_type 会互相抑制（催过一次就再也收不到待办变更通知）。
     * 因此事件语义与对象语义<b>都</b>要进 object_type，长度受 VARCHAR(32) 约束，
     * 超限时按 fail-closed 返回 {@code null}（{@link RdmNotifyService} 会拒绝出站），绝不截断后写入。
     */
    static String todoObjectType(RdmFactVO.Todo todo) {
        return composeObjectType(RdmConstants.NOTIFY_OBJECT_PROJECT_TODO, todo);
    }

    /** 催办的去重对象类型：{@code project_urge:<对象类型>}（与待办通知互不抑制）。 */
    static String urgeObjectType(RdmFactVO.Todo todo) {
        return composeObjectType(RdmConstants.NOTIFY_OBJECT_PROJECT_URGE, todo);
    }

    private static String composeObjectType(String eventKind, RdmFactVO.Todo todo) {
        String objectKind = todo == null || !StringUtils.hasText(todo.getObjectType())
                ? "unknown" : todo.getObjectType().trim();
        String composed = eventKind + ":" + objectKind;
        if (composed.length() > OBJECT_TYPE_MAX_LENGTH) {
            // 不截断：截断会让两个不同对象类型共用一个键，等于把去重放宽成「误抑制」
            log.error("去重對象類型超出列寬，拒絕出站: length={}, value={}", composed.length(), composed);
            return null;
        }
        return composed;
    }

    private static String todoTitle(RdmProject project, RdmFactVO.Todo todo) {
        return "【待辦】" + projectLabel(project) + " " + objectLabel(todo);
    }

    private static String urgeTitle(RdmProject project, RdmFactVO.Todo todo, int overdueDays) {
        String level = overdueDays >= RdmConstants.URGE_L3_OVERDUE_WORKING_DAYS ? "【催辦·緊急】"
                : overdueDays >= RdmConstants.URGE_L2_OVERDUE_WORKING_DAYS ? "【催辦·加急】" : "【催辦】";
        return level + projectLabel(project) + " " + objectLabel(todo);
    }

    /**
     * 待办/催办正文（Markdown）。
     * <p>{@code actionUrl} 直接取事实源拼好的<b>前端已注册路由</b>（问题走问题页、交付项走交付项页），
     * 通知侧绝不自己重拼路径 —— 两处拼路径正是历史上「点开即 404」的成因。
     */
    private static String todoText(RdmFactVO.Todo todo, boolean urge, int overdueDays) {
        StringBuilder text = new StringBuilder();
        text.append(urge ? "### ⏰ 待辦已逾期，請盡快推進\n\n" : "### 📌 您有一條待辦需要處理\n\n");
        appendLine(text, "對象", objectLabel(todo));
        appendLine(text, "編號", todo.getRefNo());
        appendLine(text, "標題", todo.getTitle());
        appendLine(text, "責任人", todo.getResponsibleName());
        appendLine(text, "計劃完成", todo.getDueDate());
        appendLine(text, "成因", String.join("、", todo.getReasons() == null ? List.of() : todo.getReasons()));
        if (urge) {
            appendLine(text, "逾期工作日", overdueDays + " 個（按責任人真實工作日曆，已扣除請假與休息日）");
        } else if (todo.getOverdueWorkingDays() != null && todo.getOverdueWorkingDays() > 0) {
            appendLine(text, "逾期工作日", todo.getOverdueWorkingDays() + " 個");
        }
        if (StringUtils.hasText(todo.getActionUrl())) {
            text.append("\n[點擊處理](").append(todo.getActionUrl()).append(")");
        }
        return text.toString();
    }

    /** 抄送 PM 的正文：说清「谁的事、逾期多久、已催过谁」，不让 PM 误以为是自己要动手。 */
    private static String ccText(RdmProject project, RdmFactVO.Todo todo, int overdueDays, Long receiver) {
        StringBuilder text = new StringBuilder("### ⚠️ 項目待辦已達 L3 逾期，抄送項目經理\n\n");
        appendLine(text, "項目", projectLabel(project));
        appendLine(text, "對象", objectLabel(todo));
        appendLine(text, "編號", todo.getRefNo());
        appendLine(text, "責任人", todo.getResponsibleName() + "（userId=" + receiver + "）");
        appendLine(text, "逾期工作日", overdueDays + " 個");
        appendLine(text, "已催辦", "是（同一提醒日只催一次）");
        if (StringUtils.hasText(todo.getActionUrl())) {
            text.append("\n[查看詳情](").append(todo.getActionUrl()).append(")");
        }
        return text.toString();
    }

    private static void appendLine(StringBuilder text, String label, String value) {
        if (!StringUtils.hasText(value) || "null".equals(value)) {
            return;
        }
        text.append("- **").append(label).append("**: ").append(value).append('\n');
    }

    private static String projectLabel(RdmProject project) {
        if (project == null) {
            return "";
        }
        return StringUtils.hasText(project.getProjectNo())
                ? project.getProjectNo() + " " + nullToEmpty(project.getName())
                : nullToEmpty(project.getName());
    }

    /** 对象类型的中文标签（只影响文案，不参与任何判定） */
    private static String objectLabel(RdmFactVO.Todo todo) {
        if (todo == null || todo.getObjectType() == null) {
            return "待辦";
        }
        return switch (todo.getObjectType()) {
            case RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM -> "交付項";
            case RdmConstants.NOTIFY_OBJECT_ISSUE -> "未決問題";
            case RdmConstants.NOTIFY_OBJECT_ISSUE_DEFER -> "原範圍延期殘餘";
            case RdmConstants.NOTIFY_OBJECT_PROJECT -> "項目";
            case RdmConstants.NOTIFY_OBJECT_TEST_BATCH -> "提測批次";
            case RdmConstants.NOTIFY_OBJECT_RELEASE_BATCH -> "發布批次";
            case RdmConstants.NOTIFY_OBJECT_REQUIREMENT -> "需求";
            default -> "待辦";
        };
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static TodoNotifyResult newResult(LocalDate remindDay) {
        TodoNotifyResult result = new TodoNotifyResult();
        result.setRemindDay(remindDay == null ? null : remindDay.toString());
        return result;
    }

    /**
     * 计数：{@code notifyDeduped} 返回 false 有两种含义（同键已发过 / 登记失败或键不完整），
     * 两者都<b>不是</b>本轮新出站，但排查线索不同，因此分开记：登记失败已由
     * {@link RdmNotifyService} 记 error 日志并安排提交后重试，这里只累加去重计数。
     */
    private static void count(TodoNotifyResult result, boolean enqueued) {
        if (enqueued) {
            result.setNotified(result.getNotified() + 1);
        } else {
            result.setDeduped(result.getDeduped() + 1);
        }
    }
}
