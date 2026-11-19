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
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.CpmReport;
import com.mftb.admin.entity.CpmReportRevision;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmCommentMapper;
import com.mftb.admin.mapper.CpmReactionMapper;
import com.mftb.admin.mapper.CpmReportMapper;
import com.mftb.admin.mapper.CpmReportReadMapper;
import com.mftb.admin.mapper.CpmReportRevisionMapper;
import com.mftb.admin.util.JsonUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 汇报正式版本测试（阶段三）。
 *
 * <p>钉住四件最容易写坏的事：
 * ① 版本不可变——只有 INSERT，改内容就是加一版而不是覆盖；
 * ② 幂等单元是内容而不是客户端的 key——同内容同说明重复提交不能长出 V3；
 * ③ 修订必须重新聚合，否则「修訂」两个字没有意义（补录的时段进不了新版）；
 * ④ 阶段二遗留的已发布记录不被追认成 V1——那等于凭空造一段没发生过的历史。
 */
class CpmReportRevisionTest {

    private static final SysUser SELF = user(1L, "張偉");
    private static final LocalDate START = LocalDate.of(2026, 11, 16);
    private static final LocalDate END = LocalDate.of(2026, 11, 22);

    private CpmReportRevisionMapper revisionMapper;
    private CpmReportRevisionService revisionService;

    @BeforeEach
    void setUp() {
        revisionMapper = mock(CpmReportRevisionMapper.class);
        revisionService = new CpmReportRevisionService(revisionMapper);
        /*
         * 发布/修订都在事务提交后异步送达，靠 TransactionSynchronization 排队。
         * 纯单测没有真实事务，这里手工激活同步器——不是为了绕过报错，而是让「提交后投递」
         * 这条语义在测试里保持原样：把生产代码改成「没有事务就直接投递」会多出一条
         * 线上永远走不到的分支，而那条分支恰好是最容易重复推送的地方。
         */
        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    private static SysUser user(long id, String name) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setName(name);
        user.setUsername("MF000" + id);
        return user;
    }

    private static CpmDto.Snapshot snapshot(int total, int minutes) {
        CpmDto.Snapshot snapshot = new CpmDto.Snapshot();
        snapshot.setPeriodType("week");
        snapshot.setPeriodStart(START.toString());
        snapshot.setPeriodEnd(END.toString());
        snapshot.getTotals().setTotal(total);
        snapshot.getTotals().setDone(total);
        CpmDto.Snapshot.TimeTotals time = new CpmDto.Snapshot.TimeTotals();
        time.setTotalMinutes(minutes);
        time.setPreciseMinutes(minutes);
        time.setActiveDays(minutes > 0 ? 1 : 0);
        snapshot.setTime(time);
        return snapshot;
    }

    private static CpmReport report(String snapshotJson, String summary, Long revisionPointer) {
        CpmReport report = new CpmReport();
        report.setId(12L);
        report.setUserId(SELF.getId());
        report.setPeriodType("week");
        report.setPeriodStart(START);
        report.setPeriodEnd(END);
        report.setStatus(CpmConstants.REPORT_STATUS_PUBLISHED);
        report.setContentJson(snapshotJson);
        report.setSummary(summary);
        report.setAiSummary(0);
        report.setVersion(1);
        report.setPublishedAt(LocalDateTime.of(2026, 11, 18, 20, 0));
        report.setPublishedRevisionId(revisionPointer);
        return report;
    }

    private static CpmReportRevision revision(int no, String note, Long id) {
        CpmReportRevision row = new CpmReportRevision();
        row.setId(id);
        row.setReportId(12L);
        row.setRevisionNo(no);
        row.setSchemaVersion(2);
        row.setDocumentSnapshot(JsonUtils.toJson(snapshot(3, 90)));
        row.setDigest("摘要");
        row.setAiSummary(0);
        row.setChangeNote(note);
        row.setPublisherUserId(SELF.getId());
        row.setPublisherName(SELF.getName());
        row.setPublisherEmpNo(SELF.getUsername());
        row.setPublishedAt(LocalDateTime.of(2026, 11, 18, 20, 0));
        row.setDraftVersion(1);
        row.setDraftHash("hash");
        row.setRequestKey("key-" + no);
        row.setRequestHash("reqhash");
        return row;
    }

