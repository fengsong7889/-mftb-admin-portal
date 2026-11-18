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
import com.mftb.admin.entity.CpmComment;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.CpmReaction;
import com.mftb.admin.entity.CpmRecognition;
import com.mftb.admin.entity.CpmReport;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmCommentMapper;
import com.mftb.admin.mapper.CpmItemMapper;
import com.mftb.admin.mapper.CpmReactionMapper;
import com.mftb.admin.mapper.CpmRecognitionMapper;
import com.mftb.admin.mapper.CpmReportMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * CFR 反馈服务：评论（Feedback）、点赞（轻量认可）、成果认定（Recognition）。
 *
 * <p>资格统一走 {@link CpmAccessGuard#requireCfrWritable}：目标作者须在查看者阅读范围内
 * 且非本人——数据库 CHECK(from<>to) 与唯一键是最后防线，服务层先把话说清楚。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CpmCfrService {

    private static final DateTimeFormatter DISPLAY = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final List<String> TARGET_TYPES = List.of(CpmConstants.TARGET_ITEM, CpmConstants.TARGET_REPORT);

    private final CpmCommentMapper commentMapper;
    private final CpmReactionMapper reactionMapper;
    private final CpmRecognitionMapper recognitionMapper;
    private final CpmItemMapper itemMapper;
    private final CpmReportMapper reportMapper;
    private final CpmAccessGuard guard;
    private final CpmPeriods periods;
    private final CpmNotifyService notifyService;

    /* ==================== 评论 ==================== */

    @Transactional(rollbackFor = Exception.class)
    public CpmDto.CommentVO addComment(CpmDto.CommentForm form) {
        SysUser viewer = guard.currentUser();
        String targetType = requireTargetType(form.getTargetType());
        long targetOwnerId = resolveTargetOwner(targetType, form.getTargetId());
        guard.requireCfrWritable(targetOwnerId, viewer);
        if (form.getParentId() != null) {
            CpmComment parent = commentMapper.selectById(form.getParentId());
            if (parent == null || !targetType.equals(parent.getTargetType())
                    || !form.getTargetId().equals(parent.getTargetId())) {
                throw new BusinessException("回覆的目標評論不存在");
            }
            if (parent.getParentId() != null) {
                throw new BusinessException("僅支援一層回覆");
            }
        }
        CpmComment row = new CpmComment();
        row.setTargetType(targetType);
        row.setTargetId(form.getTargetId());
        row.setUserId(viewer.getId());
        row.setParentId(form.getParentId());
        row.setContent(requireContent(form.getContent()));
        commentMapper.insert(row);
        return toVO(row, viewer.getId());
    }

    public List<CpmDto.CommentVO> listComments(String targetType, long targetId) {
        SysUser viewer = guard.currentUser();
        String type = requireTargetType(targetType);
        // 读评论的资格=读目标的资格（条目仅本人；汇报本人或可见范围）
        if (CpmConstants.TARGET_ITEM.equals(type)) {
            guard.requireOwnedItem(targetId, viewer);
        } else {
            guard.requireReadableReport(targetId, viewer);
        }
        List<CpmDto.CommentVO> out = new ArrayList<>();
        for (Map<String, Object> row : commentMapper.listThreadLite(targetType, targetId)) {
            out.add(mapToCommentVO(row, viewer.getId()));
        }
        return out;
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteComment(long id) {
        SysUser viewer = guard.currentUser();
        if (commentMapper.softDeleteOwn(id, viewer.getId()) == 0) {
            throw new BusinessException("只能刪除自己的評論");
        }
    }

    /* ==================== 点赞 ==================== */

    /** @return 点赞后的 active 状态（true=当前是赞，false=已取消） */
    @Transactional(rollbackFor = Exception.class)
    public boolean toggleReaction(String targetType, long targetId) {
        SysUser viewer = guard.currentUser();
        String type = requireTargetType(targetType);
        long ownerId = resolveTargetOwner(type, targetId);
        guard.requireCfrWritable(ownerId, viewer);
        if (reactionMapper.countActive(type, targetId, viewer.getId()) > 0) {
            reactionMapper.cancel(type, targetId, viewer.getId());
            return false;
        }
        if (reactionMapper.revive(type, targetId, viewer.getId()) > 0) {
            return true;
        }
        CpmReaction row = new CpmReaction();
        row.setTargetType(type);
        row.setTargetId(targetId);
        row.setUserId(viewer.getId());
        try {
            reactionMapper.insert(row);
        } catch (DuplicateKeyException e) {
            // 并发双击：另一边已插入，本次视为「取消后立刻又被点回」的竞态，直接读最终态
            return reactionMapper.countActive(type, targetId, viewer.getId()) > 0;
        }
        return true;
    }

    /* ==================== 成果认定 ==================== */

    @Transactional(rollbackFor = Exception.class)
    public CpmDto.RecognitionVO recognize(CpmDto.RecognitionForm form) {
        SysUser viewer = guard.currentUser();
        String targetType = requireTargetType(form.getTargetType());
        if (!CpmConstants.RECOGNITION_HIGHLIGHT.equals(form.getKind())
                && !CpmConstants.RECOGNITION_MILESTONE.equals(form.getKind())) {
            throw new BusinessException("不支援的認定類型");
        }
        long toUserId = resolveTargetOwner(targetType, form.getTargetId());
        guard.requireCfrWritable(toUserId, viewer);
        guard.requireNoDuplicateRecognition(targetType, form.getTargetId(), viewer.getId());

        CpmRecognition row = new CpmRecognition();
        row.setTargetType(targetType);
        row.setTargetId(form.getTargetId());
        row.setFromUserId(viewer.getId());
        // to_user_id 由目标归属推导（本方法上方），表单没有传「被认定人」的位置——伪造台账从契约层就不可表达
        row.setToUserId(toUserId);
        row.setTargetTitle(resolveTargetTitle(targetType, form.getTargetId()));
        row.setKind(form.getKind());
        row.setComment(requireContent(form.getComment()));
        row.setPeriodTag(periods.quarterTag(LocalDate.now(periods.zone())));
        row.setSyncToPerf(0);
        row.setDeleted(0);
        row.setCreatedBy(viewer.getName());
        try {
            recognitionMapper.insert(row);
        } catch (DuplicateKeyException e) {
            throw new BusinessException("你已認定過該內容，不可重複發起");
        }
        final long recognitionId = row.getId();
        org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                new org.springframework.transaction.support.TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        try {
                            notifyService.notifyRecognition(recognitionId);
                        } catch (RuntimeException e) {
                            log.warn("[CpmNotify] 認定通知異常 id={}: {}", recognitionId, e.getMessage());
                        }
                    }
                });
        return toVO(row, viewer.getName());
    }

    /** 个人成果档案（本人入口）：收到的认定时间线。 */
    public List<CpmDto.RecognitionVO> archive() {
        SysUser current = guard.currentUser();
        List<CpmDto.RecognitionVO> out = new ArrayList<>();
        for (Map<String, Object> row : recognitionMapper.listArchive(current.getId())) {
            CpmDto.RecognitionVO vo = new CpmDto.RecognitionVO();
            vo.setId(((Number) row.get("id")).longValue());
            vo.setTargetType((String) row.get("target_type"));
            Object targetId = row.get("target_id");
            vo.setTargetId(targetId instanceof Number n ? n.longValue() : null);
            vo.setTargetTitle((String) row.get("target_title"));
            vo.setFromName((String) row.get("fromName"));
            vo.setKind((String) row.get("kind"));
            vo.setComment((String) row.get("comment"));
            vo.setPeriodTag((String) row.get("period_tag"));
            vo.setCreatedAt(String.valueOf(row.get("created_at")));
            out.add(vo);
        }
        return out;
    }

    /* ==================== 内部 ==================== */

    private String requireTargetType(String targetType) {
        if (targetType == null || !TARGET_TYPES.contains(targetType)) {
            throw new BusinessException("不支援的反饋目標類型");
        }
        return targetType;
    }

    private long resolveTargetOwner(String targetType, long targetId) {
        if (CpmConstants.TARGET_ITEM.equals(targetType)) {
            CpmItem item = itemMapper.selectAliveById(targetId);
            if (item == null) {
                throw new BusinessException("工作記錄不存在或已被刪除");
            }
            return item.getUserId();
        }
        CpmReport report = reportMapper.selectAliveById(targetId);
        if (report == null) {
            throw new BusinessException("匯報不存在或已被移除");
        }
        if (!CpmConstants.REPORT_STATUS_PUBLISHED.equals(report.getStatus())) {
            // 草稿不对外开放反馈：没发布的内容还不算「交出去的活」
            throw new BusinessException("草稿尚未發布，暫不支援反饋");
        }
        return report.getUserId();
    }

    private String resolveTargetTitle(String targetType, long targetId) {
        if (CpmConstants.TARGET_ITEM.equals(targetType)) {
            CpmItem item = itemMapper.selectAliveById(targetId);
            return item == null ? "" : item.getTitle();
        }
        CpmReport report = reportMapper.selectAliveById(targetId);
        if (report == null) {
            return "";
        }
        return periodLabel(report);
    }

    private static String periodLabel(CpmReport report) {
        String typeName = switch (report.getPeriodType() == null ? "" : report.getPeriodType()) {
            case CpmConstants.PERIOD_MONTH -> "月報";
            case CpmConstants.PERIOD_QUARTER -> "季度報告";
            default -> "週報";
        };
        return typeName + " " + report.getPeriodStart() + " ~ " + report.getPeriodEnd();
    }

    private static String requireContent(String content) {
        String trimmed = content == null ? "" : content.trim();
        if (trimmed.isEmpty()) {
            throw new BusinessException("內容不能為空");
        }
        if (trimmed.length() > CpmConstants.COMMENT_MAX) {
            throw new BusinessException("內容最長 " + CpmConstants.COMMENT_MAX + " 字");
        }
        return trimmed;
    }

    private CpmDto.CommentVO toVO(CpmComment row, long viewerId) {
        SysUser author = guard.userById(row.getUserId());
        CpmDto.CommentVO vo = new CpmDto.CommentVO();
        vo.setId(row.getId());
        vo.setTargetType(row.getTargetType());
        vo.setTargetId(row.getTargetId());
        vo.setUserId(row.getUserId());
        vo.setAuthorName(author == null ? null : author.getName());
        vo.setContent(row.getContent());
        vo.setCreatedAt(row.getCreatedAt() == null ? null : row.getCreatedAt().format(DISPLAY));
        vo.setParentId(row.getParentId());
        vo.setMine(row.getUserId().equals(viewerId));
        return vo;
    }

    private CpmDto.CommentVO mapToCommentVO(Map<String, Object> row, long viewerId) {
        CpmDto.CommentVO vo = new CpmDto.CommentVO();
        vo.setId(((Number) row.get("id")).longValue());
        vo.setTargetType((String) row.get("target_type"));
        vo.setTargetId(((Number) row.get("target_id")).longValue());
        Object userId = row.get("user_id");
        vo.setUserId(userId instanceof Number n ? n.longValue() : null);
        vo.setAuthorName((String) row.get("authorName"));
        vo.setContent((String) row.get("content"));
        vo.setCreatedAt(String.valueOf(row.get("created_at")));
        Object parentId = row.get("parent_id");
        vo.setParentId(parentId instanceof Number n ? n.longValue() : null);
        vo.setMine(userId instanceof Number n && n.longValue() == viewerId);
        return vo;
    }

    private CpmDto.RecognitionVO toVO(CpmRecognition row, String fromName) {
        CpmDto.RecognitionVO vo = new CpmDto.RecognitionVO();
        vo.setId(row.getId());
        vo.setTargetType(row.getTargetType());
        vo.setTargetId(row.getTargetId());
        vo.setTargetTitle(row.getTargetTitle());
        vo.setFromUserId(row.getFromUserId());
        vo.setFromName(fromName);
        vo.setToUserId(row.getToUserId());
        SysUser to = guard.userById(row.getToUserId());
        vo.setToName(to == null ? null : to.getName());
        vo.setKind(row.getKind());
        vo.setComment(row.getComment());
        vo.setPeriodTag(row.getPeriodTag());
        vo.setCreatedAt(row.getCreatedAt() == null ? null : row.getCreatedAt().format(DISPLAY));
        return vo;
    }
}
