package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.DocConstants;
import com.mftb.admin.dto.DocNodeSaveDTO;
import com.mftb.admin.dto.DocNodeVO;
import com.mftb.admin.dto.DocSpaceSaveDTO;
import com.mftb.admin.dto.DocStatsVO;
import com.mftb.admin.dto.DocViewLogVO;
import com.mftb.admin.dto.DocViewStatsVO;
import com.mftb.admin.dto.DocLearningPathDetailVO;
import com.mftb.admin.dto.DocLearningPathSaveDTO;
import com.mftb.admin.dto.DocLearningPathVO;
import com.mftb.admin.entity.DocLearningPath;
import com.mftb.admin.entity.DocSpace;
import com.mftb.admin.service.DocLearningService;
import com.mftb.admin.service.DocService;
import com.mftb.admin.service.DocTencentSyncService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 文檔中心接口：元數據索引、查閱留痕、空間維護與騰訊文檔同步。
 * <p>權限：菜單級門禁（產品決策）——查閱類錨 doc-library:view，
 * 登記/維護錨 doc-library:edit，空間管理與同步錨 doc-space。
 * 查閱人身份取後端認證principal，不接受前端傳參。
 */
@RestController
@RequestMapping("/api/doc")
@RequiredArgsConstructor
public class DocController {

    private final DocService docService;
    private final DocTencentSyncService tencentSyncService;
    private final DocLearningService docLearningService;

    /* ==================== 空間 ==================== */

    /** 空間下拉：文檔庫與空間管理都要消費，anyOf 放行兩個菜單 */
    @GetMapping("/spaces")
    @RequirePermission(menu = DocConstants.MENU_LIBRARY, anyOf = {DocConstants.MENU_SPACE})
    public Result<List<DocSpace>> spaces() {
        return Result.success(docService.listSpaces());
    }

    @PostMapping("/spaces")
    @RequirePermission(menu = DocConstants.MENU_SPACE, action = "edit")
    public Result<DocSpace> createSpace(@RequestBody DocSpaceSaveDTO dto) {
        return Result.success(docService.createSpace(dto, currentUsername()));
    }

    @PutMapping("/spaces/{id}")
    @RequirePermission(menu = DocConstants.MENU_SPACE, action = "edit")
    public Result<DocSpace> updateSpace(@PathVariable Long id, @RequestBody DocSpaceSaveDTO dto) {
        return Result.success(docService.updateSpace(id, dto, currentUsername()));
    }

    @DeleteMapping("/spaces/{id}")
    @RequirePermission(menu = DocConstants.MENU_SPACE, action = "edit")
    public Result<Void> deleteSpace(@PathVariable Long id) {
        docService.deleteSpace(id);
        return Result.success(null);
    }

    /* ==================== 文檔索引 ==================== */

    @GetMapping("/nodes")
    @RequirePermission(menu = DocConstants.MENU_LIBRARY)
    public Result<List<DocNodeVO>> nodes(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long spaceId,
            @RequestParam(required = false) Integer status,
            @RequestParam(required = false) Integer docType,
            @RequestParam(required = false) String bizType,
            @RequestParam(required = false) Long bizId) {
        return Result.success(docService.listNodes(keyword, spaceId, status, docType, bizType, bizId));
    }

    /** 統計口徑跟隨搜索條件：與 /nodes 傳同一組 filters */
    @GetMapping("/nodes/stats")
    @RequirePermission(menu = DocConstants.MENU_LIBRARY)
    public Result<DocStatsVO> stats(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long spaceId,
            @RequestParam(required = false) Integer status,
            @RequestParam(required = false) Integer docType,
            @RequestParam(required = false) String bizType,
            @RequestParam(required = false) Long bizId) {
        return Result.success(docService.stats(keyword, spaceId, status, docType, bizType, bizId));
    }

    /** 詳情（打開即寫查閱留痕） */
    @GetMapping("/nodes/{id}")
    @RequirePermission(menu = DocConstants.MENU_LIBRARY)
    public Result<DocNodeVO> detail(@PathVariable Long id) {
        return Result.success(docService.detail(id, currentUsername()));
    }

    @GetMapping("/nodes/{id}/view-logs")
    @RequirePermission(menu = DocConstants.MENU_LIBRARY)
    public Result<List<DocViewLogVO>> viewLogs(@PathVariable Long id,
                                               @RequestParam(defaultValue = "50") int limit) {
        return Result.success(docService.viewLogs(id, limit));
    }

