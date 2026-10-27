package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.RdmWorkCalendar;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmWorkCalendarMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;

/**
 * 任务22 B.4 / B.5 / B.7 —— <b>PM 待办通知</b>与<b>工作日催办</b>测试。
 *
 * <p>锁死七条结论：
 * <ol>
 *   <li><b>待办通知按对象版本去重</b>：{@code event_version = VERSION:<refVersion>}，
 *       版本由事实行一路带来，同一版本内扫描多少轮都只发一次；</li>
 *   <li><b>催办按提醒日去重</b>：{@code event_version = DATE:<yyyy-MM-dd>}，同一天只催一次，次日可再催；</li>
 *   <li><b>催办走真实工作日历</b>：请假日不催、周末不催、<b>周末支援（排了加班工时）要催</b>——
 *       第三条正是「不能用周一至周五 cron」的证据：cron 只看星期几，看不见请假与调休；</li>
 *   <li><b>去重对象类型是复合的</b>：{@code project_todo:<对象类型>} / {@code project_urge:<对象类型>}，
 *       因此「问题5」与「交付项5」不撞键、「待办通知」与「催办」互不抑制；超列宽返回 null（fail-closed 不截断）；</li>
 *   <li><b>视角 fail-closed</b>：拿不到认证主体、项目没有 PM、看板未认证时一律跳过并记 note，
 *       <b>绝不退化成全量视角</b>；单项目计算失败不影响其它项目；</li>
 *   <li><b>计数互斥且穷尽</b>：{@code notified + deduped + unassigned + nonWorkingDay + belowThreshold
 *       == scannedTodos}，作业日志能直接核对「扫了多少、发了多少、为什么没发」；</li>
 *   <li><b>手动催办接 executeOnce</b>：同一操作人同一项目同一天只执行一次，且缺身份直接拒绝。</li>
 * </ol>
 *
 * <p>工作日历用<b>真实的 {@link RdmWorkingDayCalculator}</b>（只 mock 其 mapper），
 * 因此「请假/周末支援如何影响催办日」是被真实算法验证的，不是被 mock 出来的结论。
 *
 * <p><b>纯 Mockito 离线单测，不连库、不跑迁移。</b>mock 只证明本服务的决策逻辑，
 * <b>不等价于真实数据库下的并发去重证明</b>（多实例同时催办的兜底是
 * {@code uk_rdm_notify_dedupe} 唯一索引，归属任务24）。
 */
class RdmTodoNotifyServiceTest {

    private static final long PROJECT_ID = 300L;
    private static final long PM = 51L;
    private static final long OWNER = 41L;
    private static final LocalDate MON = LocalDate.of(2026, 1, 5);
    private static final LocalDate WED = LocalDate.of(2026, 1, 7);
    private static final LocalDate SAT = LocalDate.of(2026, 1, 10);
    private static final LocalDate SUN = LocalDate.of(2026, 1, 11);

    private RdmProjectFactService factService;
    private RdmNotifyService notifyService;
    private RdmProjectMapper projectMapper;
    private RdmWorkCalendarMapper calendarMapper;
    private RdmIdempotentService idempotentService;
    private RdmTodoNotifyService service;

