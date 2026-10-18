package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.DocConstants;
import com.mftb.admin.dto.DocNodeSaveDTO;
import com.mftb.admin.dto.DocNodeVO;
import com.mftb.admin.dto.DocSpaceSaveDTO;
import com.mftb.admin.dto.DocStatsVO;
import com.mftb.admin.dto.DocViewLogVO;
import com.mftb.admin.dto.DocViewStatRow;
import com.mftb.admin.dto.DocViewStatsVO;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.DocNode;
import com.mftb.admin.entity.DocSpace;
import com.mftb.admin.entity.DocViewLog;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.DocNodeMapper;
import com.mftb.admin.mapper.DocSpaceMapper;
import com.mftb.admin.mapper.DocViewLogMapper;
import com.mftb.admin.mapper.SysUserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 文檔中心服務：元數據索引 + 查閱留痕 + 空間維護。
 * <p>權限口徑為「菜單級統一」（產品決策）：持有 doc-library 即全空間可見，
 * 本服務不再按空間裁剪數據；行級裁剪屬後續增量，届时只擴展此處。
 * <p>安全邊界：騰訊文檔鏈接白名單校驗在服務層（前端校驗只是體驗）；
 * 查閱人身份一律取後端認證的 username，不信任前端傳參。
 */
@Service
@RequiredArgsConstructor
public class DocService {

    /** 只收騰訊文檔站內鏈接，防把外部系統地址誤登記為公司文檔 */
    private static final Pattern TENCENT_URL = Pattern.compile("^https://docs\\.qq\\.com/\\S{1,480}$");

    private final DocSpaceMapper spaceMapper;
    private final DocNodeMapper nodeMapper;
    private final DocViewLogMapper viewLogMapper;
    private final SysUserMapper userMapper;

    /* ==================== 空間 ==================== */

    public List<DocSpace> listSpaces() {
        return spaceMapper.selectList(new LambdaQueryWrapper<DocSpace>()
                .orderByAsc(DocSpace::getSortOrder)
                .orderByAsc(DocSpace::getId));
    }

    @Transactional
    public DocSpace createSpace(DocSpaceSaveDTO dto, String username) {
        validateSpace(dto);
        DocSpace space = new DocSpace();
        applySpace(space, dto);
        space.setCreatedBy(username);
        space.setUpdatedBy(username);
        spaceMapper.insert(space);
        return space;
    }

    @Transactional
    public DocSpace updateSpace(Long id, DocSpaceSaveDTO dto, String username) {
        DocSpace space = requireSpace(id);
        validateSpace(dto);
        applySpace(space, dto);
        space.setUpdatedBy(username);
        spaceMapper.updateById(space);
        return space;
    }

    /** 刪除前檢查引用：留痕表與索引表的外鍵關係靠應用層守衛，防止 orphan 索引 */
    @Transactional
    public void deleteSpace(Long id) {
        DocSpace space = requireSpace(id);
        Long refs = nodeMapper.selectCount(new LambdaQueryWrapper<DocNode>()
                .eq(DocNode::getSpaceId, space.getId()));
        if (refs != null && refs > 0) {
            throw new BusinessException("空間下仍有 " + refs + " 篇文檔，請先遷移或刪除");
        }
        spaceMapper.deleteById(id);
    }

    private void validateSpace(DocSpaceSaveDTO dto) {
        if (dto == null || !StringUtils.hasText(dto.getName())) {
            throw new BusinessException("空間名稱不能為空");
        }
        if (dto.getName().trim().length() > 64) {
            throw new BusinessException("空間名稱不能超過 64 字");
        }
    }

    private void applySpace(DocSpace space, DocSpaceSaveDTO dto) {
        space.setName(dto.getName().trim());
        space.setIcon(StringUtils.hasText(dto.getIcon()) ? dto.getIcon().trim() : null);
        space.setSortOrder(dto.getSortOrder() == null ? 0 : dto.getSortOrder());
        space.setDescription(StringUtils.hasText(dto.getDescription()) ? dto.getDescription().trim() : null);
    }

