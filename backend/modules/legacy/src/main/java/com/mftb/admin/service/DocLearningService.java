package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.DocConstants;
import com.mftb.admin.dto.DocLearningPathDetailVO;
import com.mftb.admin.dto.DocLearningPathSaveDTO;
import com.mftb.admin.dto.DocLearningPathVO;
import com.mftb.admin.entity.DocLearningItem;
import com.mftb.admin.entity.DocLearningPath;
import com.mftb.admin.entity.DocNode;
import com.mftb.admin.entity.DocSpace;
import com.mftb.admin.entity.DocViewLog;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.DocLearningItemMapper;
import com.mftb.admin.mapper.DocLearningPathMapper;
import com.mftb.admin.mapper.DocNodeMapper;
import com.mftb.admin.mapper.DocSpaceMapper;
import com.mftb.admin.mapper.DocViewLogMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.DateTimeUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 學習路徑服務（新人入職包/培訓清單）。
 * <p>「已讀」不另建進度表：直接由 doc_view_log（詳情頁打開即留痕）按「本人 × 文檔」推導，
 * 避免雙寫漂移；完成度口徑天然與閱讀統計看板一致。
 */
@Service
@RequiredArgsConstructor
public class DocLearningService {

    private final DocLearningPathMapper pathMapper;
    private final DocLearningItemMapper itemMapper;
    private final DocNodeMapper nodeMapper;
    private final DocSpaceMapper spaceMapper;
    private final DocViewLogMapper viewLogMapper;
    private final SysUserMapper userMapper;

    /* ==================== 查詢 ==================== */