    private CpmReportRevision capturedInsert() {
        ArgumentCaptor<CpmReportRevision> captor = ArgumentCaptor.forClass(CpmReportRevision.class);
        verify(revisionMapper, times(1)).insert(captor.capture());
        return captor.getValue();
    }

    /* ==================== 版本链本身 ==================== */

    @Test
    @DisplayName("首个版本从 V1 起，并冻结发布时的内容摘要与发布人快照")
    void firstRevisionStartsAtV1AndFreezesPublisher() {
        when(revisionMapper.findByRequestKeyForUpdate(eq(12L), anyString())).thenReturn(null);
        when(revisionMapper.maxRevisionNoForUpdate(12L)).thenReturn(0);

        CpmReportRevision row = revisionService.ensureRevision(
                report(JsonUtils.toJson(snapshot(3, 90)), "摘要", null),
                CpmReportRevisionService.FIRST_REVISION_NOTE, LocalDateTime.now(), SELF);

        assertEquals(1, row.getRevisionNo());
        assertEquals(SELF.getName(), row.getPublisherName());
        assertEquals(SELF.getUsername(), row.getPublisherEmpNo(), "工号是快照：员工改名不能改写历史发布记录");
        assertEquals(2, row.getSchemaVersion(), "快照结构版本从冻结内容里读出来，而不是硬编码当下版本");
        assertEquals(40, row.getRequestKey().length(), "派生键要稳定长度，便于唯一键索引");
    }

    @Test
    @DisplayName("同内容同说明的重复提交返回原版本，不长出第二个版本号（超时重发不是新一次修订）")
    void sameContentSameNoteReplaysOriginalRevision() {
        CpmReportRevision existing = revision(2, "補錄時段", 88L);
        String content = JsonUtils.toJson(snapshot(3, 90));
        CpmReport report = report(content, "摘要", 77L);
        // 端口实现里 request_key 是按内容+说明派生的：同一次重发必然命中同一把键
        String hash = revisionService.contentHash(content, "摘要", false);
        when(revisionMapper.findByRequestKeyForUpdate(12L, revisionService.requestKeyOf(12L, hash, "補錄時段")))
                .thenReturn(existing);

        CpmReportRevision result = revisionService.ensureRevision(report, "補錄時段", LocalDateTime.now(), SELF);

        assertEquals(2, result.getRevisionNo());
        verify(revisionMapper, never()).insert(any(CpmReportRevision.class));
    }

    @Test
    @DisplayName("并发修订撞版本号时回读对方那条，而不是抛一个「你失败了」给用户")
    void concurrentInsertReadsBackWinner() {
        String content = JsonUtils.toJson(snapshot(3, 90));
        CpmReport report = report(content, "摘要", 77L);
        String hash = revisionService.contentHash(content, "摘要", false);
        String key = revisionService.requestKeyOf(12L, hash, "修訂二");
        CpmReportRevision won = revision(3, "修訂二", 99L);
        when(revisionMapper.findByRequestKeyForUpdate(12L, key)).thenReturn(null, won);
        when(revisionMapper.maxRevisionNoForUpdate(12L)).thenReturn(2);
        when(revisionMapper.insert(any(CpmReportRevision.class)))
                .thenThrow(new DuplicateKeyException("uk_cpm_revision_no"));

        CpmReportRevision result = revisionService.ensureRevision(report, "修訂二", LocalDateTime.now(), SELF);

        assertEquals(3, result.getRevisionNo());
    }

    @Test
    @DisplayName("内容摘要只由「快照+摘要+AI 标记」决定：换个说明就是另一次修订，改一个字就是新内容")
    void contentHashIsContentOnly() {
        String a = JsonUtils.toJson(snapshot(3, 90));
        String b = JsonUtils.toJson(snapshot(4, 90));
        String hashA = revisionService.contentHash(a, "摘要", false);

        assertEquals(hashA, revisionService.contentHash(a, "摘要", false));
        assertFalse(hashA.equals(revisionService.contentHash(b, "摘要", false)), "条目数变了必须算新内容");
        assertFalse(hashA.equals(revisionService.contentHash(a, "换了摘要", false)));
        assertFalse(hashA.equals(revisionService.contentHash(a, "摘要", true)), "AI 披露标记也是内容的一部分");
    }

