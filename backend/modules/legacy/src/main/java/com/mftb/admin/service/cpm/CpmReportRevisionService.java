/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.CpmReport;
import com.mftb.admin.entity.CpmReportRevision;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmReportRevisionMapper;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * 汇报正式版本服务（阶段三）。
 *
 * <p><b>版本是不可变的</b>：本类没有任何 update 语句，也不提供「删除某个版本」。
 * 已发出的钉钉卡片链接指向的就是当时那一版，覆盖或删掉它会让「他收到的是什么」
 * 变成不可回答的问题——纪要有同样的表正是为此。
 *
 * <p><b>幂等单元是内容而不是客户端的 key</b>：一次修订重发布该不该产生新版本，
 * 取决于「内容 + 修订说明」有没有变化。让前端传 requestKey 会把这件事变成客户端的责任，
 * 而前端每次生成一个新 key 是最常见的写法，结果是同一份内容长出 V3/V4。
 * 这里由服务端按 (reportId, 内容摘要, 说明) 派生 key，超时重发命中唯一键即回原版本。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CpmReportRevisionService {

    /** V1 的修订说明固定值：它不是「用户写的」，而是「首次发布」这一事实本身 */
    public static final String FIRST_REVISION_NOTE = "首次發布";

    /*
     * 阶段二遗留的已发布汇报（published_revision_id 为 NULL）<b>不补建版本行</b>：
     * 那批内容只有 content_json 一份证据，事后补一条「V1 + 首次發布 + 现在的时间」
     * 等于凭空造一段没有发生过的历史。界面把它们如实标成「歷史發送快照」，这才说得通。
     */

    private static final DateTimeFormatter DISPLAY = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final CpmReportRevisionMapper revisionMapper;

    /**
     * 内容摘要。与 {@code biz_cpm_report.draft_hash} 必须同算法同拼法，
     * 两处不一致的后果是「存在未發布變更」永远显示或永远不显示——两种都比不显示更糟。
     */
    public String contentHash(String snapshotJson, String summary, boolean aiSummary) {
        return sha256(nullToEmpty(snapshotJson) + '|' + nullToEmpty(summary) + '|' + (aiSummary ? 1 : 0));
    }

    /** 幂等键派生：同内容同说明 → 同键；命中 uk_cpm_revision_request 即视为重发而非新版本。 */
    String requestKeyOf(long reportId, String hash, String changeNote) {
        return sha256(reportId + '|' + hash + '|' + nullToEmpty(changeNote)).substring(0, 40);
    }

    /* ==================== 写 ==================== */

    /**
     * 为一个汇报补齐版本链并返回当前版本号。
     *
     * <p>三种入口共用：首次发布、修订重发布、阶段二遗留的已发布记录补建。
     * 遗留记录没有版本行，界面必须说「舊發布補建立項」而不是伪造发布时间。
     *
     * @param report      已处于 published 状态的汇报（content_json 已是本次冻结的快照）
     * @param changeNote  修订说明；首次发布固定为「首次發布」
     * @param publishedAt 本次发布时间（补建时传记录的 published_at）
     * @return 本次生效的版本行；内容未变化时返回已存在的同内容版本
     */
    public CpmReportRevision ensureRevision(CpmReport report, String changeNote, LocalDateTime publishedAt, SysUser current) {
        String hash = contentHash(report.getContentJson(), report.getSummary(),
                Integer.valueOf(1).equals(report.getAiSummary()));
        String note = normalizeNote(changeNote);
        String key = requestKeyOf(report.getId(), hash, note);

        // 两处都走当前读（FOR UPDATE）：调用方已持有汇报行锁，读视图却可能是加锁之前建立的旧快照，
        // 用普通 SELECT 会看不见并发者刚提交的版本，于是同一说明长出 V3（幂等失效）。
        CpmReportRevision replay = revisionMapper.findByRequestKeyForUpdate(report.getId(), key);
        if (replay != null) {
            // 幂等重放：内容没变且说明相同，就是同一次发布的重试，绝不能长出第二个版本号
            return replay;
        }
        int next = revisionMapper.maxRevisionNoForUpdate(report.getId()) + 1;
        CpmReportRevision row = new CpmReportRevision();
        row.setReportId(report.getId());
        row.setRevisionNo(next);
        row.setSchemaVersion(schemaVersionOf(report.getContentJson()));
        row.setDocumentSnapshot(report.getContentJson());
        row.setDigest(trimTo(report.getSummary(), 2000));
        row.setAiSummary(Integer.valueOf(1).equals(report.getAiSummary()) ? 1 : 0);
        row.setChangeNote(note);
        row.setPublisherUserId(current.getId());
        row.setPublisherName(nullToEmpty(current.getName()));
        row.setPublisherEmpNo(nullToEmpty(current.getUsername()));
        row.setPublishedAt(publishedAt == null ? LocalDateTime.now() : publishedAt);
        row.setDraftVersion(report.getVersion() == null ? 0 : report.getVersion());
        row.setDraftHash(hash);
        row.setRequestKey(key);
        row.setRequestHash(sha256(row.getPublisherEmpNo() + '|' + note));
        row.setCreatedBy(current.getName());
        row.setUpdatedBy(current.getName());
        try {
            revisionMapper.insert(row);
        } catch (DuplicateKeyException e) {
            /*
             * 并发修订会撞 uk_cpm_revision_no：另一条已经落了版本，这里回读那一条而不是抛错。
             * 「两次点击长出两个 V2」比「第二次点击失败」糟得多——版本链出现断层后无法解释。
             */
            CpmReportRevision existing = revisionMapper.findByRequestKeyForUpdate(report.getId(), key);
            if (existing == null) {
                throw new BusinessException("本次修訂已並發產生新版本，請刷新後查看");
            }
            return existing;
        }
        log.info("CPM 汇报版本落库: reportId={} revisionNo={} note={}", report.getId(), row.getRevisionNo(), note);
        return row;
    }

    /* ==================== 读 ==================== */

    /** 版本列表（倒序）；currentRevisionNo 由汇报行的 published_revision_id 决定。 */
    public List<CpmDto.RevisionVO> list(long reportId, Long currentRevisionId) {
        List<CpmReportRevision> rows = revisionMapper.listByReport(reportId);
        List<CpmDto.RevisionVO> list = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            CpmReportRevision row = rows.get(i);
            CpmDto.RevisionVO vo = new CpmDto.RevisionVO();
            vo.setRevisionNo(row.getRevisionNo());
            vo.setPublishedAt(row.getPublishedAt() == null ? null : row.getPublishedAt().format(DISPLAY));
            vo.setPublisherName(row.getPublisherName());
            vo.setPublisherEmpNo(row.getPublisherEmpNo());
            vo.setChangeNote(row.getChangeNote());
            vo.setSchemaVersion(row.getSchemaVersion());
            // 当前版以指针为准；指针为空（阶段二遗留）时最新那一版就是当前版
            vo.setCurrent(currentRevisionId != null
                    ? Objects.equals(currentRevisionId, row.getId())
                    : i == 0);
            vo.setItemDelta(itemCount(row.getDocumentSnapshot()));
            list.add(vo);
        }
        return list;
    }

    /** 取指定版本；不存在就明确报错，绝不回退到最新版——回退会把「看历史」变成「看现在」。 */
    public CpmReportRevision require(long reportId, int revisionNo) {
        CpmReportRevision row = revisionMapper.findByNo(reportId, revisionNo);
        if (row == null) {
            throw new BusinessException("該版本不存在或已被移除");
        }
        return row;
    }

    /** 反序列化冻结快照：读失败要说「版本内容無法解析」而不是甩一个 500。 */
    public CpmDto.Snapshot parseSnapshot(CpmReportRevision revision) {
        CpmDto.Snapshot snapshot = JsonUtils.parse(revision.getDocumentSnapshot(), CpmDto.Snapshot.class);
        if (snapshot == null) {
            throw new BusinessException("版本內容無法解析，請聯繫管理員");
        }
        return snapshot;
    }

    /* ==================== 内部 ==================== */

    private static String normalizeNote(String changeNote) {
        if (changeNote != null && !changeNote.isBlank()) {
            return trimTo(changeNote.trim(), 200);
        }
        // 说明缺省时给出系统事实，而不是伪造一句「用户说过的话」
        return FIRST_REVISION_NOTE;
    }

    private static Integer schemaVersionOf(String snapshotJson) {
        CpmDto.Snapshot parsed = JsonUtils.parse(snapshotJson, CpmDto.Snapshot.class);
        return parsed == null || parsed.getSchemaVersion() == null ? 1 : parsed.getSchemaVersion();
    }

    /** 该版条目数：让「这一版比上一版多了什么」在版本列表就能看见，而不用逐版点开。 */
    private static Integer itemCount(String snapshotJson) {
        CpmDto.Snapshot parsed = JsonUtils.parse(snapshotJson, CpmDto.Snapshot.class);
        return parsed == null || parsed.getTotals() == null ? null : parsed.getTotals().getTotal();
    }

    private static String trimTo(String value, int max) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    /** SHA-256 十六进制：与条目 AI 台账、纪要版本同一套摘要算法，不引新依赖。 */
    private static String sha256(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(nullToEmpty(text).getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            // JDK 必然提供 SHA-256；真进不来说明运行时被裁剪过，属于不可继续的环境而不是用户错误
            throw new IllegalStateException("SHA-256 不可用，無法生成版本摘要", e);
        }
    }
}