    public List<DocLearningPathVO> listPaths(String keyword, String username) {
        LambdaQueryWrapper<DocLearningPath> w = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            w.like(DocLearningPath::getName, keyword.trim());
        }
        w.orderByAsc(DocLearningPath::getSortOrder).orderByDesc(DocLearningPath::getUpdatedAt);
        List<DocLearningPath> paths = pathMapper.selectList(w);
        if (paths.isEmpty()) {
            return List.of();
        }
        List<Long> pathIds = paths.stream().map(DocLearningPath::getId).toList();
        List<DocLearningItem> items = itemMapper.selectList(new LambdaQueryWrapper<DocLearningItem>()
                .in(DocLearningItem::getPathId, pathIds));
        Map<Long, Long> itemCount = items.stream()
                .collect(Collectors.groupingBy(DocLearningItem::getPathId, Collectors.counting()));
        Set<Long> myReadNodes = myReadNodes(username,
                items.stream().map(DocLearningItem::getNodeId).distinct().toList());
        Map<Long, Long> myReadCount = items.stream()
                .filter(it -> myReadNodes.contains(it.getNodeId()))
                .collect(Collectors.groupingBy(DocLearningItem::getPathId, Collectors.counting()));
        return paths.stream()
                .map(p -> DocLearningPathVO.of(p,
                        itemCount.getOrDefault(p.getId(), 0L).intValue(),
                        myReadCount.getOrDefault(p.getId(), 0L).intValue()))
                .toList();
    }

    public DocLearningPathDetailVO detail(Long id, String username) {
        DocLearningPath path = requirePath(id);
        List<DocLearningItem> items = itemMapper.selectList(new LambdaQueryWrapper<DocLearningItem>()
                .eq(DocLearningItem::getPathId, id)
                .orderByAsc(DocLearningItem::getSortOrder)
                .orderByAsc(DocLearningItem::getId));
        DocLearningPathDetailVO vo = new DocLearningPathDetailVO();
        vo.setId(path.getId());
        vo.setName(path.getName());
        vo.setDescription(path.getDescription());
        vo.setStatus(path.getStatus());
        vo.setUpdatedAt(DateTimeUtils.format(path.getUpdatedAt()));
        if (items.isEmpty()) {
            vo.setItems(List.of());
            return vo;
        }
        List<Long> nodeIds = items.stream().map(DocLearningItem::getNodeId).distinct().toList();
        Map<Long, DocNode> nodes = nodeMapper.selectList(new LambdaQueryWrapper<DocNode>().in(DocNode::getId, nodeIds)
                .notInSql(DocNode::getId, "SELECT node_id FROM doc_native_document")
                .notInSql(DocNode::getSpaceId, "SELECT space_id FROM doc_space_access")).stream()
                .collect(Collectors.toMap(DocNode::getId, n -> n, (a, b) -> a));
        Map<Long, String> spaceNames = spaceNames();
        Set<Long> myReadNodes = myReadNodes(username, nodeIds);
        Map<Long, Long> readerCounts = readerCounts(nodeIds);
        List<DocLearningPathDetailVO.Item> rows = items.stream()
                .map(it -> {
                    DocNode node = nodes.get(it.getNodeId());
                    if (node == null) {
                        return null; // 文檔已被刪除：條目靜默隱藏，不阻塞整條路徑
                    }
                    DocLearningPathDetailVO.Item row = new DocLearningPathDetailVO.Item();
                    row.setNodeId(node.getId());
                    row.setTitle(node.getTitle());
                    row.setSpaceName(spaceNames.get(node.getSpaceId()));
                    row.setDocType(node.getDocType());
                    row.setDocTypeLabel(DocConstants.TYPE_LABEL.get(node.getDocType()));
                    row.setStatus(node.getStatus());
                    row.setStatusLabel(DocConstants.STATUS_LABEL.get(node.getStatus()));
                    row.setMyRead(myReadNodes.contains(node.getId()));
                    row.setReaderCount(readerCounts.getOrDefault(node.getId(), 0L));
                    return row;
                })
                .filter(Objects::nonNull)
                .toList();
        vo.setItems(rows);
        return vo;
    }

    /* ==================== 管理 ==================== */

    @Transactional
    public DocLearningPath create(DocLearningPathSaveDTO dto, String username) {
        List<Long> nodeIds = validateAndNormalize(dto);
        DocLearningPath path = new DocLearningPath();
        applyDto(path, dto);
        path.setCreatedBy(username);
        path.setUpdatedBy(username);
        pathMapper.insert(path);
        replaceItems(path.getId(), nodeIds, username);
        return path;
    }

    @Transactional
    public DocLearningPath update(Long id, DocLearningPathSaveDTO dto, String username) {
        DocLearningPath path = requirePath(id);
        List<Long> nodeIds = validateAndNormalize(dto);
        applyDto(path, dto);
        path.setUpdatedBy(username);
        pathMapper.updateById(path);
        replaceItems(id, nodeIds, username);
        return path;
    }

    @Transactional
    public void delete(Long id, String username) {
        requirePath(id);
        itemMapper.delete(new LambdaQueryWrapper<DocLearningItem>().eq(DocLearningItem::getPathId, id));
        pathMapper.deleteById(id);
    }

    /* ==================== 内部工具 ==================== */

    /** 编辑时整体替换条目：先逻辑删除旧条目再按新顺序重建（路径规模小，diff 收益低于复杂度） */
    private void replaceItems(Long pathId, List<Long> nodeIds, String username) {
        itemMapper.delete(new LambdaQueryWrapper<DocLearningItem>().eq(DocLearningItem::getPathId, pathId));
        int sort = 1;
        for (Long nodeId : nodeIds) {
            DocLearningItem item = new DocLearningItem();
            item.setPathId(pathId);
            item.setNodeId(nodeId);
            item.setSortOrder(sort++);
            item.setCreatedBy(username);
            item.setUpdatedBy(username);
            itemMapper.insert(item);
        }
    }

    private List<Long> validateAndNormalize(DocLearningPathSaveDTO dto) {
        if (dto == null || !StringUtils.hasText(dto.getName())) {
            throw new BusinessException("路徑名稱不能為空");
        }
        if (dto.getName().trim().length() > 64) {
            throw new BusinessException("路徑名稱不能超過 64 字");
        }
        if (dto.getDescription() != null && dto.getDescription().trim().length() > 255) {
            throw new BusinessException("路徑說明不能超過 255 字");
        }
        if (dto.getStatus() != null && dto.getStatus() != 1 && dto.getStatus() != 0) {
            throw new BusinessException("啟用狀態不合法");
        }
        if (dto.getItems() == null || dto.getItems().isEmpty()) {
            throw new BusinessException("請至少添加一篇文檔");
        }
        // 去重保持順序：同一文檔在一條路徑裡出現兩次沒有業務意義
        List<Long> nodeIds = new LinkedHashSet<>(dto.getItems()).stream()
                .filter(Objects::nonNull)
                .toList();
        if (nodeIds.isEmpty()) {
            throw new BusinessException("請至少添加一篇文檔");
        }
        int existing = nodeMapper.selectList(new LambdaQueryWrapper<DocNode>().in(DocNode::getId, nodeIds)
                .notInSql(DocNode::getId, "SELECT node_id FROM doc_native_document")
                .notInSql(DocNode::getSpaceId, "SELECT space_id FROM doc_space_access")).size();
        if (existing != nodeIds.size()) {
            throw new BusinessException("部分文檔不存在或已刪除，請重新選擇");
        }
        return nodeIds;
    }

    private void applyDto(DocLearningPath path, DocLearningPathSaveDTO dto) {
        path.setName(dto.getName().trim());
        path.setDescription(StringUtils.hasText(dto.getDescription()) ? dto.getDescription().trim() : null);
        path.setStatus(dto.getStatus() == null ? 1 : dto.getStatus());
        path.setSortOrder(dto.getSortOrder() == null ? 0 : dto.getSortOrder());
    }

    private DocLearningPath requirePath(Long id) {
        DocLearningPath path = id == null ? null : pathMapper.selectById(id);
        if (path == null) {
            throw new BusinessException("學習路徑不存在或已刪除");
        }
        return path;
    }

    /** 本人已讀節點集合（口徑：存在本人的打開留痕；登錄人查不到時返回空集） */
    private Set<Long> myReadNodes(String username, List<Long> candidateNodeIds) {
        if (candidateNodeIds.isEmpty() || !StringUtils.hasText(username)) {
            return Set.of();
        }
        SysUser me = findByUsername(username);
        if (me == null) {
            return Set.of();
        }
        return viewLogMapper.selectList(new LambdaQueryWrapper<DocViewLog>()
                        .eq(DocViewLog::getUserId, me.getId())
                        .in(DocViewLog::getNodeId, candidateNodeIds)
                        .select(DocViewLog::getNodeId))
                .stream().map(DocViewLog::getNodeId).collect(Collectors.toSet());
    }

    /** 每个文档的全局去重阅读人数（管理侧判断培训覆盖面） */
    private Map<Long, Long> readerCounts(List<Long> nodeIds) {
        return viewLogMapper.selectList(new LambdaQueryWrapper<DocViewLog>()
                        .in(DocViewLog::getNodeId, nodeIds)
                        .select(DocViewLog::getNodeId, DocViewLog::getUserId))
                .stream()
                .filter(l -> l.getUserId() != null)
                .collect(Collectors.groupingBy(DocViewLog::getNodeId,
                        Collectors.mapping(DocViewLog::getUserId, Collectors.toSet())))
                .entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> (long) e.getValue().size()));
    }

    private Map<Long, String> spaceNames() {
        return spaceMapper.selectList(null).stream()
                .collect(Collectors.toMap(DocSpace::getId, DocSpace::getName, (a, b) -> a));
    }

    private SysUser findByUsername(String username) {
        return Optional.ofNullable(userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                        .eq(SysUser::getUsername, username)
                        .last("LIMIT 1")))
                .filter(l -> !l.isEmpty())
                .map(l -> l.get(0))
                .orElse(null);
    }
}