    /** 頁面離開時上報停留時長（培訓完成度口徑的時長來源） */
    @PostMapping("/nodes/{id}/view-report")
    @RequirePermission(menu = DocConstants.MENU_LIBRARY)
    public Result<Void> reportView(@PathVariable Long id, @RequestBody Map<String, Integer> body) {
        docService.reportDuration(id, currentUsername(), body.get("durationSec"));
        return Result.success(null);
    }

    /** 閱讀統計看板（doc-stats 菜單）：期間窗口內按文檔聚合的閱讀口徑 */
    @GetMapping("/view-stats")
    @RequirePermission(menu = DocConstants.MENU_STATS)
    public Result<DocViewStatsVO> viewStats(
            @RequestParam(defaultValue = "30") int days,
            @RequestParam(required = false) Long spaceId) {
        return Result.success(docService.viewStats(days, spaceId));
    }

    @PostMapping("/nodes")
    @RequirePermission(menu = DocConstants.MENU_LIBRARY, action = "edit")
    public Result<DocNodeVO> create(@RequestBody DocNodeSaveDTO dto) {
        return Result.success(docService.create(dto, currentUsername()));
    }

    @PutMapping("/nodes/{id}")
    @RequirePermission(menu = DocConstants.MENU_LIBRARY, action = "edit")
    public Result<DocNodeVO> update(@PathVariable Long id, @RequestBody DocNodeSaveDTO dto) {
        return Result.success(docService.update(id, dto, currentUsername()));
    }

    @DeleteMapping("/nodes/{id}")
    @RequirePermission(menu = DocConstants.MENU_LIBRARY, action = "edit")
    public Result<Void> delete(@PathVariable Long id) {
        docService.delete(id, currentUsername());
        return Result.success(null);
    }

    /* ==================== 學習路徑（新人入職包/培訓清單） ==================== */

    /** 學習路徑列表：附條目數與本人完成數 */
    @GetMapping("/learning-paths")
    @RequirePermission(menu = DocConstants.MENU_LEARNING)
    public Result<List<DocLearningPathVO>> learningPaths(@RequestParam(required = false) String keyword) {
        return Result.success(docLearningService.listPaths(keyword, currentUsername()));
    }

    /** 學習路徑詳情：有序條目 + 本人已讀標記 + 全局閱讀人數 */
    @GetMapping("/learning-paths/{id}")
    @RequirePermission(menu = DocConstants.MENU_LEARNING)
    public Result<DocLearningPathDetailVO> learningPathDetail(@PathVariable Long id) {
        return Result.success(docLearningService.detail(id, currentUsername()));
    }

    @PostMapping("/learning-paths")
    @RequirePermission(menu = DocConstants.MENU_LEARNING, action = "edit")
    public Result<DocLearningPath> createLearningPath(@RequestBody DocLearningPathSaveDTO dto) {
        return Result.success(docLearningService.create(dto, currentUsername()));
    }

    @PutMapping("/learning-paths/{id}")
    @RequirePermission(menu = DocConstants.MENU_LEARNING, action = "edit")
    public Result<DocLearningPath> updateLearningPath(@PathVariable Long id, @RequestBody DocLearningPathSaveDTO dto) {
        return Result.success(docLearningService.update(id, dto, currentUsername()));
    }

    @DeleteMapping("/learning-paths/{id}")
    @RequirePermission(menu = DocConstants.MENU_LEARNING, action = "edit")
    public Result<Void> deleteLearningPath(@PathVariable Long id) {
        docLearningService.delete(id, currentUsername());
        return Result.success(null);
    }

    /* ==================== 騰訊文檔集成 ==================== */

    /** 手動觸發目錄樹同步（定時化在 P1；未配置憑據時返回明確錯誤） */
    @PostMapping("/sync/tencent")
    @RequirePermission(menu = DocConstants.MENU_SPACE, action = "edit")
    public Result<Map<String, Integer>> syncTencent() {
        DocTencentSyncService.SyncResult r = tencentSyncService.sync();
        return Result.success(Map.of("created", r.created(), "updated", r.updated(), "skipped", r.skipped()));
    }

    /** OpenAPI 配額用量（個人開發者 2000 次/天，接近上限時需降頻） */
    @GetMapping("/tencent/quota")
    @RequirePermission(menu = DocConstants.MENU_SPACE)
    public Result<Object> quota() {
        return Result.success(tencentSyncService.quota());
    }

    /** 當前登錄賬號（JWT 認證後由過濾器寫入 SecurityContext） */
    private String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return (auth != null && auth.getName() != null && !"anonymousUser".equals(auth.getName()))
                ? auth.getName() : null;
    }
}
