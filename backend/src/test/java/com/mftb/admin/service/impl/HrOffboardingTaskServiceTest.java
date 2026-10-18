package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EamHandoverSaveDTO;
import com.mftb.admin.dto.EamHandoverVO;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.entity.HrLifecycleRequest;
import com.mftb.admin.entity.HrOffboardingTask;
import com.mftb.admin.entity.OaApprovalTask;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EamAssetMapper;
import com.mftb.admin.mapper.HrLifecycleRequestMapper;
import com.mftb.admin.mapper.HrOffboardingTaskMapper;
import com.mftb.admin.mapper.OaApprovalTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.EamHandoverService;
import com.mftb.admin.service.OrgScopeService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 离职联动任务测试（方案 §7.4「重试不得重复生成业务单」+ §7.2「离职增加交接责任人任务」）。
 * <p>重点钉四件容易写错的事：登记幂等、终态不许重跑、无事可做是 SKIPPED 而不是 DONE、
 * 待办改派必须按整段签名匹配（否则会把同名不同工号的别人的待办抢走）。
 */
class HrOffboardingTaskServiceTest {

    private static final Long REQUEST_ID = 88L;
    private static final long LEAVING_ID = 11L;
    private static final Long RECEIVER_ID = 22L;
    private static final LocalDate EFFECTIVE = LocalDate.of(2026, 10, 18);

    private HrOffboardingTaskMapper taskMapper;
    private HrLifecycleRequestMapper lifecycleMapper;
    private SysUserMapper sysUserMapper;
    private EamAssetMapper assetMapper;
    private EamHandoverService handoverService;
    private OaApprovalTaskMapper approvalTaskMapper;
    private OrgScopeService orgScopeService;
    private final List<HrOffboardingTask> table = new ArrayList<>();
    private final AtomicLong idSeq = new AtomicLong(500);

    private HrOffboardingTaskServiceImpl service;
    /** 内存单据：测试里改它的 handoverToUserId 就能模拟「指定接收人」，不必重新 stub */
    private HrLifecycleRequest stored;