    @Test
    @DisplayName("版本列表的「当前版」由指针决定；指针为空时最新一版是当前版，并带出该版条目数")
    void listMarksCurrentByPointer() {
        CpmReportRevision v2 = revision(2, "修訂", 22L);
        CpmReportRevision v1 = revision(1, CpmReportRevisionService.FIRST_REVISION_NOTE, 11L);
        when(revisionMapper.listByReport(12L)).thenReturn(List.of(v2, v1));

        List<CpmDto.RevisionVO> withPointer = revisionService.list(12L, 22L);
        assertEquals(2, withPointer.size());
        assertTrue(withPointer.get(0).getCurrent());
        assertFalse(withPointer.get(1).getCurrent());
        assertEquals(3, withPointer.get(0).getItemDelta());

        // 阶段二遗留：没有指针，最新一版就是当前版（不是「无当前版」那种读不懂的状态）
        List<CpmDto.RevisionVO> withoutPointer = revisionService.list(12L, null);
        assertTrue(withoutPointer.get(0).getCurrent());
        assertFalse(withoutPointer.get(1).getCurrent());
    }

    @Test
    @DisplayName("取不存在的版本号要明确报错，绝不回退到最新版——那会把「看历史」变成「看现在」")
    void missingRevisionDoesNotFallBack() {
        when(revisionMapper.findByNo(12L, 9)).thenReturn(null);

        assertThrows(BusinessException.class, () -> revisionService.require(12L, 9));
    }

    /* ==================== 发布与修订的接线 ==================== */

    private CpmReportService reportService(CpmReportMapper reportMapper, CpmReportReadMapper readMapper,
                                           CpmAccessGuard guard, CpmSnapshotBuilder snapshotBuilder,
                                           CpmReportRevisionService revisionStub, CpmNotifyService notifyService) {
        return new CpmReportService(reportMapper, readMapper, mock(CpmCommentMapper.class),
                mock(CpmReactionMapper.class), snapshotBuilder, periods(), guard,
                mock(CpmRuleService.class), notifyService, revisionStub);
    }

    private static CpmPeriods periods() {
        CpmPeriods periods = new CpmPeriods();
        ReflectionTestUtils.setField(periods, "businessTimezone", "Asia/Shanghai");
        return periods;
    }

    @Test
    @DisplayName("修订重发布必须重新聚合：不重算的「修訂」只是把同一份内容再发一次，补录永远进不了新版")
    void republishRecomputesSnapshot() {
        CpmReportMapper reportMapper = mock(CpmReportMapper.class);
        CpmAccessGuard guard = mock(CpmAccessGuard.class);
        CpmSnapshotBuilder snapshotBuilder = mock(CpmSnapshotBuilder.class);
        CpmReportRevisionService revisionService = mock(CpmReportRevisionService.class);
        CpmNotifyService notifyService = mock(CpmNotifyService.class);
        CpmReportService service = reportService(reportMapper, mock(CpmReportReadMapper.class),
                guard, snapshotBuilder, revisionService, notifyService);

        CpmReport stored = report(JsonUtils.toJson(snapshot(3, 90)), "摘要", 11L);
        stored.setDraftHash(revisionService.contentHash(JsonUtils.toJson(snapshot(3, 90)), "摘要", false));
        when(guard.currentUser()).thenReturn(SELF);
        when(guard.requireOwnedReportForUpdate(12L, SELF)).thenReturn(stored);
        // 新聚合多了一项、多 30 分钟：修订的意义就在这里
        when(snapshotBuilder.build(SELF.getId(), "week", START, END)).thenReturn(snapshot(4, 120));
        when(revisionService.contentHash(anyString(), any(), org.mockito.ArgumentMatchers.anyBoolean()))
                .thenCallRealMethod();
        when(revisionService.ensureRevision(any(), anyString(), any(), any())).thenReturn(revision(2, "補錄", 22L));
        when(reportMapper.applyRevision(anyLong(), anyLong(), anyInt(), anyString(), any(), anyInt(),
                anyString(), anyLong(), any())).thenReturn(1);
        when(reportMapper.selectById(12L)).thenReturn(stored);

        CpmDto.RepublishForm form = new CpmDto.RepublishForm();
        form.setReportId(12L);
        form.setChangeNote("補錄");
        service.republish(form);

        verify(snapshotBuilder).build(SELF.getId(), "week", START, END);
        verify(reportMapper).applyRevision(eq(12L), eq(SELF.getId()), eq(stored.getVersion()),
                anyString(), eq("摘要"), anyInt(), anyString(), eq(22L), any());
    }

