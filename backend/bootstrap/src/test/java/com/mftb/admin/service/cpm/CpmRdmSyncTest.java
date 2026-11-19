/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.contracts.rdm.RdmTaskProgressSink;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmItemMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.test.util.ReflectionTestUtils;


import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * RDM 进度回写测试（阶段三）。
 *
 * <p>这组用例钉的是那张映射表，而不是"调用有没有发生"。三条最容易被写坏的分支：
 * ① 完成没有交付说明时<b>不能</b>降级成 99% 上报（那会让 RDM 永远不产生完成状态而两边看起来都成功）；
 * ② PRD 任务的 100% 必须先验拒绝，不能等 RDM 报错（同一个动作两侧含义不同）；
 * ③ 已取消/延期一律不回写（RDM 没有对应语义，硬映射等于污染交付真值）。
 * 另外两条系统级：总闸默认关、端口缺席 fail-closed，都不允许把 CPM 自己的写入带下水。
 */
class CpmRdmSyncTest {

    private static final SysUser SELF = user(1L, "張偉");
    private static final long TASK = 9001L;

    private CpmItemMapper itemMapper;
    private RdmTaskProgressSink sink;
    private ObjectProvider<RdmTaskProgressSink> provider;
    private CpmRdmSyncService service;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        itemMapper = mock(CpmItemMapper.class);
        sink = mock(RdmTaskProgressSink.class);
        provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(sink);
        service = new CpmRdmSyncService(itemMapper, provider);
        // 默认口径是关闭的：测试里要显式打开才谈映射，这本身就是第一道断言
        ReflectionTestUtils.setField(service, "syncGloballyEnabled", true);
    }

    private static SysUser user(long id, String name) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setName(name);
        user.setUsername("MF000" + id);
        return user;
    }

    private static CpmItem taskItem(String status, Integer seenProgress, Integer syncEnabled) {
        CpmItem item = new CpmItem();
        item.setId(7L);
        item.setUserId(SELF.getId());
        item.setStatus(status);
        item.setTitle("關聯任務");
        item.setRdmTaskId(TASK);
        item.setRdmSyncEnabled(syncEnabled);
        item.setRdmProgressSeen(seenProgress);
        return item;
    }

    private CpmDto.RdmSyncVO sync(CpmItem item, String status, int progress, String note) {
        return service.syncAfterProgress(item, status, progress, note, SELF);
    }

    private RdmTaskProgressSink.SyncCommand capturedCommand() {
        ArgumentCaptor<RdmTaskProgressSink.SyncCommand> captor =
                ArgumentCaptor.forClass(RdmTaskProgressSink.SyncCommand.class);
        verify(sink).applyProgress(captor.capture());
        return captor.getValue();
    }

    /** 结果落列的断言：回写状态不落到条目列上，界面就无从告诉本人「RDM 那侧到底改没改成」 */
    private void verifyRecorded(String state) {
        verify(itemMapper).updateRdmSyncResult(eq(7L), eq(SELF.getId()), eq(state), anyString(),
                any(), anyString());
    }

    @Test
    @DisplayName("进度 1..99 映射成 progress，并带上上次已知进度做乐观锁基准")
    void progressMapsToProgressActionWithExpectedBaseline() {
        when(sink.applyProgress(any())).thenReturn(RdmTaskProgressSink.SyncResult.success("已同步", 60));

        sync(taskItem(CpmConstants.STATUS_DOING, 40, 1), CpmConstants.STATUS_DOING, 60, "推進中");

        RdmTaskProgressSink.SyncCommand command = capturedCommand();
        assertEquals(TASK, command.taskId());
        assertEquals("progress", command.action());
        assertEquals(60, command.progress());
        assertEquals(40, command.expectedProgress(), "缺了 expectedProgress 就等于允许静默覆盖别人的上报");
        assertEquals(CpmConstants.SYNC_SOURCE, command.sourceSystem());
        verifyRecorded(CpmConstants.SYNC_SUCCESS);
    }

    @Test
    @DisplayName("待办→进行中且进度为 0 映射成 start：开始是开工事实，不夹带进度")
    void zeroProgressDoingMapsToStart() {
        when(sink.applyProgress(any())).thenReturn(RdmTaskProgressSink.SyncResult.success("已同步", 0));

        sync(taskItem(CpmConstants.STATUS_TODO, 0, 1), CpmConstants.STATUS_DOING, 0, null);

        assertEquals("start", capturedCommand().action());
    }

    @Test
    @DisplayName("受阻→进行中映射成 unblock：不清阻塞标记的话任务会永远停在阻塞态")
    void unblockFromBlockedToDoing() {
        when(sink.applyProgress(any())).thenReturn(RdmTaskProgressSink.SyncResult.success("已同步", 20));

        sync(taskItem(CpmConstants.STATUS_BLOCKED, 20, 1), CpmConstants.STATUS_DOING, 20, "已解除");

        assertEquals("unblock", capturedCommand().action());
    }

    @Test
    @DisplayName("完成映射成 done 且必须带交付说明；缺说明时拒绝回写，绝不降级成 99% 上报")
    void doneRequiresDeliveryNoteAndNeverDowngrades() {
        when(sink.applyProgress(any())).thenReturn(RdmTaskProgressSink.SyncResult.success("已同步", 100));

        CpmDto.RdmSyncVO done = sync(taskItem(CpmConstants.STATUS_DOING, 80, 1),
                CpmConstants.STATUS_DONE, 100, "交付說明：灰度已通過");
        assertEquals("done", capturedCommand().action());
        assertEquals("交付說明：灰度已通過", capturedCommand().remark());
        assertEquals(CpmConstants.SYNC_SUCCESS, done.getState());

        // 同一条目再说一次「完成了」但不给说明：必须拒绝，而不是偷偷报 99%
        CpmDto.RdmSyncVO rejected = sync(taskItem(CpmConstants.STATUS_DOING, 80, 1),
                CpmConstants.STATUS_DONE, 100, "   ");
        assertEquals(CpmConstants.SYNC_REJECTED, rejected.getState());
        assertTrue(rejected.getMessage().contains("交付說明"), "拒绝理由要指向那条缺失的说明");
        verify(sink, org.mockito.Mockito.times(1)).applyProgress(any());
    }

    @Test
    @DisplayName("标记阻塞必须给原因；原因文案原样回显而不另编一句更好听的")
    void blockRequiresReason() {
        CpmDto.RdmSyncVO withoutReason = sync(taskItem(CpmConstants.STATUS_DOING, 30, 1),
                CpmConstants.STATUS_BLOCKED, 30, null);
        assertEquals(CpmConstants.SYNC_REJECTED, withoutReason.getState());

        when(sink.applyProgress(any())).thenReturn(RdmTaskProgressSink.SyncResult.success("已同步", 30));
        CpmDto.RdmSyncVO withReason = sync(taskItem(CpmConstants.STATUS_DOING, 30, 1),
                CpmConstants.STATUS_BLOCKED, 30, "等上游接口");
        assertEquals("block", capturedCommand().action());
        assertEquals("等上游接口", capturedCommand().remark());
        assertEquals(CpmConstants.SYNC_SUCCESS, withReason.getState());
    }

    @Test
    @DisplayName("已取消与延期一律不回写：RDM 没有对应语义，硬映射等于污染交付真值")
    void cancelledAndDeferredNeverWritten() {
        CpmDto.RdmSyncVO cancelled = sync(taskItem(CpmConstants.STATUS_DOING, 50, 1),
                CpmConstants.STATUS_CANCELLED, 50, "需求撤了");
        assertEquals(CpmConstants.SYNC_REJECTED, cancelled.getState());

        CpmDto.RdmSyncVO deferred = sync(taskItem(CpmConstants.STATUS_DOING, 50, 1),
                CpmConstants.STATUS_DEFERRED, 50, "改到下期");
        assertEquals(CpmConstants.SYNC_REJECTED, deferred.getState());

        verify(sink, never()).applyProgress(any());
    }

    @Test
    @DisplayName("PRD 任务报 100%：由 RDM 自己以「提交評審」拒绝，原文如实回显（导入时界面已预先标出 PRD 任務）")
    void prdTaskHundredPercentEchoesRdmReason() {
        when(sink.applyProgress(any())).thenReturn(RdmTaskProgressSink.SyncResult.of(
                CpmConstants.SYNC_REJECTED, "PRD 任務的 100% 以「提交評審」為準，請在需求詳情提交評審", 80));

        CpmDto.RdmSyncVO result = sync(taskItem(CpmConstants.STATUS_DOING, 80, 1),
                CpmConstants.STATUS_DONE, 100, "PRD 寫完了");

        assertEquals(CpmConstants.SYNC_REJECTED, result.getState());
        assertTrue(result.getMessage().contains("提交"), "要给出唯一正确的出路");
        // 不额外 probe 一次：RDM 的写入口本来就带全部规则，多读一次只是把一个请求拆成两个
        assertEquals("done", capturedCommand().action());
    }

    @Test
    @DisplayName("RDM 返回 409 冲突时落 conflict 并带回对方当前进度，界面才有「重新對齊」的依据")
    void conflictKeepsRdmSideProgress() {
        when(sink.applyProgress(any())).thenReturn(
                RdmTaskProgressSink.SyncResult.of(CpmConstants.SYNC_CONFLICT, "任務進度已被他人修改", 55));

        CpmDto.RdmSyncVO result = sync(taskItem(CpmConstants.STATUS_DOING, 40, 1),
                CpmConstants.STATUS_DOING, 60, "推进");

        assertEquals(CpmConstants.SYNC_CONFLICT, result.getState());
        assertEquals(55, result.getRdmProgress());
        verify(itemMapper).updateRdmSyncResult(7L, SELF.getId(), CpmConstants.SYNC_CONFLICT,
                "任務進度已被他人修改", 55, SELF.getName());
    }

    @Test
    @DisplayName("端口无实现时 fail-closed：不回写、如实说明，且绝不让 CPM 侧的进度写入失败")
    void absentPortFailsClosed() {
        when(provider.getIfAvailable()).thenReturn(null);

        CpmDto.RdmSyncVO result = sync(taskItem(CpmConstants.STATUS_DOING, 10, 1),
                CpmConstants.STATUS_DOING, 30, "推進");

        assertEquals(CpmConstants.SYNC_REJECTED, result.getState());
        assertTrue(result.getMessage().contains("RDM"));
    }

    @Test
    @DisplayName("回写侧抛运行时异常只影响状态列：工作记录已经写成功，不能被交付侧故障拖回滚")
    void sinkRuntimeErrorDoesNotBreakCpm() {
        when(sink.applyProgress(any())).thenThrow(new IllegalStateException("内部 SQL 細節不可外洩"));

        CpmDto.RdmSyncVO result = sync(taskItem(CpmConstants.STATUS_DOING, 10, 1),
                CpmConstants.STATUS_DOING, 30, "推進");

        assertEquals(CpmConstants.SYNC_ERROR, result.getState());
        // 给用户的文案里不得出现堆栈/SQL/内部路径
        assertTrue(!result.getMessage().contains("SQL"), "异常原文不能直接甩给用户");
    }

    @Test
    @DisplayName("总闸关闭：一句都不写 RDM，条目状态留 pending 并说明是系统未开启而不是失败")
    void globalSwitchOffWritesNothing() {
        ReflectionTestUtils.setField(service, "syncGloballyEnabled", false);

        CpmDto.RdmSyncVO result = sync(taskItem(CpmConstants.STATUS_DOING, 10, 1),
                CpmConstants.STATUS_DOING, 30, "推進");

        assertEquals(CpmConstants.SYNC_PENDING, result.getState());
        assertTrue(result.getMessage().contains("cpm.rdm-sync-enabled"));
        verify(sink, never()).applyProgress(any());
        verify(itemMapper, never()).updateRdmSyncResult(anyLong(), anyLong(), anyString(), anyString(),
                any(), anyString());
    }

    @Test
    @DisplayName("条目级开关关闭：保留关联关系但不推送，重新打开即可继续对齐")
    void itemSwitchOffWritesNothing() {
        CpmDto.RdmSyncVO result = sync(taskItem(CpmConstants.STATUS_DOING, 10, 0),
                CpmConstants.STATUS_DOING, 30, "推進");

        assertEquals(CpmConstants.SYNC_PENDING, result.getState());
        verify(sink, never()).applyProgress(any());
    }

    @Test
    @DisplayName("没有任务级关联的条目直接跳过：手工/会议/需求级关联不该出现回写徽标")
    void nonTaskSourceIsSkipped() {
        CpmItem manual = taskItem(CpmConstants.STATUS_DOING, 10, 1);
        manual.setRdmTaskId(null);

        assertNull(sync(manual, CpmConstants.STATUS_DOING, 30, "x"));
        verify(sink, never()).applyProgress(any());
    }

    @Test
    @DisplayName("重新對齊只刷新本地基准，不推送本地值——后者等于关掉 RDM 的乐观锁")
    void realignPullsInsteadOfPushing() {
        CpmItem item = taskItem(CpmConstants.STATUS_DOING, 40, 1);
        when(itemMapper.selectAliveById(7L)).thenReturn(item);
        when(sink.probe(TASK)).thenReturn(new RdmTaskProgressSink.TaskSnapshot(true, 65, "doing", false));

        CpmDto.RdmSyncVO result = service.realign(7L, SELF);

        assertEquals(CpmConstants.SYNC_SUCCESS, result.getState());
        assertEquals(65, result.getRdmProgress());
        verify(sink, never()).applyProgress(any());
        verify(itemMapper).updateRdmSyncResult(eq(7L), eq(SELF.getId()), eq(CpmConstants.SYNC_SUCCESS),
                anyString(), eq(65), anyString());
    }

    @Test
    @DisplayName("重新對齊时任务已不存在：给出「無法對齊」而不是抛一个看不懂的约束错误")
    void realignWhenTaskGone() {
        CpmItem item = taskItem(CpmConstants.STATUS_DOING, 40, 1);
        when(itemMapper.selectAliveById(7L)).thenReturn(item);
        when(sink.probe(TASK)).thenReturn(RdmTaskProgressSink.TaskSnapshot.missing());

        assertEquals(CpmConstants.SYNC_REJECTED, service.realign(7L, SELF).getState());
    }

    @Test
    @DisplayName("重新對齊只对自己的条目生效：别人的记录直接拒绝")
    void realignRejectsForeignItem() {
        CpmItem other = taskItem(CpmConstants.STATUS_DOING, 40, 1);
        other.setUserId(999L);
        when(itemMapper.selectAliveById(7L)).thenReturn(other);

        assertThrows(BusinessException.class, () -> service.realign(7L, SELF));
        verify(itemMapper, never()).updateRdmSyncResult(anyLong(), anyLong(), anyString(), isNull(),
                any(), anyString());
    }

    @Test
    @DisplayName("开关切换保留 taskId：关掉再打开时关联关系不该丢")
    void toggleKeepsBinding() {
        service.setEnabled(7L, false, SELF);
        verify(itemMapper).updateRdmSyncEnabled(7L, SELF.getId(), 0, SELF.getName());

        service.setEnabled(7L, true, SELF);
        verify(itemMapper).updateRdmSyncEnabled(7L, SELF.getId(), 1, SELF.getName());
    }

    @Test
    @DisplayName("说明文案超过列宽时截断而不是让写库报 1406：一条 RDM 拒绝理由不该拖挂整个保存")
    void longMessageIsTruncated() {
        String longMessage = "R".repeat(CpmConstants.SYNC_MESSAGE_MAX + 300);
        when(sink.applyProgress(any())).thenReturn(
                RdmTaskProgressSink.SyncResult.of(CpmConstants.SYNC_REJECTED, longMessage, 20));

        CpmDto.RdmSyncVO result = sync(taskItem(CpmConstants.STATUS_DOING, 10, 1),
                CpmConstants.STATUS_DOING, 30, "x");

        assertEquals(CpmConstants.SYNC_MESSAGE_MAX, result.getMessage().length());
        verify(itemMapper).updateRdmSyncResult(eq(7L), eq(SELF.getId()), eq(CpmConstants.SYNC_REJECTED),
                eq(result.getMessage()), eq(20), anyString());
    }
}