    private DocSpace requireSpace(Long id) {
        DocSpace space = id == null ? null : spaceMapper.selectById(id);
        if (space == null) {
            throw new BusinessException("空間不存在");
        }
        return space;
    }

    /* ==================== 文檔索引 ==================== */

    public List<DocNodeVO> listNodes(String keyword, Long spaceId, Integer status, Integer docType, String bizType, Long bizId) {
        List<DocNode> rows = nodeMapper.selectList(buildFilter(keyword, spaceId, status, docType, bizType, bizId)
                .orderByDesc(DocNode::getUpdatedAt));
        Map<Long, String> names = spaceNames();
        return rows.stream().map(n -> DocNodeVO.from(n, names.get(n.getSpaceId()))).toList();
    }

    /** 統計口徑跟隨搜索條件：與列表共用同一個 filter，禁止單獨發全量統計 */
    public DocStatsVO stats(String keyword, Long spaceId, Integer status, Integer docType, String bizType, Long bizId) {
        List<DocNode> rows = nodeMapper.selectList(buildFilter(keyword, spaceId, status, docType, bizType, bizId));
        YearMonth now = YearMonth.now();
        DocStatsVO vo = new DocStatsVO();
        vo.setTotal(rows.size());
        vo.setPublished((int) rows.stream().filter(r -> r.getStatus() != null && r.getStatus() == DocConstants.STATUS_PUBLISHED).count());
        vo.setUpdatedThisMonth((int) rows.stream().filter(r -> r.getUpdatedAt() != null
                && YearMonth.from(r.getUpdatedAt()).equals(now)).count());
        vo.setLinkedReq((int) rows.stream().filter(r -> DocConstants.BIZ_TYPE_REQ.equals(r.getBizType())).count());
        return vo;
    }

    public DocNodeVO detail(Long id, String username) {
        DocNode node = requireNode(id);
        recordView(id, username);
        return DocNodeVO.from(node, spaceNames().get(node.getSpaceId()));
    }

    public List<DocViewLogVO> viewLogs(Long nodeId, int limit) {
        requireNode(nodeId);
        int capped = Math.max(1, Math.min(limit, 100));
        List<DocViewLog> rows = viewLogMapper.selectList(new LambdaQueryWrapper<DocViewLog>()
                .eq(DocViewLog::getNodeId, nodeId)
                .orderByDesc(DocViewLog::getViewedAt)
                .last("LIMIT " + capped));
        return rows.stream().map(DocViewLogVO::from).toList();
    }

    @Transactional
    public DocNodeVO create(DocNodeSaveDTO dto, String username) {
        validate(dto);
        DocNode node = new DocNode();
        applyDto(node, dto);
        SysUser user = findByUsername(username);
        node.setOwnerUserId(user == null ? null : user.getId());
        node.setOwnerName(user != null && StringUtils.hasText(user.getName()) ? user.getName() : username);
        node.setCreatedBy(username);
        node.setUpdatedBy(username);
        nodeMapper.insert(node);
        return DocNodeVO.from(node, spaceNames().get(node.getSpaceId()));
    }

    @Transactional
    public DocNodeVO update(Long id, DocNodeSaveDTO dto, String username) {
        DocNode node = requireNode(id);
        validate(dto);
        applyDto(node, dto);
        node.setUpdatedBy(username);
        nodeMapper.updateById(node);
        return DocNodeVO.from(node, spaceNames().get(node.getSpaceId()));
    }

    @Transactional
    public void delete(Long id, String username) {
        requireNode(id);
        nodeMapper.deleteById(id);
    }

    /* ==================== 查閱留痕 ==================== */

    private void recordView(Long nodeId, String username) {
        DocViewLog log = new DocViewLog();
        log.setNodeId(nodeId);
        SysUser user = findByUsername(username);
        if (user != null) {
            log.setUserId(user.getId());
            log.setUserName(StringUtils.hasText(user.getName()) ? user.getName() : username);
            log.setDepartment(user.getDepartment());
        } else {
            log.setUserName(username);
        }
        // viewedAt 标了 @TableField(fill = FieldFill.INSERT)，MyBatis-Plus 会把该列无条件写进 INSERT，
        // 而项目的 MetaObjectHandler 只按名字填 createdAt/updatedAt → 不赋值就是显式 NULL，
        // 会盖掉 DDL 的 DEFAULT CURRENT_TIMESTAMP（同类缺陷刚在 hr_operation_audit.occurred_at 上修过）。
        log.setViewedAt(java.time.LocalDateTime.now());
        viewLogMapper.insert(log);
    }