    @Test
    @DisplayName("内容没有任何变化时不产生新版本，也不再推送一次（否则版本链会掺进「V2 与 V1 完全一样」）")
    void republishWithUnchangedContentIsNoOp() {
        CpmReportMapper reportMapper = mock(CpmReportMapper.class);
        CpmAccessGuard guard = mock(CpmAccessGuard.class);
        CpmSnapshotBuilder snapshotBuilder = mock(CpmSnapshotBuilder.class);
        CpmReportRevisionService revisionService = mock(CpmReportRevisionService.class);
        CpmNotifyService notifyService = mock(CpmNotifyService.class);
        CpmReportService service = reportService(reportMapper, mock(CpmReportReadMapper.class),
                guard, snapshotBuilder, revisionService, notifyService);

        String content = JsonUtils.toJson(snapshot(3, 90));
        CpmReport stored = report(content, "摘要", 11L);
        String same = "same-hash";
        stored.setDraftHash(same);
        when(guard.currentUser()).thenReturn(SELF);
        when(guard.requireOwnedReportForUpdate(12L, SELF)).thenReturn(stored);
        when(snapshotBuilder.build(SELF.getId(), "week", START, END)).thenReturn(snapshot(3, 90));
        when(revisionService.contentHash(anyString(), any(), org.mockito.ArgumentMatchers.anyBoolean()))
                .thenReturn(same);

        CpmDto.RepublishForm form = new CpmDto.RepublishForm();
        form.setReportId(12L);
        form.setChangeNote("補錄");
        service.republish(form);

        verify(revisionService, never()).ensureRevision(any(), anyString(), any(), any());
        verify(reportMapper, never()).applyRevision(anyLong(), anyLong(), anyInt(), anyString(), any(),
                anyInt(), anyString(), anyLong(), any());
        verify(notifyService, never()).notifyReportPublished(anyLong());
    }

    @Test
    @DisplayName("只有已发布记录能修订；草稿要走发布，两条路各留一条版本链才会不出现「发布了却没版本」")
    void republishRejectsDraft() {
        CpmReportMapper reportMapper = mock(CpmReportMapper.class);
        CpmAccessGuard guard = mock(CpmAccessGuard.class);
        CpmReportService service = reportService(reportMapper, mock(CpmReportReadMapper.class), guard,
                mock(CpmSnapshotBuilder.class), mock(CpmReportRevisionService.class),
                mock(CpmNotifyService.class));
        CpmReport draft = report(JsonUtils.toJson(snapshot(1, 0)), null, null);
        draft.setStatus(CpmConstants.REPORT_STATUS_DRAFT);
        when(guard.currentUser()).thenReturn(SELF);
        when(guard.requireOwnedReportForUpdate(12L, SELF)).thenReturn(draft);

        CpmDto.RepublishForm form = new CpmDto.RepublishForm();
        form.setReportId(12L);
        form.setChangeNote("x");

        BusinessException error = assertThrows(BusinessException.class, () -> service.republish(form));
        assertTrue(error.getMessage().contains("已發布"));
    }

