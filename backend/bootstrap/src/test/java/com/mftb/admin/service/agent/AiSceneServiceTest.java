package com.mftb.admin.service.agent;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.AiSceneDto;
import com.mftb.admin.entity.AiSceneConfig;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiSceneConfigMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.AiMyCenterService;
import com.mftb.admin.service.AuthorizationTraceService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.agent.platform.AiDataPolicyService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 业务 AI 场景准入的安全回归：默认拒绝、乐观锁冲突不覆盖、严格审计、权限/场景门控。
 */
class AiSceneServiceTest {

    private AiSceneConfigMapper sceneMapper;
    private AiConfigAuditService auditService;
    private PermissionService permissionService;
    private AuthorizationTraceService traceService;
    private AiKillSwitchService killSwitchService;
    private LlmChannelRouter channelRouter;
    private AiMyCenterService myCenterService;
    private AiDataPolicyService dataPolicy;
    private SysUserMapper userMapper;
    private AiSceneService service;

    private static final String SCENE = MeetingConstants.SCENE_MEETING_MINUTES;

    @BeforeEach
    void setUp() {
        sceneMapper = mock(AiSceneConfigMapper.class);
        auditService = mock(AiConfigAuditService.class);
        permissionService = mock(PermissionService.class);
        traceService = mock(AuthorizationTraceService.class);
        killSwitchService = mock(AiKillSwitchService.class);
        channelRouter = mock(LlmChannelRouter.class);
        myCenterService = mock(AiMyCenterService.class);
        dataPolicy = mock(AiDataPolicyService.class);
        userMapper = mock(SysUserMapper.class);
        service = new AiSceneService(sceneMapper, auditService, permissionService, traceService,
                killSwitchService, channelRouter, myCenterService, dataPolicy, userMapper);
        // @Value 字段在无 Spring 时默认 false，会误判环境阻断；显式放开环境上限，聚焦其余门禁
        ReflectionTestUtils.setField(service, "minutesEnabled", true);
        ReflectionTestUtils.setField(service, "meetingAiEnvironmentAllowed", true);
    }

    private SysUser user() {
        SysUser u = new SysUser();
        u.setId(7L);
        u.setUsername("MF00007");
        u.setName("張三");
        u.setStatus(1);
        return u;
    }

    private AiSceneConfig enabledRow() {
        AiSceneConfig row = new AiSceneConfig();
        row.setSceneKey(SCENE);
        row.setEnabled(1);
        row.setVersion(3L);
        return row;
    }

    @Test
    @DisplayName("缺行/停用/读取异常一律按未启用（默认拒绝）")
    void sceneEnabledDefaultsToDeny() {
        when(sceneMapper.selectById(SCENE)).thenReturn(null);
        assertFalse(service.isSceneEnabled(SCENE));
        AiSceneConfig off = enabledRow();
        off.setEnabled(0);
        when(sceneMapper.selectById(SCENE)).thenReturn(off);
        assertFalse(service.isSceneEnabled(SCENE));
        when(sceneMapper.selectById(SCENE)).thenThrow(new RuntimeException("db down"));
        assertFalse(service.isSceneEnabled(SCENE));
        // 未登记场景直接拒绝，不查库
        assertFalse(service.isSceneEnabled("unknown_scene"));
    }

    @Test
    @DisplayName("保存：版本不符抛 409，不覆盖他人；成功走条件更新 + 严格审计")
    void saveOptimisticLockAndAudit() {
        when(sceneMapper.selectById(SCENE)).thenReturn(enabledRow());
        AiSceneDto.ConfigForm mismatch = new AiSceneDto.ConfigForm();
        mismatch.setEnabled(true);
        mismatch.setExpectedVersion(2L);
        mismatch.setReason("測試");
        BusinessException conflict = assertThrows(BusinessException.class, () -> service.save(SCENE, mismatch, user()));
        assertEquals(409, conflict.getCode().intValue());
        verify(sceneMapper, never()).updateWithVersion(anyString(), anyInt(), anyString(), anyLong(), anyLong());

        AiSceneDto.ConfigForm ok = new AiSceneDto.ConfigForm();
        ok.setEnabled(false);
        ok.setExpectedVersion(3L);
        ok.setReason("暫停試點");
        when(sceneMapper.updateWithVersion(eq(SCENE), eq(0), eq("暫停試點"), eq(7L), eq(3L))).thenReturn(1);
        service.save(SCENE, ok, user());
        verify(sceneMapper).updateWithVersion(SCENE, 0, "暫停試點", 7L, 3L);
        verify(auditService).recordStrict(eq("ai_scene_config"), eq(SCENE), eq("disable"), any(), any());
    }