    @BeforeEach
    void setUp() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, HrOffboardingTask.class);
        TableInfoHelper.initTableInfo(assistant, EamAsset.class);
        TableInfoHelper.initTableInfo(assistant, OaApprovalTask.class);

        taskMapper = mock(HrOffboardingTaskMapper.class);
        lifecycleMapper = mock(HrLifecycleRequestMapper.class);
        sysUserMapper = mock(SysUserMapper.class);
        assetMapper = mock(EamAssetMapper.class);
        handoverService = mock(EamHandoverService.class);
        approvalTaskMapper = mock(OaApprovalTaskMapper.class);
        orgScopeService = mock(OrgScopeService.class);
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        when(operatorResolver.currentOperatorName()).thenReturn("HR專員");
        // 签名格式与 OperatorResolver 一致：姓名(工号)
        when(operatorResolver.operatorSignature(any())).thenAnswer(inv -> {
            SysUser u = inv.getArgument(0);
            return u == null ? null : u.getName() + "(" + u.getEmpId() + ")";
        });

        service = new HrOffboardingTaskServiceImpl(taskMapper, lifecycleMapper, sysUserMapper,
                assetMapper, handoverService, approvalTaskMapper, operatorResolver, orgScopeService);

        // selectList 同样按 wrapper 条件过滤：否则「只拾取 PENDING」这类查询语义在测试里等于没被验证
        when(taskMapper.selectList(any(LambdaQueryWrapper.class))).thenAnswer(inv -> {
            LambdaQueryWrapper<HrOffboardingTask> wrapper = inv.getArgument(0);
            wrapper.getSqlSegment();
            var params = wrapper.getParamNameValuePairs().values();
            List<HrOffboardingTask> rows = new ArrayList<>(table);
            if (params.contains(HrOffboardingTask.STATUS_PENDING)) {
                rows = rows.stream().filter(x -> HrOffboardingTask.STATUS_PENDING.equals(x.getStatus())).toList();
            }
            if (params.contains(REQUEST_ID)) {
                rows = rows.stream().filter(x -> REQUEST_ID.equals(x.getRequestId())).toList();
            }
            var date = params.stream().filter(LocalDate.class::isInstance).map(LocalDate.class::cast)
                    .findFirst().orElse(null);
            if (date != null) {
                rows = rows.stream().filter(x -> x.getEffectiveDate() != null && !x.getEffectiveDate().isAfter(date)).toList();
            }
            return new ArrayList<>(rows);
        });
        // selectOne 模拟 findByType(request_id + task_type)：从 wrapper 的参数值里取出这两个值回查内存表
        when(taskMapper.selectOne(any(LambdaQueryWrapper.class))).thenAnswer(inv -> {
            LambdaQueryWrapper<HrOffboardingTask> wrapper = inv.getArgument(0);
            // MP 的 paramNameValuePairs 在生成 SQL 段时才填充，先取一次再读参数
            wrapper.getSqlSegment();
            var params = wrapper.getParamNameValuePairs().values();
            return table.stream()
                    .filter(t -> params.contains(t.getRequestId()) && params.contains(t.getTaskType()))
                    .findFirst().orElse(null);
        });
        when(taskMapper.insert(any(HrOffboardingTask.class))).thenAnswer(inv -> {
            HrOffboardingTask t = inv.getArgument(0);
            t.setId(idSeq.getAndIncrement());
            table.add(t);
            return 1;
        });
        when(taskMapper.selectById(anyLong())).thenAnswer(inv -> table.stream()
                .filter(t -> t.getId().equals(inv.getArgument(0))).findFirst().orElse(null));

        when(sysUserMapper.selectById(LEAVING_ID)).thenReturn(user(LEAVING_ID, "MF00011", "李大仁"));
        when(sysUserMapper.selectById(RECEIVER_ID)).thenReturn(user(RECEIVER_ID, "MF00022", "王小美"));
        stored = request(null);
        when(lifecycleMapper.selectById(REQUEST_ID)).thenReturn(stored);
    }

    // ── 登记 ──

    @Test
    @DisplayName("离职办理登记两类联动任务，重复办理不会长出第三行")
    void scheduleIsIdempotent() {
        service.scheduleForDimission(stored, EFFECTIVE, "HR專員");
        service.scheduleForDimission(stored, EFFECTIVE, "HR專員");

        assertEquals(2, table.size(), "只该有资产交接与待办改派两类: " + types());
        assertTrue(table.stream().allMatch(t -> HrOffboardingTask.STATUS_PENDING.equals(t.getStatus())));
        verify(taskMapper, times(2)).insert(any(HrOffboardingTask.class));
    }

    // ── 执行 ──

    @Test
    @DisplayName("未指定接收人时停在等待态并给出可读原因（不默认转给上级）")
    void missingReceiverKeepsTaskWaiting() {
        service.scheduleForDimission(stored, EFFECTIVE, "HR專員");

        boolean terminal = service.execute(table.get(0).getId(), "HR專員");

        assertEquals(false, terminal);
        assertEquals(HrOffboardingTask.STATUS_FAILED, table.get(0).getStatus());
        assertTrue(table.get(0).getLastError().contains("接收人"),
                "失败原因必须告诉 HR 该做什么: " + table.get(0).getLastError());
        verify(handoverService, never()).register(any());
    }

    @Test
    @DisplayName("资产交接：只为名下使用中的资产发起交接单，并回写交接单号")
    void assetHandoverRegistersOnce() {
        stored.setHandoverToUserId(RECEIVER_ID);
        service.scheduleForDimission(stored, EFFECTIVE, "HR專員");
        when(assetMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(asset(1L), asset(2L)));
        when(handoverService.register(any(EamHandoverSaveDTO.class))).thenReturn(777L);
        EamHandoverVO created = new EamHandoverVO();
        created.setHandoverNo("HO202610180001");
        when(handoverService.detail(777L)).thenReturn(created);

        boolean terminal = service.execute(table.get(0).getId(), "HR專員");

        assertEquals(true, terminal);
        assertEquals(HrOffboardingTask.STATUS_DONE, table.get(0).getStatus());
        assertEquals("HO202610180001", table.get(0).getTargetRef());
        ArgumentCaptor<EamHandoverSaveDTO> captor = ArgumentCaptor.forClass(EamHandoverSaveDTO.class);
        verify(handoverService).register(captor.capture());
        EamHandoverSaveDTO dto = captor.getValue();
        assertEquals("resign", dto.getReason());
        assertEquals("employee", dto.getReceiverType());
        assertEquals("王小美", dto.getToUserName());
        assertEquals(List.of(1L, 2L), dto.getAssetIds());
    }

    @Test
    @DisplayName("名下没有在用资产 → SKIPPED 而不是 DONE（界面要能区分「无事可做」与「已交接」）")
    void noAssetsIsSkippedNotDone() {
        stored.setHandoverToUserId(RECEIVER_ID);
        service.scheduleForDimission(stored, EFFECTIVE, "HR專員");
        when(assetMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        assertTrue(service.execute(table.get(0).getId(), "HR專員"));
        assertEquals(HrOffboardingTask.STATUS_SKIPPED, table.get(0).getStatus());
        assertTrue(table.get(0).getResultSummary().contains("無在冊"));
        verify(handoverService, never()).register(any());
    }

    @Test
    @DisplayName("终态任务拒绝重跑：这是「重试不重复建交接单」的闸")
    void terminalTaskCannotBeReplayed() {
        stored.setHandoverToUserId(RECEIVER_ID);
        service.scheduleForDimission(stored, EFFECTIVE, "HR專員");
        when(assetMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());
        service.execute(table.get(0).getId(), "HR專員");

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.execute(table.get(0).getId(), "HR專員"));
        assertTrue(ex.getMessage().contains("重複執行"), ex.getMessage());
        verify(handoverService, never()).register(any());
    }

    @Test
    @DisplayName("待办改派按整段签名匹配：同名不同工号的人不能被误改派")
    void todoTransferMatchesWholeSignatureOnly() {
        stored.setHandoverToUserId(RECEIVER_ID);
        service.scheduleForDimission(stored, EFFECTIVE, "HR專員");
        String leavingSignature = "李大仁(MF00011)";
        OaApprovalTask mine = pendingTask(1L, leavingSignature + ",陳大文(MF00033)");
        // 工号前缀相同的另一个人：like 查询会命中，但绝不能被改派
        OaApprovalTask namesake = pendingTask(2L, "李大仁(MF000110)");
        when(approvalTaskMapper.selectList(any(LambdaQueryWrapper.class)))
                .thenReturn(List.of(mine, namesake));

        boolean terminal = service.execute(table.get(1).getId(), "HR專員");

        assertEquals(true, terminal);
        assertEquals(HrOffboardingTask.STATUS_DONE, table.get(1).getStatus());
        ArgumentCaptor<OaApprovalTask> captor = ArgumentCaptor.forClass(OaApprovalTask.class);
        verify(approvalTaskMapper, times(1)).updateById(captor.capture());
        OaApprovalTask updated = captor.getValue();
        assertEquals(1L, updated.getId());
        assertEquals("王小美(MF00022),陳大文(MF00033)", updated.getApprover());
        // 会签(all)按 approvedBy 数量判断是否审完，替换必须等长：不能把接收人列表改短
        assertEquals(2, updated.getApprover().split(",").length);
        assertEquals("1", table.get(1).getTargetRef());
    }

    @Test
    @DisplayName("没有待办节点时也是 SKIPPED，不算失败")
    void todoWithoutPendingIsSkipped() {
        stored.setHandoverToUserId(RECEIVER_ID);
        service.scheduleForDimission(stored, EFFECTIVE, "HR專員");
        when(approvalTaskMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        assertTrue(service.execute(table.get(1).getId(), "HR專員"));
        assertEquals(HrOffboardingTask.STATUS_SKIPPED, table.get(1).getStatus());
        verify(approvalTaskMapper, never()).updateById(any(OaApprovalTask.class));
    }

    // ── 接收人与越权 ──

    @Test
    @DisplayName("指定接收人后，失败任务退回 PENDING 等下一轮")
    void assignReceiverWakesFailedTasks() {
        service.scheduleForDimission(stored, EFFECTIVE, "HR專員");
        service.execute(table.get(0).getId(), "HR專員");
        assertEquals(HrOffboardingTask.STATUS_FAILED, table.get(0).getStatus());

        service.assignReceiver(REQUEST_ID, RECEIVER_ID, "HR專員");

        assertEquals(HrOffboardingTask.STATUS_PENDING, table.get(0).getStatus());
        assertEquals(null, table.get(0).getLastError());
        ArgumentCaptor<HrLifecycleRequest> captor = ArgumentCaptor.forClass(HrLifecycleRequest.class);
        verify(lifecycleMapper, atLeastOnce()).updateById(captor.capture());
        HrLifecycleRequest saved = captor.getAllValues().get(captor.getAllValues().size() - 1);
        assertEquals(RECEIVER_ID, saved.getHandoverToUserId());
        assertEquals("王小美", saved.getHandoverToName(), "姓名由服务端反查，不接受前端传值");
    }

    @Test
    @DisplayName("接收人不能是离职人本人，也不能是系统服务账号")
    void receiverMustBeAnotherEmployee() {
        BusinessException self = assertThrows(BusinessException.class,
                () -> service.assignReceiver(REQUEST_ID, LEAVING_ID, "HR專員"));
        assertTrue(self.getMessage().contains("離職人本人"), self.getMessage());

        when(sysUserMapper.selectById(2L)).thenReturn(user(2L, "admin", "系統管理員"));
        BusinessException system = assertThrows(BusinessException.class,
                () -> service.assignReceiver(REQUEST_ID, 2L, "HR專員"));
        assertTrue(system.getMessage().contains("系統服務賬號"), system.getMessage());
    }

    @Test
    @DisplayName("单据不在可见范围内时拒绝指定接收人（离职人与接收人都要校验）")
    void outOfScopeIsRejected() {
        org.mockito.Mockito.doThrow(new BusinessException("無權查看該人員的資料"))
                .when(orgScopeService).requireVisibleUser(LEAVING_ID);

        assertThrows(BusinessException.class, () -> service.assignReceiver(REQUEST_ID, RECEIVER_ID, "HR專員"));
        verify(lifecycleMapper, never()).updateById(any(HrLifecycleRequest.class));
    }

    @Test
    @DisplayName("定时只拾取 PENDING：FAILED 必须人工重试，不自动刷同一份错账")
    void dueTasksOnlyPicksPending() {
        service.scheduleForDimission(stored, EFFECTIVE, "HR專員");
        service.execute(table.get(0).getId(), "HR專員");

        List<HrOffboardingTask> due = service.dueTasks(EFFECTIVE);

        assertEquals(1, due.size(), "只剩另一个未执行的 PENDING 任务");
        assertEquals(HrOffboardingTask.TYPE_OA_TODO_TRANSFER, due.get(0).getTaskType());
    }

    // ── 夹具 ──

    private List<String> types() {
        return table.stream().map(HrOffboardingTask::getTaskType).toList();
    }

    private static HrLifecycleRequest request(Long receiverId) {
        HrLifecycleRequest req = new HrLifecycleRequest();
        req.setId(REQUEST_ID);
        req.setReqNo("HR202610180088");
        req.setUserId(LEAVING_ID);
        req.setEmpNo("MF00011");
        req.setHandoverToUserId(receiverId);
        return req;
    }

    private static SysUser user(long id, String empId, String name) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setEmpId(empId);
        user.setUsername(empId);
        user.setName(name);
        user.setDepartment("市場部");
        return user;
    }

    private static EamAsset asset(Long id) {
        EamAsset asset = new EamAsset();
        asset.setId(id);
        asset.setCurrentHolderId(LEAVING_ID);
        return asset;
    }

    private static OaApprovalTask pendingTask(Long id, String approver) {
        OaApprovalTask task = new OaApprovalTask();
        task.setId(id);
        task.setTaskStatus("pending");
        task.setApprover(approver);
        return task;
    }
}
