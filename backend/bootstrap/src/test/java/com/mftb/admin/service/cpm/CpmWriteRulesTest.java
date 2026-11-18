/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.client.LlmHttpClient;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.CpmAiExtraction;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.CpmPushRecord;
import com.mftb.admin.entity.CpmRecognition;
import com.mftb.admin.entity.CpmReport;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmAiExtractionMapper;
import com.mftb.admin.mapper.CpmCommentMapper;
import com.mftb.admin.mapper.CpmItemMapper;
import com.mftb.admin.mapper.CpmItemUpdateMapper;
import com.mftb.admin.mapper.CpmPushRecordMapper;
import com.mftb.admin.mapper.CpmReactionMapper;
import com.mftb.admin.mapper.CpmRecognitionMapper;
import com.mftb.admin.mapper.CpmReportMapper;
import com.mftb.admin.mapper.CpmReportReadMapper;
import com.mftb.admin.mapper.CpmRuleMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.DingTalkService;
import com.mftb.admin.service.agent.AiModelAdmissionService;
import com.mftb.admin.service.agent.AiOutboundPolicyService;
import com.mftb.admin.service.agent.AiSceneService;
import com.mftb.admin.service.agent.BudgetReservationService;
import com.mftb.admin.service.agent.LlmChannelRouter;
import com.mftb.admin.service.agent.LlmMeteringService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.List;
import java.util.HexFormat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 并发与幂等口径测试（方案 §十三）：乐观锁、已读回执唯一、推送同日去重、dry-run 零出站、
 * requestKey 幂等。四条都是「重复点击/重复投递会不会造成第二份事实」的问题，
 * 这些缺陷在界面上一切正常，只有把桩钉在这里才会暴露。
 */
class CpmWriteRulesTest {

    private static final SysUser SELF = user(2L, "張偉");
    private static final SysUser BOSS = user(1L, "劉總");