    /**
     * 頁面離開時上報停留時長：只回填該人該文檔最近一條未計時記錄。
     * 鉗到 [0, 4h]：掛頁過夜的時長不是閱讀時長，灌進培訓完成度口徑會失真。
     */
    @Transactional
    public void reportDuration(Long nodeId, String username, Integer durationSec) {
        if (durationSec == null || durationSec < 0) {
            return;
        }
        SysUser user = findByUsername(username);
        if (user == null) {
            return;
        }
        int capped = Math.min(durationSec, DocConstants.VIEW_DURATION_MAX);
        viewLogMapper.selectList(new LambdaQueryWrapper<DocViewLog>()
                        .eq(DocViewLog::getNodeId, nodeId)
                        .eq(DocViewLog::getUserId, user.getId())
                        .isNull(DocViewLog::getDurationSec)
                        .orderByDesc(DocViewLog::getId)
                        .last("LIMIT 1"))
                .stream().findFirst().ifPresent(row -> {
                    row.setDurationSec(capped);
                    viewLogMapper.updateById(row);
                });
    }

    /* ==================== 閱讀統計（P2 看板） ==================== */

    /**
     * 閱讀統計看板：口徑為 doc_view_log 在給定天數窗口內的聚合。
     * 只統計仍在索引中的文檔；已刪除文檔的留痕不進聚合（索引沒了，讀數沒有管理意義）。
     */
    public DocViewStatsVO viewStats(int days, Long spaceId) {
        int window = Math.max(1, Math.min(days, 365));
        LocalDateTime since = LocalDateTime.now().minusDays(window);
        DocViewStatsVO vo = new DocViewStatsVO();
        List<DocViewStatRow> aggregated = viewLogMapper.aggregateSince(since);
        if (aggregated.isEmpty()) {
            vo.setRows(List.of());
            return vo;
        }
        Map<Long, DocNode> nodes = nodeMapper.selectBatchIds(
                        aggregated.stream().map(DocViewStatRow::getNodeId).toList())
                .stream().collect(Collectors.toMap(DocNode::getId, n -> n, (a, b) -> a));
        Map<Long, String> names = spaceNames();
        List<DocViewStatsVO.Row> rows = aggregated.stream()
                .map(r -> {
                    DocNode node = nodes.get(r.getNodeId());
                    return node == null ? null
                            : DocViewStatsVO.Row.of(r, node.getTitle(), node.getSpaceId(), names.get(node.getSpaceId()));
                })
                .filter(Objects::nonNull)
                .filter(r -> spaceId == null || spaceId.equals(r.getSpaceId()))
                .toList();
        vo.setRows(rows);
        vo.setTotalViews(rows.stream().mapToLong(DocViewStatsVO.Row::getViewCount).sum());
        vo.setDocCount(rows.size());
        Long readers = viewLogMapper.countDistinctReadersSince(since);
        vo.setTotalReaders(readers == null ? 0 : readers);
        Double avg = viewLogMapper.avgDurationSince(since);
        vo.setAvgDurationSec(avg == null ? null : (int) Math.round(avg));
        return vo;
    }

    /* ==================== 內部工具 ==================== */

    private LambdaQueryWrapper<DocNode> buildFilter(String keyword, Long spaceId, Integer status, Integer docType,
                                                    String bizType, Long bizId) {
        LambdaQueryWrapper<DocNode> w = new LambdaQueryWrapper<>();
        if (spaceId != null) {
            w.eq(DocNode::getSpaceId, spaceId);
        }
        if (status != null) {
            w.eq(DocNode::getStatus, status);
        }
        if (docType != null) {
            w.eq(DocNode::getDocType, docType);
        }
        // 業務掛接過濾：RDM 需求詳情「關聯文檔」卡片按 bizType=REQ + bizId 拉取
        if (StringUtils.hasText(bizType)) {
            w.eq(DocNode::getBizType, bizType.trim());
        }
        if (bizId != null) {
            w.eq(DocNode::getBizId, bizId);
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            w.and(x -> x.like(DocNode::getTitle, kw)
                    .or().like(DocNode::getCategory, kw)
                    .or().like(DocNode::getOwnerName, kw)
                    .or().like(DocNode::getTags, kw));
        }
        return w;
    }