    @Test
    @DisplayName("修订说明必填：没有说明的新版本无法回答「为什么又发一次」，版本链就退化成覆盖")
    void republishRequiresChangeNote() {
        CpmReportMapper reportMapper = mock(CpmReportMapper.class);
        CpmAccessGuard guard = mock(CpmAccessGuard.class);
        CpmReportService service = reportService(reportMapper, mock(CpmReportReadMapper.class), guard,
                mock(CpmSnapshotBuilder.class), mock(CpmReportRevisionService.class),
                mock(CpmNotifyService.class));
        when(guard.currentUser()).thenReturn(SELF);
        when(guard.requireOwnedReportForUpdate(12L, SELF)).thenReturn(report(JsonUtils.toJson(snapshot(1, 0)), null, 11L));

        CpmDto.RepublishForm blank = new CpmDto.RepublishForm();
        blank.setReportId(12L);
        blank.setChangeNote("   ");

        assertThrows(BusinessException.class, () -> service.republish(blank));
    }

    @Test
    @DisplayName("并发修订撞乐观锁：applyRevision 返回 0 行时明确拒绝，不假装发布成功")
    void concurrentRepublishIsRejectedNotSilentlyLost() {
        CpmReportMapper reportMapper = mock(CpmReportMapper.class);
        CpmAccessGuard guard = mock(CpmAccessGuard.class);
        CpmSnapshotBuilder snapshotBuilder = mock(CpmSnapshotBuilder.class);
        CpmReportRevisionService revisionService = mock(CpmReportRevisionService.class);
        CpmReportService service = reportService(reportMapper, mock(CpmReportReadMapper.class), guard,
                snapshotBuilder, revisionService, mock(CpmNotifyService.class));

        CpmReport stored = report(JsonUtils.toJson(snapshot(3, 90)), "摘要", 11L);
        when(guard.currentUser()).thenReturn(SELF);
        when(guard.requireOwnedReportForUpdate(12L, SELF)).thenReturn(stored);
        when(snapshotBuilder.build(SELF.getId(), "week", START, END)).thenReturn(snapshot(4, 120));
        when(revisionService.contentHash(anyString(), any(), org.mockito.ArgumentMatchers.anyBoolean()))
                .thenReturn("new-hash");
        when(revisionService.ensureRevision(any(), anyString(), any(), any())).thenReturn(revision(2, "補錄", 22L));
        when(reportMapper.applyRevision(anyLong(), anyLong(), anyInt(), anyString(), any(), anyInt(),
                anyString(), anyLong(), any())).thenReturn(0);

        CpmDto.RepublishForm form = new CpmDto.RepublishForm();
        form.setReportId(12L);
        form.setChangeNote("補錄");

        assertThrows(BusinessException.class, () -> service.republish(form));
    }

    @Test
    @DisplayName("读历史版本走可读守卫但不登记已读：把翻旧账也算成「已读」，送达统计就开始说谎")
    void revisionViewDoesNotMarkRead() {
        CpmReportMapper reportMapper = mock(CpmReportMapper.class);
        CpmReportReadMapper readMapper = mock(CpmReportReadMapper.class);
        CpmAccessGuard guard = mock(CpmAccessGuard.class);
        CpmReportRevisionService revisionService = mock(CpmReportRevisionService.class);
        CpmReportService service = reportService(reportMapper, readMapper, guard,
                mock(CpmSnapshotBuilder.class), revisionService, mock(CpmNotifyService.class));

        CpmReport stored = report(JsonUtils.toJson(snapshot(3, 90)), "摘要", 11L);
        stored.setUserId(999L);
        when(guard.currentUser()).thenReturn(SELF);
        when(guard.requireReadableReport(12L, SELF)).thenReturn(stored);
        when(revisionService.require(12L, 1)).thenReturn(revision(1, CpmReportRevisionService.FIRST_REVISION_NOTE, 11L));
        when(revisionService.parseSnapshot(any())).thenReturn(snapshot(3, 90));

        CpmDto.ReportVO vo = service.revisionView(12L, 1);

        assertEquals(1, vo.getRevisionNo());
        verify(readMapper, never()).insertIgnore(anyLong(), anyLong());
    }
}