    private static SysUser user(long id, String name) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setName(name);
        u.setStatus(1);
        return u;
    }

    private static String sha256(String value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
    }

    private static CpmItem item(long id, int version) {
        CpmItem item = new CpmItem();
        item.setId(id);
        item.setUserId(SELF.getId());
        item.setTitle("既有事項");
        item.setCategory("general");
        item.setStatus("doing");
        item.setProgress(40);
        item.setWorkDate(LocalDate.of(2026, 11, 18));
        item.setVersion(version);
        item.setDeleted(0);
        return item;
    }

    /* ==================== 乐观锁 ==================== */

    @Test
    @DisplayName("条目更新带旧版本：条件更新零行受影响即拒绝，不覆盖他人已写入的内容")
    void staleVersionUpdateIsRejected() {
        CpmItemMapper itemMapper = mock(CpmItemMapper.class);
        CpmItemUpdateMapper updateMapper = mock(CpmItemUpdateMapper.class);
        recognitionMapper = mock(CpmRecognitionMapper.class);
        CpmTemplateService templateService = mock(CpmTemplateService.class);
        CpmPeriods periods = mock(CpmPeriods.class);
        CpmAccessGuard guard = mock(CpmAccessGuard.class);
        when(guard.currentUser()).thenReturn(SELF);
        when(guard.requireOwnedItem(7L, SELF)).thenReturn(item(7L, 3));
        when(itemMapper.updateOwnedVersioned(anyLong(), anyLong(), anyInt(), any(), any(), any(),
                any(), any(), any(), any(), any())).thenReturn(0);
        CpmItemService service = new CpmItemService(itemMapper, updateMapper, recognitionMapper,
                templateService, periods, guard);

        CpmDto.ItemForm form = new CpmDto.ItemForm();
        form.setTitle("改后的标题");
        form.setVersion(2);

        assertThrows(BusinessException.class, () -> service.update(7L, form));
        // 冲突后不得再读回一份"看起来成功"的数据
        verify(itemMapper, never()).selectAliveById(anyLong());
    }

    /* ==================== 审计列（真实 500 复盘） ==================== */

    @Test
    @DisplayName("条目落库必须自带 created_by/updated_by：全局填充器只填时间，留 NULL 直接撞 NOT NULL")
    void itemInsertStampsAuditColumns() {
        CpmItemMapper itemMapper = mock(CpmItemMapper.class);
        CpmAccessGuard guard = mock(CpmAccessGuard.class);
        when(guard.currentUser()).thenReturn(SELF);
        CpmTemplateService templateService = mock(CpmTemplateService.class);
        when(templateService.enabledTemplates()).thenReturn(List.of());
        // MP 回填自增主键，桩必须模拟：create() 之后还要用 id 写首条流水
        when(itemMapper.insert(any(CpmItem.class))).thenAnswer(inv -> {
            CpmItem e = inv.getArgument(0);
            e.setId(1L);
            return 1;
        });
        CpmItemService service = new CpmItemService(itemMapper, mock(CpmItemUpdateMapper.class),
                mock(CpmRecognitionMapper.class), templateService, mock(CpmPeriods.class), guard);

        CpmDto.ItemForm form = new CpmDto.ItemForm();
        form.setTitle("一句回车即存");
        form.setCategory("general");
        form.setStatus("doing");
        service.create(form);

        ArgumentCaptor<CpmItem> captor = ArgumentCaptor.forClass(CpmItem.class);
        verify(itemMapper).insert(captor.capture());
        CpmItem saved = captor.getValue();
        assertEquals(SELF.getName(), saved.getCreatedBy(), "创建人留空=审计链断，操作记录页查不到是谁写的");
        assertEquals(SELF.getName(), saved.getUpdatedBy());
    }

    @Test
    @DisplayName("规则读取分两条路：HTTP 侧要登录态，调度侧不得要（否则催办扫描每小时静默失败）")
    void ruleReadHasSchedulerSafePath() {
        CpmRuleMapper ruleMapper = mock(CpmRuleMapper.class);
        CpmAccessGuard guard = mock(CpmAccessGuard.class);
        when(guard.currentUser()).thenThrow(new BusinessException("登錄狀態失效，請重新登錄"));
        when(ruleMapper.findDefault()).thenReturn(null);
        CpmRuleService service = new CpmRuleService(ruleMapper, mock(SysUserMapper.class),
                mock(OperatorResolver.class), guard);

        assertThrows(BusinessException.class, service::read);
        CpmDto.RuleVO schedulerView = service.readForScheduler();
        assertEquals(Boolean.TRUE, schedulerView.getEnabled());
        assertEquals(5, schedulerView.getDeadlineDay());
    }

    @Test
    @DisplayName("工时随进度写入：合法值落库、越界值拒绝，且不动乐观锁版本")
    void progressWorkHoursValidated() {
        CpmItemMapper itemMapper = mock(CpmItemMapper.class);
        CpmAccessGuard guard = mock(CpmAccessGuard.class);
        when(guard.currentUser()).thenReturn(SELF);
        when(guard.requireOwnedItem(7L, SELF)).thenReturn(item(7L, 3));
        CpmItemService service = new CpmItemService(itemMapper, mock(CpmItemUpdateMapper.class),
                mock(CpmRecognitionMapper.class), mock(CpmTemplateService.class), mock(CpmPeriods.class), guard);

        CpmDto.ProgressForm ok = new CpmDto.ProgressForm();
        ok.setProgress(60);
        ok.setStatus("doing");
        ok.setWorkHours(new java.math.BigDecimal("2.0"));
        service.addProgress(7L, ok);
        verify(itemMapper).updateWorkHoursOwned(7L, SELF.getId(), new java.math.BigDecimal("2.0"), SELF.getName());

        CpmDto.ProgressForm tooBig = new CpmDto.ProgressForm();
        tooBig.setProgress(60);
        tooBig.setStatus("doing");
        tooBig.setWorkHours(new java.math.BigDecimal("999.9"));
        assertThrows(BusinessException.class, () -> service.addProgress(7L, tooBig));
        // 拒绝的那一次不得已经写进去（校验在写之前）
        verify(itemMapper, org.mockito.Mockito.times(1)).updateWorkHoursOwned(anyLong(), anyLong(), any(), any());
    }

    /* ==================== 已读回执 ==================== */

    @Test
    @DisplayName("上级打开汇报登记已读；本人打开自己不登记（自己读自己不算送达证据）")
    void readReceiptOnlyForNonOwner() {
        CpmReportMapper reportMapper = mock(CpmReportMapper.class);
        CpmReportReadMapper readMapper = mock(CpmReportReadMapper.class);
        CpmCommentMapper commentMapper = mock(CpmCommentMapper.class);
        CpmReactionMapper reactionMapper = mock(CpmReactionMapper.class);
        CpmSnapshotBuilder snapshotBuilder = mock(CpmSnapshotBuilder.class);
        CpmPeriods periods = mock(CpmPeriods.class);
        CpmAccessGuard guard = mock(CpmAccessGuard.class);
        CpmRuleService ruleService = mock(CpmRuleService.class);
        CpmNotifyService notifyService = mock(CpmNotifyService.class);
        CpmReportService service = new CpmReportService(reportMapper, readMapper, commentMapper,
                reactionMapper, snapshotBuilder, periods, guard, ruleService, notifyService);

        CpmReport report = new CpmReport();
        report.setId(12L);
        report.setUserId(SELF.getId());
        report.setPeriodType("week");
        report.setPeriodStart(LocalDate.of(2026, 11, 16));
        report.setPeriodEnd(LocalDate.of(2026, 11, 22));
        report.setStatus(CpmConstants.REPORT_STATUS_PUBLISHED);
        report.setVersion(0);
        when(guard.currentUser()).thenReturn(BOSS);
        when(guard.requireReadableReport(12L, BOSS)).thenReturn(report);
        when(guard.userById(SELF.getId())).thenReturn(SELF);

        service.detail(12L);
        verify(readMapper).insertIgnore(12L, BOSS.getId());

        // 本人查看自己的汇报：同一条回执口径不能把自己算进已读数
        when(guard.currentUser()).thenReturn(SELF);
        when(guard.requireReadableReport(12L, SELF)).thenReturn(report);
        service.detail(12L);
        verify(readMapper).insertIgnore(12L, BOSS.getId());
    }

    /* ==================== 推送同日去重与 dry-run ==================== */

    private CpmPushRecordMapper pushMapper;
    private CpmRecognitionMapper recognitionMapper;
    private DingTalkService dingTalkService;
    private CpmRuleService notifyRuleService;
    private CpmNotifyService notifyService;

    private void setUpNotify(boolean dryRun) {
        pushMapper = mock(CpmPushRecordMapper.class);
        CpmReportMapper reportMapper = mock(CpmReportMapper.class);
        recognitionMapper = mock(CpmRecognitionMapper.class);
        SysUserMapper userMapper = mock(SysUserMapper.class);
        notifyRuleService = mock(CpmRuleService.class);
        dingTalkService = mock(DingTalkService.class);
        notifyService = new CpmNotifyService(pushMapper, reportMapper, recognitionMapper,
                userMapper, notifyRuleService, dingTalkService);
        ReflectionTestUtils.setField(notifyService, "dryRun", dryRun);
        ReflectionTestUtils.setField(notifyService, "portalBaseUrl", "https://portal.example");
    }

    private CpmPushRecord queued(long id, long receiverId) {
        CpmPushRecord record = new CpmPushRecord();
        record.setId(id);
        record.setUserId(receiverId);
        record.setEventType(CpmConstants.SCENARIO_REPORT_DEADLINE_REMIND);
        record.setPeriodStart(LocalDate.of(2026, 11, 16));
        record.setStatus(CpmPushRecord.STATUS_QUEUED);
        return record;
    }

    @Test
    @DisplayName("催办：claimSlot 返回 0（同日已占位）即整条链路静默，不重复投递")
    void duplicateReminderIsSkippedByClaim() {
        setUpNotify(false);
        when(pushMapper.claimSlot(anyString(), anyLong(), any(), any())).thenReturn(0);

        notifyService.remindDeadline(SELF.getId(), LocalDate.of(2026, 11, 16), "本週尚未發布匯報。");

        verify(pushMapper, never()).selectOne(any());
        verify(pushMapper, never()).finishQueued(anyLong(), anyString(), any());
        verify(dingTalkService, never()).sendMarkdown(anyString(), anyString(), any(), anyBoolean());
    }

    @Test
    @DisplayName("dry-run：只把占位记录标成 skipped，绝不触发真实钉钉出站")
    void dryRunNeverHitsRealChannel() {
        setUpNotify(true);
        when(pushMapper.claimSlot(anyString(), anyLong(), any(), any())).thenReturn(1);
        when(pushMapper.selectOne(any())).thenReturn(queued(9L, SELF.getId()));

        notifyService.remindDeadline(SELF.getId(), LocalDate.of(2026, 11, 16), "本週尚未發布匯報。");

        verify(pushMapper).finishQueued(9L, CpmPushRecord.STATUS_SKIPPED, "dry-run");
        verify(dingTalkService, never()).sendMarkdown(anyString(), anyString(), any(), anyBoolean());
    }

    /* ==================== AI requestKey 幂等 ==================== */

    private CpmAiExtractionMapper extractionMapper;
    private LlmHttpClient llmClient;
    private CpmAiService aiService;

    private void setUpAi() throws Exception {
        extractionMapper = mock(CpmAiExtractionMapper.class);
        CpmItemMapper itemMapper = mock(CpmItemMapper.class);
        CpmAiPrompt prompt = mock(CpmAiPrompt.class);
        CpmItemService itemService = mock(CpmItemService.class);
        CpmSnapshotBuilder snapshotBuilder = mock(CpmSnapshotBuilder.class);
        CpmAccessGuard guard = mock(CpmAccessGuard.class);
        AiSceneService sceneService = mock(AiSceneService.class);
        AiModelAdmissionService admissionService = mock(AiModelAdmissionService.class);
        AiOutboundPolicyService outboundPolicyService = mock(AiOutboundPolicyService.class);
        LlmChannelRouter channelRouter = mock(LlmChannelRouter.class);
        llmClient = mock(LlmHttpClient.class);
        LlmMeteringService metering = mock(LlmMeteringService.class);
        BudgetReservationService budgetService = mock(BudgetReservationService.class);
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        CpmPeriods periods = mock(CpmPeriods.class);
        when(guard.currentUser()).thenReturn(SELF);
        // 管理员分支跳过场景执行断言，本用例只关心 requestKey 幂等这一段
        when(operatorResolver.isAdmin(SELF)).thenReturn(true);
        aiService = new CpmAiService(extractionMapper, itemMapper, prompt, itemService, snapshotBuilder,
                guard, sceneService, admissionService, outboundPolicyService, channelRouter, llmClient,
                metering, budgetService, operatorResolver, periods);
    }

    private static CpmDto.AiExtractionForm aiForm(String rawText) {
        CpmDto.AiExtractionForm form = new CpmDto.AiExtractionForm();
        form.setRequestKey("cpm-key-1");
        form.setRawText(rawText);
        return form;
    }

    @Test
    @DisplayName("requestKey 幂等：同键同原文返回原台账，不再调模型、不再插行")
    void sameKeySameHashReplaysLedger() throws Exception {
        setUpAi();
        CpmAiExtraction replay = new CpmAiExtraction();
        replay.setRequestKey("cpm-key-1");
        replay.setStatus(CpmAiExtraction.STATUS_SUCCEEDED);
        replay.setInputHash(sha256("上午完成XX評審"));
        replay.setPromptVersion(CpmAiPrompt.PROMPT_VERSION);
        replay.setSchemaVersion(CpmAiPrompt.SCHEMA_VERSION);
        replay.setResultJson("{\"candidates\":[],\"summary\":\"既有結果\"}");
        when(extractionMapper.findByRequest("cpm-key-1")).thenReturn(replay);

        CpmDto.AiExtractionVO vo = aiService.extract(aiForm("上午完成XX評審"));

        assertEquals("cpm-key-1", vo.getRequestKey());
        verify(extractionMapper, never()).insert(any(CpmAiExtraction.class));
        verify(llmClient, never()).chatCompletion(any(), any(), any());
    }

    @Test
    @DisplayName("requestKey 幂等：同键换原文必须拒绝（重试不得偷换内容二次扣费）")
    void sameKeyDifferentHashIsRejected() throws Exception {
        setUpAi();
        CpmAiExtraction replay = new CpmAiExtraction();
        replay.setRequestKey("cpm-key-1");
        replay.setStatus(CpmAiExtraction.STATUS_SUCCEEDED);
        replay.setInputHash(sha256("原本的原文"));
        when(extractionMapper.findByRequest("cpm-key-1")).thenReturn(replay);

        assertThrows(BusinessException.class, () -> aiService.extract(aiForm("换了另一段原文")));
        verify(extractionMapper, never()).insert(any(CpmAiExtraction.class));
    }

    @Test
    @DisplayName("认定通知：被认定人缺失时静默返回，不占推送名额")
    void recognitionWithoutTargetSkipsClaim() {
        setUpNotify(true);
        CpmRecognition blank = new CpmRecognition();
        blank.setId(1L);
        when(recognitionMapper.selectById(1L)).thenReturn(blank);

        notifyService.notifyRecognition(1L);

        verify(pushMapper, never()).claimSlot(anyString(), anyLong(), any(), any());
    }

    @Test
    @DisplayName("个人推送开关关闭：已占位的记录标 skipped，同样不出站")
    void personalPushOffMarksSkipped() {
        setUpNotify(false);
        when(pushMapper.claimSlot(anyString(), anyLong(), any(), any())).thenReturn(1);
        when(pushMapper.selectOne(any())).thenReturn(queued(9L, SELF.getId()));
        when(notifyRuleService.personalPushEnabled()).thenReturn(false);

        notifyService.remindDeadline(SELF.getId(), LocalDate.of(2026, 11, 16), "提醒正文");

        verify(pushMapper).finishQueued(9L, CpmPushRecord.STATUS_SKIPPED, "personal push off");
        verify(dingTalkService, never()).sendMarkdown(anyString(), anyString(), any(), anyBoolean());
    }
}