    private void validate(DocNodeSaveDTO dto) {
        if (dto == null) {
            throw new BusinessException("請求體不能為空");
        }
        if (dto.getSpaceId() == null || spaceMapper.selectById(dto.getSpaceId()) == null) {
            throw new BusinessException("所屬空間不存在");
        }
        if (!StringUtils.hasText(dto.getTitle())) {
            throw new BusinessException("文檔標題不能為空");
        }
        if (dto.getTitle().trim().length() > DocConstants.TITLE_MAX) {
            throw new BusinessException("文檔標題不能超過 " + DocConstants.TITLE_MAX + " 字");
        }
        if (!StringUtils.hasText(dto.getCategory())) {
            throw new BusinessException("文檔分類不能為空");
        }
        if (dto.getCategory().trim().length() > DocConstants.CATEGORY_MAX) {
            throw new BusinessException("文檔分類不能超過 " + DocConstants.CATEGORY_MAX + " 字");
        }
        if (dto.getDocType() == null || !DocConstants.TYPES.contains(dto.getDocType())) {
            throw new BusinessException("文檔類型不合法");
        }
        if (dto.getStatus() == null || !DocConstants.STATUSES.contains(dto.getStatus())) {
            throw new BusinessException("文檔狀態不合法");
        }
        String url = dto.getTencentUrl() == null ? "" : dto.getTencentUrl().trim();
        if (url.length() > DocConstants.URL_MAX || !TENCENT_URL.matcher(url).matches()) {
            throw new BusinessException("請填寫以 https://docs.qq.com/ 開頭的騰訊文檔鏈接");
        }
        if (dto.getBizId() != null && dto.getBizId() <= 0) {
            throw new BusinessException("關聯需求單 ID 必須為正整數");
        }
        if (dto.getSummary() != null && dto.getSummary().trim().length() > DocConstants.SUMMARY_MAX) {
            throw new BusinessException("文檔摘要不能超過 " + DocConstants.SUMMARY_MAX + " 字");
        }
    }

    private void applyDto(DocNode node, DocNodeSaveDTO dto) {
        node.setSpaceId(dto.getSpaceId());
        node.setCategory(dto.getCategory().trim());
        node.setTitle(dto.getTitle().trim());
        node.setDocType(dto.getDocType());
        node.setStatus(dto.getStatus());
        node.setTencentUrl(dto.getTencentUrl().trim());
        node.setTags(dto.getTags() == null || dto.getTags().isEmpty()
                ? null
                : dto.getTags().stream().map(String::trim).filter(s -> !s.isEmpty()).distinct()
                        .collect(Collectors.joining(",")));
        node.setBizId(dto.getBizId());
        node.setBizType(dto.getBizId() != null ? DocConstants.BIZ_TYPE_REQ : null);
        node.setSummary(StringUtils.hasText(dto.getSummary()) ? dto.getSummary().trim() : null);
    }

    private DocNode requireNode(Long id) {
        DocNode node = id == null ? null : nodeMapper.selectById(id);
        if (node == null) {
            throw new BusinessException("文檔不存在或已刪除");
        }
        return node;
    }

    private Map<Long, String> spaceNames() {
        return listSpaces().stream().collect(Collectors.toMap(DocSpace::getId, DocSpace::getName, (a, b) -> a));
    }

    private SysUser findByUsername(String username) {
        if (!StringUtils.hasText(username)) {
            return null;
        }
        return Optional.ofNullable(userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                        .eq(SysUser::getUsername, username)
                        .last("LIMIT 1")))
                .filter(l -> !l.isEmpty())
                .map(l -> l.get(0))
                .orElse(null);
    }
}
