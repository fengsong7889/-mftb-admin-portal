package com.mftb.admin.service;

import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmRequirementRole;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmStatusLogMapper;
import com.mftb.admin.mapper.SysUserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 准入审批回调的轮次一致性测试（阶段 2B）。
 * <p>锁死四件事：
 * <ol>
 *   <li>非当前待审轮次的回调（旧单迟到）不能推动需求；</li>
 *   <li>轮次已审结时重复回调必须被幂等挡住，不重复改状态、不重复通知；</li>
 *   <li>审批通过后有指定 PM 且仍有效时直送受理，不再占需求池队列；</li>
 *   <li>驳回后清空旧单号，避免下一轮重提沿用已终态的准入单。</li>
 * </ol>
 */
class RdmIntakeCallbackRoundTest {

    private RdmRequirementMapper requirementMapper;
    private RdmRequirementRoleMapper roleMapper;
    private RdmStatusLogMapper statusLogMapper;
    private RdmNotifyService notifyService;
    private RdmIntakeRoundService roundService;
    private SysUserMapper userMapper;
    private RdmIntakeCallbackService callback;

    @BeforeEach
    void setUp() {
        requirementMapper = mock(RdmRequirementMapper.class);
        roleMapper = mock(RdmRequirementRoleMapper.class);
        statusLogMapper = mock(RdmStatusLogMapper.class);
        notifyService = mock(RdmNotifyService.class);
        roundService = mock(RdmIntakeRoundService.class);
        userMapper = mock(SysUserMapper.class);
        callback = new RdmIntakeCallbackService(requirementMapper, roleMapper, statusLogMapper,
                mock(RdmConfigService.class), notifyService, roundService, userMapper);
        when(statusLogMapper.selectList(any())).thenReturn(List.of());
        when(roleMapper.selectCount(any())).thenReturn(0L);
    }

    private static RdmIntakeRoundService.Round round(int no, String decision) {
        RdmIntakeRoundService.Round r = new RdmIntakeRoundService.Round();
        r.setId((long) no);
        r.setReqId(1L);
        r.setRoundNo(no);
        r.setFlowNo("OA-" + no);
        r.setDecision(decision);
        return r;
    }

    private static RdmRequirement pendingRequirement(Long intentPmUserId) {
        RdmRequirement req = new RdmRequirement();
        req.setId(1L);
        req.setReqNo("XQ202610060001");
        req.setTitle("推薦報表支持自定義時間區間導出");
        req.setStatus(RdmConstants.STATUS_INTAKE_PENDING);
        req.setSubmitterUserId(11L);
        req.setSubmitterName("張三");
        req.setPriority("P2");
        req.setIntakeFlowNo("OA-2");
        req.setIntakeRoundNo(2);
        req.setIntentPmUserId(intentPmUserId);
        req.setRejectCount(0);
        return req;
    }

    @Test
    @DisplayName("旧轮迟到的通过回调不能推动已重提的需求")
    void staleRoundCallbackIgnored() {
        when(roundService.findByFlow("OA-1")).thenReturn(round(1, RdmIntakeRoundService.DECISION_WITHDRAWN));
        when(roundService.isCurrentPending("OA-1")).thenReturn(false);

        callback.onFlowApproved("OA-1");

        // MyBatis-Plus 的 BaseMapper 对 updateById/insert 都有单条与集合两个重载，必须显式转型才能选到单条
        verify(requirementMapper, never()).updateById((RdmRequirement) any());
        verify(notifyService, never()).notifyUserIds(anyString(), any(), any(), anyString(), anyString());
    }

    @Test
    @DisplayName("轮次已审结时重复回调幂等跳过（不重复改状态与通知）")
    void duplicateCallbackIsIdempotent() {
        when(roundService.findByFlow("OA-2")).thenReturn(round(2, RdmIntakeRoundService.DECISION_PENDING));
        when(roundService.isCurrentPending("OA-2")).thenReturn(true);
        when(roundService.markDecided(eq("OA-2"), eq(RdmIntakeRoundService.DECISION_APPROVED), anyString())).thenReturn(false);

        callback.onFlowApproved("OA-2");

        verify(requirementMapper, never()).updateById((RdmRequirement) any());
        verify(notifyService, never()).notifyUserIds(anyString(), any(), any(), anyString(), anyString());
    }

    @Test
    @DisplayName("审批通过且指定 PM 仍有效 → 直送已分配·待受理")
    void approvedAppliesIntentPm() {
        RdmRequirement req = pendingRequirement(21L);
        when(roundService.findByFlow("OA-2")).thenReturn(round(2, RdmIntakeRoundService.DECISION_PENDING));
        when(roundService.isCurrentPending("OA-2")).thenReturn(true);
        when(roundService.markDecided(anyString(), anyString(), anyString())).thenReturn(true);
        when(requirementMapper.selectById(1L)).thenReturn(req);
        when(userMapper.selectById(21L)).thenReturn(activeUser(21L, "陳雅婷"));

        callback.onFlowApproved("OA-2");

        assertEquals(RdmConstants.STATUS_ASSIGNED, req.getStatus());
        assertEquals("陳雅婷", req.getAssigneePmName());
        assertEquals("陳雅婷", req.getCurrentHandlerName());
        verify(roleMapper, times(1)).insert((RdmRequirementRole) any());
    }

    @Test
    @DisplayName("审批通过但意向 PM 已停用 → 回需求池等技术负责人分配")
    void unavailableIntentPmFallsBackToPool() {
        RdmRequirement req = pendingRequirement(21L);
        SysUser retired = activeUser(21L, "陳雅婷");
        retired.setStatus(0);
        when(roundService.findByFlow("OA-2")).thenReturn(round(2, RdmIntakeRoundService.DECISION_PENDING));
        when(roundService.isCurrentPending("OA-2")).thenReturn(true);
        when(roundService.markDecided(anyString(), anyString(), anyString())).thenReturn(true);
        when(requirementMapper.selectById(1L)).thenReturn(req);
        when(userMapper.selectById(21L)).thenReturn(retired);

        callback.onFlowApproved("OA-2");

        assertEquals(RdmConstants.STATUS_POOL, req.getStatus());
        assertNull(req.getAssigneePmName());
        assertTrue(callback.isIntakeProcess(RdmConstants.INTAKE_PROCESS_CODE));
    }

    @Test
    @DisplayName("驳回回调落到审批驳回态并清空旧准入单号")
    void rejectedClearsStaleFlow() {
        RdmRequirement req = pendingRequirement(null);
        when(roundService.findByFlow("OA-2")).thenReturn(round(2, RdmIntakeRoundService.DECISION_PENDING));
        when(roundService.isCurrentPending("OA-2")).thenReturn(true);
        when(roundService.markDecided(anyString(), anyString(), anyString())).thenReturn(true);
        when(requirementMapper.selectById(1L)).thenReturn(req);

        callback.onFlowRejected("OA-2", "範圍不清，先補期望結果");

        assertEquals(RdmConstants.STATUS_INTAKE_REJECTED, req.getStatus());
        assertNull(req.getIntakeFlowNo());
        assertEquals("範圍不清，先補期望結果", req.getRejectReason());
        assertEquals(Integer.valueOf(1), req.getRejectCount());
        assertEquals(req.getSubmitterName(), req.getCurrentHandlerName());
    }

    private static SysUser activeUser(long id, String name) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setEmpId("MF000" + id);
        u.setName(name);
        u.setStatus(1);
        return u;
    }
}