    @Test
    @DisplayName("保存：空原因拒绝，不写库")
    void saveRejectsBlankReason() {
        when(sceneMapper.selectById(SCENE)).thenReturn(enabledRow());
        AiSceneDto.ConfigForm blank = new AiSceneDto.ConfigForm();
        blank.setEnabled(true);
        blank.setExpectedVersion(3L);
        blank.setReason("   ");
        assertThrows(BusinessException.class, () -> service.save(SCENE, blank, user()));
        verify(sceneMapper, never()).updateWithVersion(anyString(), anyInt(), anyString(), anyLong(), anyLong());
    }

    @Test
    @DisplayName("诊断：场景未启用即判不就绪（诊断会并行给出各项，但首个阻断为场景）")
    void diagnoseBlocksWhenSceneDisabled() {
        when(sceneMapper.selectById(SCENE)).thenReturn(null);
        AiSceneDto.DiagnosisVO vo = service.evaluate(SCENE, user());
        assertFalse(vo.isReady());
        assertEquals("scene_disabled", vo.getReasonCode());
        // 场景项本身必须标为 blocked
        assertTrue(vo.getChecks().stream().anyMatch(c -> "scene".equals(c.key()) && "blocked".equals(c.status())));
    }

    @Test
    @DisplayName("诊断：缺 AI 整理动作时判无权限，不进入模型/额度检查")
    void diagnoseBlocksWhenNoPermission() {
        when(sceneMapper.selectById(SCENE)).thenReturn(enabledRow());
        when(killSwitchService.isEngaged()).thenReturn(false);
        when(permissionService.hasSystemAccess(any(), eq("meeting"))).thenReturn(true);
        // 只给 edit，不给 ai_minutes
        when(permissionService.hasPermission(any(), anyString(), eq(MeetingConstants.ACTION_EDIT))).thenReturn(true);
        when(permissionService.hasPermission(any(), anyString(), eq(MeetingConstants.ACTION_AI_MINUTES))).thenReturn(false);
        AiSceneDto.DiagnosisVO vo = service.evaluate(SCENE, user());
        assertFalse(vo.isReady());
        assertFalse(vo.isAuthorized());
        assertEquals("no_permission", vo.getReasonCode());
    }

    @Test
    @DisplayName("诊断：全条件满足时 ready，模型/额度/数据准入均通过")
    void diagnoseReadyWhenAllPass() {
        when(sceneMapper.selectById(SCENE)).thenReturn(enabledRow());
        when(killSwitchService.isEngaged()).thenReturn(false);
        when(permissionService.hasSystemAccess(any(), eq("meeting"))).thenReturn(true);
        when(permissionService.hasPermission(any(), anyString(), anyString())).thenReturn(true);
        LlmChannelRouter.Channel channel = new LlmChannelRouter.Channel();
        channel.setDefaultModelKey("gpt-x");
        when(channelRouter.resolveChannel(eq(LlmChannelRouter.CHANNEL_PRIMARY), anyString())).thenReturn(channel);
        when(myCenterService.hasModelAccess(any(SysUser.class), eq("gpt-x"))).thenReturn(true);
        com.mftb.admin.dto.AiMyCenterDTO.QuotaCheckVO quota = new com.mftb.admin.dto.AiMyCenterDTO.QuotaCheckVO();
        quota.setAllowed(true);
        quota.setAction("allow");
        when(myCenterService.checkQuotaFor(any(SysUser.class), any(), eq("gpt-x"))).thenReturn(quota);
        when(dataPolicy.evaluate(eq("meeting"), eq("gpt-x"))).thenReturn(new AiDataPolicyService.Decision(true, null, null));
        AiSceneDto.DiagnosisVO vo = service.evaluate(SCENE, user());
        assertTrue(vo.isReady());
        assertTrue(vo.isAuthorized());
        assertEquals("gpt-x", vo.getModelKey());
        assertEquals("meeting_minutes", vo.getSceneKey());
    }

    @Test
    @DisplayName("诊断：无法确认急停状态时按熔断拒绝（默认拒绝）")
    void diagnoseBlocksWhenKillSwitchUnknown() {
        when(sceneMapper.selectById(SCENE)).thenReturn(enabledRow());
        when(killSwitchService.isEngaged()).thenThrow(new RuntimeException("config down"));
        AiSceneDto.DiagnosisVO vo = service.evaluate(SCENE, user());
        assertFalse(vo.isReady());
        assertEquals("kill_switch", vo.getReasonCode());
    }

    @Test
    @DisplayName("未登记场景：read/evaluate 直接拒绝")
    void unknownSceneRejected() {
        assertThrows(BusinessException.class, () -> service.read("unknown_scene"));
        assertThrows(BusinessException.class, () -> service.evaluate("unknown_scene", user()));
    }
}
