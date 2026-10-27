package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.mftb.admin.client.TencentDocsClient;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.DocConstants;
import com.mftb.admin.entity.DocNode;
import com.mftb.admin.mapper.DocNodeMapper;
import com.mftb.admin.service.doc.DocIndexService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.HashSet;
import java.util.Set;

/**
 * 騰訊文檔目錄樹同步：把開放平台文件夾下的文檔拉成 doc_node 元數據索引。
 * <p>約束：只同步目錄層元數據（標題/類型/鏈接），不同步正文；深度與條數雙重封頂，
 * 對齊個人開發者 2000 次/天配額；fileID 為冪等鍵，重複同步只更新不長新行。
 * <p>同步落點空間由 TENCENT_DOCS_SYNC_SPACE_ID 指定（默認 1=需求文檔），
 * 管理員可在空間管理裡遷移歸屬。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DocTencentSyncService {

    /** 遞歸深度封頂：防目錄環與超深樹吃配額 */
    private static final int MAX_DEPTH = 3;
    /** 單次同步條數封頂：500 篇足够覆蓋季度量級，剩餘下次續傳 */
    private static final int MAX_FILES = 500;

    private final TencentDocsClient client;
    private final DocNodeMapper nodeMapper;
    private final DocIndexService searchIndex;

    @Value("${tencent.docs.sync-space-id:1}")
    private Long syncSpaceId;

    public record SyncResult(int created, int updated, int skipped) {}

    public SyncResult sync() {
        if (!client.isEnabled()) {
            throw new BusinessException("騰訊文檔集成未配置，請在 backend/.env.local 設置 TENCENT_DOCS_* 變量後重啟");
        }
        String root = client.rootFolderId();
        if (!StringUtils.hasText(root)) {
            throw new BusinessException("未配置 TENCENT_DOCS_ROOT_FOLDER_ID（騰訊文檔目錄 ID）");
        }
        int[] counters = new int[3];
        walk(root, 1, counters, new HashSet<>());
        log.info("騰訊文檔目錄同步完成: created={} updated={} skipped={}", counters[0], counters[1], counters[2]);
        return new SyncResult(counters[0], counters[1], counters[2]);
    }

    /** 配額用量透傳（前端空間管理頁展示） */
    public JsonNode quota() {
        return client.resourceUse();
    }

    private void walk(String folderId, int depth, int[] counters, Set<String> seenFolders) {
        if (depth > MAX_DEPTH || !seenFolders.add(folderId) || counters[0] + counters[1] >= MAX_FILES) {
            counters[2]++;
            return;
        }
        JsonNode children = client.listFolder(folderId);
        if (!children.isArray()) {
            return;
        }
        for (JsonNode child : children) {
            String type = child.path("file_type").asText(child.path("type").asText(""));
            String fileId = child.path("file_id").asText("");
            if (!StringUtils.hasText(fileId)) {
                continue;
            }
            if ("folder".equalsIgnoreCase(type) || "directory".equalsIgnoreCase(type)) {
                walk(fileId, depth + 1, counters, seenFolders);
            } else {
                upsert(child, fileId, type, counters);
            }
        }
    }

    private void upsert(JsonNode child, String fileId, String type, int[] counters) {
        if (counters[0] + counters[1] >= MAX_FILES) {
            counters[2]++;
            return;
        }
        String title = child.path("title").asText(child.path("name").asText("")).trim();
        if (title.isEmpty()) {
            title = "未命名文檔";
        }
        String link = child.path("link").asText(child.path("url").asText("")).trim();
        if (link.isEmpty() || !link.startsWith("https://docs.qq.com/")) {
            link = "https://docs.qq.com/doc/" + fileId;
        }
        DocNode existing = nodeMapper.selectList(new LambdaQueryWrapper<DocNode>()
                        .eq(DocNode::getTencentFileId, fileId)
                        .last("LIMIT 1"))
                .stream().findFirst().orElse(null);
        if (existing == null) {
            DocNode node = new DocNode();
            node.setSpaceId(syncSpaceId);
            node.setCategory("騰訊文檔同步");
            node.setTitle(title.length() > DocConstants.TITLE_MAX ? title.substring(0, DocConstants.TITLE_MAX) : title);
            node.setDocType(mapType(type));
            node.setStatus(DocConstants.STATUS_PUBLISHED);
            node.setTencentFileId(fileId);
            node.setTencentUrl(link);
            node.setOwnerName(child.path("owner").path("name").asText("騰訊文檔同步"));
            node.setCreatedBy("system");
            node.setUpdatedBy("system");
            nodeMapper.insert(node);
            searchIndex.upsert(node.getId());
            counters[0]++;
        } else {
            existing.setTitle(title.length() > DocConstants.TITLE_MAX ? title.substring(0, DocConstants.TITLE_MAX) : existing.getTitle());
            existing.setDocType(mapType(type));
            existing.setTencentUrl(link);
            existing.setUpdatedBy("system");
            nodeMapper.updateById(existing);
            searchIndex.upsert(existing.getId());
            counters[1]++;
        }
    }

    /** 騰訊文檔 file_type → 本庫 doc_type 整型口徑（未知類型按在線文檔兜底） */
    private int mapType(String tencentType) {
        String t = tencentType == null ? "" : tencentType.toLowerCase();
        if (t.contains("sheet") || t.contains("excel") || t.contains("xlc")) {
            return DocConstants.TYPE_SHEET;
        }
        if (t.contains("slide") || t.contains("ppt")) {
            return DocConstants.TYPE_SLIDE;
        }
        if (t.contains("pdf")) {
            return DocConstants.TYPE_PDF;
        }
        return DocConstants.TYPE_DOC;
    }
}