    /** LambdaQueryWrapper 解析「方法引用 → 列名」依赖 TableInfo 缓存，无容器时按仓库既有做法手动初始化 */
    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, RdmProject.class);
        TableInfoHelper.initTableInfo(assistant, RdmWorkCalendar.class);
    }

    @BeforeEach
    void setUp() {
        factService = mock(RdmProjectFactService.class);
        notifyService = mock(RdmNotifyService.class);
        projectMapper = mock(RdmProjectMapper.class);
        calendarMapper = mock(RdmWorkCalendarMapper.class);
        idempotentService = mock(RdmIdempotentService.class);
        doReturn(new ArrayList<RdmWorkCalendar>()).when(calendarMapper).selectList(any());
        // 默认「本次是新入队」：本测试关注的是「该不该通知谁」，去重与否由 RdmNotifyServiceTest 负责
        doReturn(true).when(notifyService).notifyDeduped(anyString(), anyString(), anyLong(), anyString(),
                anyLong(), any(), anyString(), anyString());
        // 真实工作日历：请假/周末支援的判定必须由真算法给出，mock 掉等于自证
        service = new RdmTodoNotifyService(factService, notifyService,
                new RdmWorkingDayCalculator(calendarMapper), projectMapper, idempotentService);
    }

    /* ==================== 测试夹具 ==================== */

    private RdmProject project(Long id, Long pmUserId) {
        RdmProject project = new RdmProject();
        project.setId(id);
        project.setProjectNo("P-" + id);
        project.setName("測試項目");
        project.setPmUserId(pmUserId);
        project.setStatus(RdmConstants.PROJECT_IN_PROGRESS);
        return project;
    }

    private RdmFactVO.Todo todo(String objectType, long refId, Long responsible, Integer overdueDays,
                               Integer refVersion) {
        RdmFactVO.Todo todo = new RdmFactVO.Todo();
        todo.setKey(objectType + ":" + refId);
        todo.setObjectType(objectType);
        todo.setRefId(refId);
        todo.setRefNo("REF-" + refId);
        todo.setTitle("待辦標題");
        todo.setProjectId(PROJECT_ID);
        todo.setResponsibleUserId(responsible);
        todo.setResponsibleName(responsible == null ? null : "用戶" + responsible);
        todo.setBucket(responsible == null ? RdmConstants.TODO_BUCKET_UNASSIGNED : RdmConstants.TODO_BUCKET_MINE);
        todo.setReasons(new ArrayList<>(List.of(RdmConstants.TODO_REASON_OVERDUE)));
        todo.setDueDate("2026-01-02");
        todo.setOverdue(overdueDays != null && overdueDays > 0);
        todo.setOverdueWorkingDays(overdueDays);
        todo.setRefVersion(refVersion);
        todo.setActionUrl(RdmConstants.deliveryItemRoute(refId));
        return todo;
    }

    private RdmFactVO.TodoBoard board(RdmFactVO.Todo... todos) {
        RdmFactVO.TodoBoard board = new RdmFactVO.TodoBoard();
        board.setProjectId(PROJECT_ID);
        board.setUserId(PM);
        board.setAuthenticated(true);
        board.setTodos(new ArrayList<>(List.of(todos)));
        board.setTotal(todos.length);
        return board;
    }

    private void givenProjectBoard(RdmProject project, Long viewer, RdmFactVO.TodoBoard board) {
        doReturn(project).when(projectMapper).selectById(project.getId());
        doReturn(board).when(factService).todoBoard(project.getId(), viewer);
    }

    private void calendarRow(long userId, LocalDate day, String dayType, String hours) {
        RdmWorkCalendar row = new RdmWorkCalendar();
        row.setUserId(userId);
        row.setDay(day);
        row.setDayType(dayType);
        if (hours != null) {
            row.setAvailableHours(new BigDecimal(hours));
        }
        List<RdmWorkCalendar> rows = new ArrayList<>();
        rows.add(row);
        doReturn(rows).when(calendarMapper).selectList(any());
    }

    /* ==================== B.5 PM 待办通知 ==================== */

    @Test
    @DisplayName("待办通知：按VERSION:<对象并发版本>去重，通知对应责任人（每接收人一行）")
    void pendingTodoNotifyUsesVersionSemantics() {
        RdmFactVO.Todo item = todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, OWNER, 0, 3);
        givenProjectBoard(project(PROJECT_ID, PM), PM, board(item));

        RdmTodoNotifyService.TodoNotifyResult result = service.notifyPendingTodos(PROJECT_ID, PM);

        assertEquals(1, result.getNotified());
        assertEquals(1, result.getScannedTodos());
        verify(notifyService).notifyDeduped(eq(RdmConstants.EVENT_PROJECT_TODO),
                eq("project_todo:" + RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM), eq(11L),
                eq("VERSION:3"), eq(OWNER), eq(null), anyString(), anyString());
    }

    @Test
    @DisplayName("对象并发版本缺失时退化VERSION:0（宁可少发也不重复发）")
    void pendingTodoNotifyFallsBackToVersionZero() {
        RdmFactVO.Todo item = todo(RdmConstants.NOTIFY_OBJECT_ISSUE, 12L, OWNER, 0, null);
        givenProjectBoard(project(PROJECT_ID, PM), PM, board(item));

        service.notifyPendingTodos(PROJECT_ID, PM);

        verify(notifyService).notifyDeduped(eq(RdmConstants.EVENT_PROJECT_TODO),
                eq("project_todo:" + RdmConstants.NOTIFY_OBJECT_ISSUE), eq(12L),
                eq("VERSION:0"), eq(OWNER), eq(null), anyString(), anyString());
    }

    @Test
    @DisplayName("待办无责任人→计入unassigned且不发（去重键要求receiver>0，不能伪造「所有人」键）")
    void unassignedTodoIsNotNotified() {
        givenProjectBoard(project(PROJECT_ID, PM), PM,
                board(todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, null, 0, 1)));

        RdmTodoNotifyService.TodoNotifyResult result = service.notifyPendingTodos(PROJECT_ID, PM);

        assertEquals(1, result.getUnassigned());
        assertEquals(0, result.getNotified());
        verify(notifyService, never()).notifyDeduped(any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("计数互斥且穷尽：notified+deduped+unassigned == scannedTodos（作业日志可核对）")
    void countersAreMutuallyExclusiveAndExhaustive() {
        RdmFactVO.Todo fresh = todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, OWNER, 0, 1);
        RdmFactVO.Todo seen = todo(RdmConstants.NOTIFY_OBJECT_ISSUE, 12L, 42L, 0, 1);
        RdmFactVO.Todo nobody = todo(RdmConstants.NOTIFY_OBJECT_REQUIREMENT, 13L, null, 0, 1);
        givenProjectBoard(project(PROJECT_ID, PM), PM, board(fresh, seen, nobody));
        doReturn(true).when(notifyService).notifyDeduped(anyString(), anyString(), eq(11L),
                anyString(), anyLong(), any(), anyString(), anyString());
        doReturn(false).when(notifyService).notifyDeduped(anyString(), anyString(), eq(12L),
                anyString(), anyLong(), any(), anyString(), anyString());

        RdmTodoNotifyService.TodoNotifyResult result = service.notifyPendingTodos(PROJECT_ID, PM);

        assertEquals(3, result.getScannedTodos());
        assertEquals(1, result.getNotified());
        assertEquals(1, result.getDeduped());
        assertEquals(1, result.getUnassigned());
        assertEquals(result.getScannedTodos(),
                result.getNotified() + result.getDeduped() + result.getUnassigned()
                        + result.getNonWorkingDay() + result.getBelowThreshold());
    }

    @Test
    @DisplayName("正文直接搬事实源的actionUrl（不重拼路径，两处拼路径正是「点开即404」的成因）")
    void notifyTextReusesFactSourceActionUrl() {
        RdmFactVO.Todo item = todo(RdmConstants.NOTIFY_OBJECT_ISSUE, 12L, OWNER, 0, 1);
        item.setActionUrl(RdmConstants.issueRoute(12L));
        givenProjectBoard(project(PROJECT_ID, PM), PM, board(item));

        service.notifyPendingTodos(PROJECT_ID, PM);

        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        verify(notifyService).notifyDeduped(anyString(), anyString(), anyLong(), anyString(),
                anyLong(), any(), anyString(), text.capture());
        assertTrue(text.getValue().contains(RdmConstants.issueRoute(12L)),
                "问题待办必须跳问题页，实际正文=" + text.getValue());
        assertFalse(text.getValue().contains("/rdm-delivery-item"), "问题不得套用交付项地址");
    }

    /* ==================== 视角 fail-closed ==================== */

    @Test
    @DisplayName("指定项目但拿不到认证主体→fail-closed跳过并记note，绝不退化为全量视角")
    void nullViewerIsFailClosed() {
        RdmTodoNotifyService.TodoNotifyResult result = service.notifyPendingTodos(PROJECT_ID, null);

        assertEquals(0, result.getScannedProjects());
        assertEquals(0, result.getScannedTodos());
        assertEquals(0, result.getNotified());
        assertTrue(result.getNotes().stream().anyMatch(n -> n.contains("fail-closed")),
                "必须留下可排查线索，实际=" + result.getNotes());
        verifyNoInteractions(factService, notifyService);
    }

    @Test
    @DisplayName("作业模式逐项目用该项目自己的PM作视角（不会把A项目待办说给B项目PM听）")
    void jobModeUsesEachProjectOwnPmAsViewer() {
        RdmProject a = project(1L, 61L);
        RdmProject b = project(2L, 62L);
        doReturn(List.of(a, b)).when(projectMapper).selectList(any());
        doReturn(board()).when(factService).todoBoard(1L, 61L);
        doReturn(board()).when(factService).todoBoard(2L, 62L);

        RdmTodoNotifyService.TodoNotifyResult result = service.urgeOverdueTodos(null, null, MON);

        assertEquals(2, result.getScannedProjects());
        verify(factService).todoBoard(1L, 61L);
        verify(factService).todoBoard(2L, 62L);
        verify(factService, never()).todoBoard(anyLong(), isNull());
        verify(factService, never()).todoBoard(isNull(), any());
    }

    @Test
    @DisplayName("项目没有PM→跳过并记note（无视角时不退化为全量）")
    void projectWithoutPmIsSkipped() {
        doReturn(List.of(project(1L, null), project(2L, 62L))).when(projectMapper).selectList(any());
        doReturn(board()).when(factService).todoBoard(2L, 62L);

        RdmTodoNotifyService.TodoNotifyResult result = service.urgeOverdueTodos(null, null, MON);

        assertEquals(1, result.getScannedProjects());
        assertTrue(result.getNotes().stream().anyMatch(n -> n.contains("无 PM")),
                "实际=" + result.getNotes());
        verify(factService, never()).todoBoard(eq(1L), any());
    }

    @Test
    @DisplayName("看板未认证（视角无权限）→跳过，绝不把看不到的项目待办发出去")
    void unauthenticatedBoardIsSkipped() {
        RdmFactVO.TodoBoard denied = board(todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, OWNER, 9, 1));
        denied.setAuthenticated(false);
        denied.setTotal(0);
        givenProjectBoard(project(PROJECT_ID, PM), PM, denied);

        RdmTodoNotifyService.TodoNotifyResult result = service.urgeOverdueTodos(PROJECT_ID, PM, MON);

        assertEquals(0, result.getScannedProjects());
        verifyNoInteractions(notifyService);
    }

    @Test
    @DisplayName("单项目事实计算失败不影响其它项目（作业不因一个坏项目整体失败）")
    void oneProjectFailureDoesNotBreakOthers() {
        RdmProject a = project(1L, 61L);
        RdmProject b = project(2L, 62L);
        doReturn(List.of(a, b)).when(projectMapper).selectList(any());
        doThrow(new RuntimeException("boom")).when(factService).todoBoard(1L, 61L);
        doReturn(board()).when(factService).todoBoard(2L, 62L);

        RdmTodoNotifyService.TodoNotifyResult result = service.urgeOverdueTodos(null, null, MON);

        assertEquals(1, result.getScannedProjects());
        assertTrue(result.getNotes().stream().anyMatch(n -> n.contains("boom")), "实际=" + result.getNotes());
    }

    @Test
    @DisplayName("项目不存在→记note跳过，不去算事实")
    void missingProjectIsSkipped() {
        doReturn(null).when(projectMapper).selectById(PROJECT_ID);

        RdmTodoNotifyService.TodoNotifyResult result = service.notifyPendingTodos(PROJECT_ID, PM);

        assertEquals(0, result.getScannedProjects());
        verifyNoInteractions(factService, notifyService);
    }

    /* ==================== B.4 工作日催办 ==================== */

    @Test
    @DisplayName("工作日+逾期达门槛→按DATE:<提醒日>去重催办责任人")
    void urgeOnWorkingDayUsesDateSemantics() {
        givenProjectBoard(project(PROJECT_ID, PM), PM,
                board(todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, OWNER, 2, 1)));

        RdmTodoNotifyService.TodoNotifyResult result = service.urgeOverdueTodos(PROJECT_ID, PM, WED);

        assertEquals(1, result.getNotified());
        assertEquals(WED.toString(), result.getRemindDay());
        verify(notifyService).notifyDeduped(eq(RdmConstants.EVENT_PROJECT_URGE),
                eq("project_urge:" + RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM), eq(11L),
                eq("DATE:2026-01-07"), eq(OWNER), eq(null), anyString(), anyString());
    }

    @Test
    @DisplayName("请假日不催（计入nonWorkingDay）——cron看不见请假，这正是不能用周一至五cron的原因")
    void leaveDayIsNotUrged() {
        calendarRow(OWNER, WED, RdmWorkCalendar.TYPE_LEAVE, null);
        givenProjectBoard(project(PROJECT_ID, PM), PM,
                board(todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, OWNER, 4, 1)));

        RdmTodoNotifyService.TodoNotifyResult result = service.urgeOverdueTodos(PROJECT_ID, PM, WED);

        assertEquals(1, result.getNonWorkingDay());
        assertEquals(0, result.getNotified());
        verifyNoInteractions(notifyService);
    }

    @Test
    @DisplayName("周末不催（周六/周日都计入nonWorkingDay）")
    void weekendIsNotUrged() {
        givenProjectBoard(project(PROJECT_ID, PM), PM,
                board(todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, OWNER, 4, 1)));

        assertEquals(1, service.urgeOverdueTodos(PROJECT_ID, PM, SAT).getNonWorkingDay());
        assertEquals(1, service.urgeOverdueTodos(PROJECT_ID, PM, SUN).getNonWorkingDay());
        verifyNoInteractions(notifyService);
    }

    @Test
    @DisplayName("周末支援（排了加班工时）→照常催办：简单cron会在该催的日子漏催")
    void weekendOvertimeIsUrged() {
        calendarRow(OWNER, SAT, RdmWorkCalendar.TYPE_OVERTIME, "8");
        givenProjectBoard(project(PROJECT_ID, PM), PM,
                board(todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, OWNER, 2, 1)));

        RdmTodoNotifyService.TodoNotifyResult result = service.urgeOverdueTodos(PROJECT_ID, PM, SAT);

        assertEquals(1, result.getNotified());
        assertEquals(0, result.getNonWorkingDay());
    }

    @Test
    @DisplayName("排了0小时的调休日→不算工作日，不催（capacity>0才是工作日）")
    void zeroCapacityCustomDayIsNotUrged() {
        calendarRow(OWNER, WED, RdmWorkCalendar.TYPE_CUSTOM, "0");
        givenProjectBoard(project(PROJECT_ID, PM), PM,
                board(todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, OWNER, 4, 1)));

        assertEquals(1, service.urgeOverdueTodos(PROJECT_ID, PM, WED).getNonWorkingDay());
        verifyNoInteractions(notifyService);
    }

    @Test
    @DisplayName("逾期未达门槛→计入belowThreshold且不催（刚到期就催只是噪音）")
    void belowThresholdIsNotUrged() {
        givenProjectBoard(project(PROJECT_ID, PM), PM,
                board(todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, OWNER,
                        RdmConstants.URGE_MIN_OVERDUE_WORKING_DAYS - 1, 1)));

        RdmTodoNotifyService.TodoNotifyResult result = service.urgeOverdueTodos(PROJECT_ID, PM, WED);

        assertEquals(1, result.getBelowThreshold());
        verifyNoInteractions(notifyService);
    }

    @Test
    @DisplayName("逾期天数缺失按0处理→未达门槛不催（不因null被当成巨额逾期）")
    void nullOverdueDaysIsTreatedAsZero() {
        givenProjectBoard(project(PROJECT_ID, PM), PM,
                board(todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, OWNER, null, 1)));

        assertEquals(1, service.urgeOverdueTodos(PROJECT_ID, PM, WED).getBelowThreshold());
        verifyNoInteractions(notifyService);
    }

    @Test
    @DisplayName("逾期待办无责任人→计入unassigned不催（没人可催，催了也没用）")
    void overdueWithoutResponsibleIsNotUrged() {
        givenProjectBoard(project(PROJECT_ID, PM), PM,
                board(todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, null, 9, 1)));

        RdmTodoNotifyService.TodoNotifyResult result = service.urgeOverdueTodos(PROJECT_ID, PM, WED);

        assertEquals(1, result.getUnassigned());
        verifyNoInteractions(notifyService);
    }

    @Test
    @DisplayName("L3（逾期达5个工作日）额外抄送项目PM，同一提醒日同样只抄一次")
    void l3EscalationCopiesPm() {
        givenProjectBoard(project(PROJECT_ID, PM), PM,
                board(todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, OWNER,
                        RdmConstants.URGE_L3_OVERDUE_WORKING_DAYS, 1)));
        doReturn(true).when(notifyService).notifyDeduped(anyString(), anyString(), anyLong(),
                anyString(), anyLong(), any(), anyString(), anyString());

        RdmTodoNotifyService.TodoNotifyResult result = service.urgeOverdueTodos(PROJECT_ID, PM, WED);

        assertEquals(2, result.getNotified(), "责任人一条 + 抄送 PM 一条");
        verify(notifyService).notifyDeduped(eq(RdmConstants.EVENT_PROJECT_URGE), anyString(), eq(11L),
                eq("DATE:2026-01-07"), eq(OWNER), any(), anyString(), anyString());
        verify(notifyService).notifyDeduped(eq(RdmConstants.EVENT_PROJECT_URGE), anyString(), eq(11L),
                eq("DATE:2026-01-07"), eq(PM), any(), anyString(), anyString());
    }

    @Test
    @DisplayName("L2（逾期3个工作日）只催责任人，不抄送PM")
    void l2DoesNotCopyPm() {
        givenProjectBoard(project(PROJECT_ID, PM), PM,
                board(todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, OWNER,
                        RdmConstants.URGE_L2_OVERDUE_WORKING_DAYS, 1)));

        service.urgeOverdueTodos(PROJECT_ID, PM, WED);

        verify(notifyService, times(1)).notifyDeduped(anyString(), anyString(), anyLong(),
                anyString(), anyLong(), any(), anyString(), anyString());
        verify(notifyService, never()).notifyDeduped(anyString(), anyString(), anyLong(), anyString(),
                eq(PM), any(), anyString(), anyString());
    }

    @Test
    @DisplayName("责任人本身就是PM→L3也只发一条（不给自己抄送自己）")
    void pmAsResponsibleGetsSingleNotice() {
        givenProjectBoard(project(PROJECT_ID, PM), PM,
                board(todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, PM,
                        RdmConstants.URGE_L3_OVERDUE_WORKING_DAYS, 1)));

        RdmTodoNotifyService.TodoNotifyResult result = service.urgeOverdueTodos(PROJECT_ID, PM, WED);

        assertEquals(1, result.getNotified());
        verify(notifyService, times(1)).notifyDeduped(anyString(), anyString(), anyLong(),
                anyString(), anyLong(), any(), anyString(), anyString());
    }

    @Test
    @DisplayName("催办标题按逾期程度分级（L3紧急/L2加急/其余普通），便于收件人分诊")
    void urgeTitleIsGradedBySeverity() {
        givenProjectBoard(project(PROJECT_ID, PM), PM,
                board(todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, OWNER, 1, 1)));
        service.urgeOverdueTodos(PROJECT_ID, PM, WED);
        ArgumentCaptor<String> l1 = ArgumentCaptor.forClass(String.class);
        verify(notifyService).notifyDeduped(anyString(), anyString(), anyLong(), anyString(),
                anyLong(), any(), l1.capture(), anyString());
        assertTrue(l1.getValue().startsWith("【催辦】"), l1.getValue());

        givenProjectBoard(project(PROJECT_ID, PM), PM,
                board(todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, OWNER,
                        RdmConstants.URGE_L3_OVERDUE_WORKING_DAYS, 1)));
        service.urgeOverdueTodos(PROJECT_ID, PM, WED);
        ArgumentCaptor<String> l3 = ArgumentCaptor.forClass(String.class);
        verify(notifyService, times(2)).notifyDeduped(anyString(), anyString(), anyLong(), anyString(),
                eq(OWNER), any(), l3.capture(), anyString());
        assertTrue(l3.getAllValues().get(1).startsWith("【催辦·緊急】"), l3.getAllValues().get(1));
    }

    /* ==================== 工作日历判定 ==================== */

    @Test
    @DisplayName("isWorkingDayFor：工作日true、周末false、请假日false、周末支援true")
    void isWorkingDayForUsesRealCalendar() {
        assertTrue(service.isWorkingDayFor(OWNER, MON));
        assertFalse(service.isWorkingDayFor(OWNER, SAT));
        assertFalse(service.isWorkingDayFor(OWNER, null), "提醒日为空时不催（fail-closed）");

        calendarRow(OWNER, WED, RdmWorkCalendar.TYPE_LEAVE, null);
        assertFalse(service.isWorkingDayFor(OWNER, WED));

        calendarRow(OWNER, SAT, RdmWorkCalendar.TYPE_OVERTIME, "4");
        assertTrue(service.isWorkingDayFor(OWNER, SAT));
    }

    @Test
    @DisplayName("nextUrgeDay：从次日起归整到该人真实日历的第一个工作日（可解释「今天不催那何时催」）")
    void nextUrgeDayRollsForward() {
        // 周五 → 下周一（跨过整个周末）
        assertEquals(LocalDate.of(2026, 1, 12),
                service.nextUrgeDay(OWNER, LocalDate.of(2026, 1, 9)));
        // 周一请假 → 顺延到周二
        calendarRow(OWNER, LocalDate.of(2026, 1, 6), RdmWorkCalendar.TYPE_LEAVE, null);
        assertEquals(LocalDate.of(2026, 1, 7), service.nextUrgeDay(OWNER, MON));
    }

    /* ==================== 去重对象类型 ==================== */

    @Test
    @DisplayName("object_type复合事件语义+对象语义：待办通知与催办互不抑制、问题与交付项不撞键")
    void objectTypeIsComposite() {
        RdmFactVO.Todo item = todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 5L, OWNER, 0, 1);
        RdmFactVO.Todo issue = todo(RdmConstants.NOTIFY_OBJECT_ISSUE, 5L, OWNER, 0, 1);

        assertEquals("project_todo:delivery_item", RdmTodoNotifyService.todoObjectType(item));
        assertEquals("project_urge:delivery_item", RdmTodoNotifyService.urgeObjectType(item));
        assertNotEquals(RdmTodoNotifyService.todoObjectType(item), RdmTodoNotifyService.todoObjectType(issue),
                "同为 id=5，问题与交付项必须不同键");
        assertNotEquals(RdmTodoNotifyService.todoObjectType(item), RdmTodoNotifyService.urgeObjectType(item),
                "同一对象上待办通知与催办必须不同键");
        assertTrue(RdmTodoNotifyService.todoObjectType(item).length() <= 32, "受 object_type VARCHAR(32) 约束");
        assertTrue(RdmTodoNotifyService.urgeObjectType(item).length() <= 32);
    }

    @Test
    @DisplayName("object_type超列宽→返回null拒绝出站（不截断：截断会让两个对象类型共用一个键）")
    void overlongObjectTypeIsRejectedNotTruncated() {
        RdmFactVO.Todo wide = todo("x".repeat(40), 5L, OWNER, 0, 1);

        assertNull(RdmTodoNotifyService.todoObjectType(wide));
        assertNull(RdmTodoNotifyService.urgeObjectType(wide));
    }

    @Test
    @DisplayName("对象类型缺失→退化为unknown占位而不是null（仍受列宽约束）")
    void missingObjectTypeDegradesToUnknown() {
        RdmFactVO.Todo bare = new RdmFactVO.Todo();
        bare.setRefId(5L);

        assertEquals("project_todo:unknown", RdmTodoNotifyService.todoObjectType(bare));
        assertEquals("project_urge:unknown", RdmTodoNotifyService.urgeObjectType(null));
    }

    /* ==================== B.7 手动催办的幂等 ==================== */

    @Test
    @DisplayName("手动催办接executeOnce：键含操作人+bizType+项目资源键+当日请求ID")
    @SuppressWarnings("unchecked")
    void manualUrgeGoesThroughIdempotentService() {
        givenProjectBoard(project(PROJECT_ID, PM), PM,
                board(todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, OWNER, 2, 1)));
        doReturn(null).when(idempotentService).executeOnce(any(IdempotentKey.class), any(Supplier.class),
                eq(RdmTodoNotifyService.TodoNotifyResult.class));

        RdmTodoNotifyService.TodoNotifyResult result = service.urgeProjectManually(PROJECT_ID, PM);

        assertEquals(0, result.getNotified(), "executeOnce 返回 null 时给空结果，不得谎报已催办");
        ArgumentCaptor<IdempotentKey> key = ArgumentCaptor.forClass(IdempotentKey.class);
        verify(idempotentService).executeOnce(key.capture(), any(Supplier.class),
                eq(RdmTodoNotifyService.TodoNotifyResult.class));
        assertEquals(PM, key.getValue().getUserId());
        assertEquals(RdmConstants.BIZ_TYPE_PROJECT_URGE, key.getValue().getBizType());
        assertEquals("project:" + PROJECT_ID, key.getValue().getResourceKey());
        assertTrue(key.getValue().getClientRequestId().startsWith("urge-" + PROJECT_ID + "-"),
                key.getValue().getClientRequestId());
    }

    @Test
    @DisplayName("executeOnce首次执行时真正跑催办（幂等包装不吞掉业务动作）")
    @SuppressWarnings("unchecked")
    void manualUrgeActuallyRunsBusinessAction() {
        givenProjectBoard(project(PROJECT_ID, PM), PM,
                board(todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, OWNER, 2, 1)));
        /*
         * 手动催办内部用 LocalDate.now() 当提醒日，而「今天必须是责任人真实工作日」是第一道闸门：
         * 不排日历时周末跑本用例会因闸门拦下所有人而得到 notified=0（用例本身与星期无关）。
         * 这里把「今天」显式排成 OWNER 的加班支援日，使用例在任何日期都稳定，
         * 且不放宽断言（仍然要求真正跑完业务动作、真正发出通知）。
         */
        calendarRow(OWNER, LocalDate.now(), RdmWorkCalendar.TYPE_OVERTIME, "8");
        doReturn(null).when(idempotentService).executeOnce(any(IdempotentKey.class), any(Supplier.class), any());
        ArgumentCaptor<Supplier<RdmTodoNotifyService.TodoNotifyResult>> supplier =
                ArgumentCaptor.forClass(Supplier.class);

        service.urgeProjectManually(PROJECT_ID, PM);

        verify(idempotentService).executeOnce(any(IdempotentKey.class), supplier.capture(), any());
        RdmTodoNotifyService.TodoNotifyResult inner = supplier.getValue().get();
        assertEquals(1, inner.getNotified());
        verify(notifyService).notifyDeduped(eq(RdmConstants.EVENT_PROJECT_URGE), anyString(), eq(11L),
                anyString(), eq(OWNER), any(), anyString(), anyString());
    }

    @Test
    @DisplayName("缺认证主体→拒绝催办（不以系统身份代发，fail-closed）")
    void manualUrgeRequiresAuthenticatedOperator() {
        assertThrows(BusinessException.class, () -> service.urgeProjectManually(PROJECT_ID, null));
        assertThrows(BusinessException.class, () -> service.urgeProjectManually(PROJECT_ID, 0L));
        assertThrows(BusinessException.class, () -> service.urgeProjectManually(null, PM));
        assertThrows(BusinessException.class, () -> service.urgeProjectManually(-1L, PM));
        verifyNoInteractions(idempotentService, notifyService, factService);
    }

    @Test
    @DisplayName("提醒日为null时催办取今天（作业漏传日期也不能变成不去重）")
    void nullRemindDayFallsBackToToday() {
        givenProjectBoard(project(PROJECT_ID, PM), PM,
                board(todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, OWNER, 0, 1)));

        RdmTodoNotifyService.TodoNotifyResult result = service.urgeOverdueTodos(PROJECT_ID, PM, null);

        assertEquals(LocalDate.now().toString(), result.getRemindDay());
    }

    @Test
    @DisplayName("空看板：扫到项目但零待办，不发任何通知（作业空转不产生噪音）")
    void emptyBoardProducesNoNotification() {
        givenProjectBoard(project(PROJECT_ID, PM), PM, board());

        RdmTodoNotifyService.TodoNotifyResult result = service.urgeOverdueTodos(PROJECT_ID, PM, MON);

        assertEquals(1, result.getScannedProjects());
        assertEquals(0, result.getScannedTodos());
        assertEquals(0, result.getNotified());
        assertTrue(result.getNotes().isEmpty(), "实际=" + result.getNotes());
        verifyNoInteractions(notifyService);
    }

    @Test
    @DisplayName("催办与待办通知都只经notifyDeduped出站（不存在绕过dry-run的直发旁路）")
    void allOutboundGoesThroughDedupedChannel() {
        givenProjectBoard(project(PROJECT_ID, PM), PM,
                board(todo(RdmConstants.NOTIFY_OBJECT_DELIVERY_ITEM, 11L, OWNER, 2, 1)));

        service.notifyPendingTodos(PROJECT_ID, PM);
        service.urgeOverdueTodos(PROJECT_ID, PM, MON);

        verify(notifyService, times(2)).notifyDeduped(anyString(), anyString(), anyLong(), anyString(),
                anyLong(), any(), anyString(), anyString());
        // 本服务不持有任何直发通道：只有 notifyDeduped 一个出口，因此 dry-run 与去重都无法被绕过
        verifyNoMoreInteractions(notifyService);
    }

    @Test
    @DisplayName("result的remindDay与notes始终可用（不因空扫描返回null导致作业日志NPE）")
    void resultIsNeverNull() {
        RdmTodoNotifyService.TodoNotifyResult urge = service.urgeOverdueTodos(null, null, MON);
        RdmTodoNotifyService.TodoNotifyResult pending = service.notifyPendingTodos(null, null);

        assertEquals(MON.toString(), urge.getRemindDay());
        assertTrue(urge.getNotes() != null && pending.getNotes() != null);
        assertEquals(0, urge.getScannedProjects());
        doReturn(new ArrayList<RdmProject>()).when(projectMapper).selectList(any());
        assertEquals(0, service.urgeOverdueTodos(null, null, MON).getScannedProjects());
    }
}
