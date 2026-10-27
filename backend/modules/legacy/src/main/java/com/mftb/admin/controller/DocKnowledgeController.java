package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.DocKnowledgeDTO.*;
import com.mftb.admin.service.doc.DocAckService;
import com.mftb.admin.service.doc.DocAssetService;
import com.mftb.admin.service.doc.DocClearanceService;
import com.mftb.admin.service.doc.DocApiSpecService;
import com.mftb.admin.service.doc.DocApiCatalogService;
import com.mftb.admin.service.doc.DocArchiveService;
import com.mftb.admin.service.doc.DocKnowledgeService;
import com.mftb.admin.service.doc.DocSystemPlanService;
import com.mftb.admin.service.doc.DocReadingService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/** P0 知识库接口。注解门禁不替代服务层的空间、ACL、密级校验。 */
@RestController
@RequestMapping("/api/doc/v3")
@RequiredArgsConstructor
public class DocKnowledgeController {
    private final DocKnowledgeService knowledge;
    private final DocAssetService assets;
    private final DocClearanceService clearances;
    private final DocAckService acks;
    private final DocReadingService readings;
    private final DocApiSpecService apiSpecs;
    private final DocArchiveService archives;
    private final DocSystemPlanService systemPlans;
    private final DocApiCatalogService apiCatalog;

    @GetMapping("/spaces")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    public Result<List<Space>> spaces() {
        return Result.success(knowledge.spaces());
    }

    @GetMapping("/catalog/tree")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    public Result<List<CategoryNode>> tree(@RequestParam long spaceId) {
        return Result.success(knowledge.categoryTree(spaceId));
    }

    @PostMapping("/catalog/categories")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    public Result<CategoryNode> createCategory(@RequestParam long spaceId, @Valid @RequestBody CategorySave body) {
        return Result.success(knowledge.createCategory(spaceId, body));
    }

    @PutMapping("/catalog/categories/{id}")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    public Result<CategoryNode> updateCategory(@PathVariable long id, @Valid @RequestBody CategorySave body) {
        return Result.success(knowledge.updateCategory(id, body));
    }

    @DeleteMapping("/catalog/categories/{id}")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    public Result<Void> disableCategory(@PathVariable long id) {
        knowledge.disableCategory(id);
        return Result.success();
    }

    @GetMapping("/tags")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    public Result<List<Tag>> tags(@RequestParam(required = false) Long spaceId) {
        return Result.success(knowledge.tags(spaceId));
    }

    @PostMapping("/tags")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    public Result<Tag> createTag(@RequestParam(required = false) Long spaceId, @Valid @RequestBody TagSave body) {
        return Result.success(knowledge.createTag(spaceId, body));
    }

    @DeleteMapping("/tags/{id}")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    public Result<Void> disableTag(@PathVariable long id) {
        knowledge.disableTag(id);
        return Result.success();
    }

    @GetMapping("/search")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "权限与密级过滤后的分面检索")
    public Result<Page> search(@RequestParam(required = false) String keyword,
                               @RequestParam(required = false) Long spaceId,
                               @RequestParam(required = false) Long categoryId,
                               @RequestParam(required = false) Integer contentKind,
                               @RequestParam(required = false) Integer confidentiality,
                               @RequestParam(required = false) Integer status,
                               @RequestParam(defaultValue = "1") int page,
                               @RequestParam(defaultValue = "20") int size) {
        return Result.success(knowledge.search(keyword, spaceId, categoryId, contentKind, confidentiality, status, page, size));
    }

    @GetMapping("/search/stats")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    public Result<Stats> stats(@RequestParam(required = false) String keyword,
                               @RequestParam(required = false) Long spaceId,
                               @RequestParam(required = false) Long categoryId,
                               @RequestParam(required = false) Integer contentKind,
                               @RequestParam(required = false) Integer confidentiality,
                               @RequestParam(required = false) Integer status) {
        return Result.success(knowledge.stats(keyword, spaceId, categoryId, contentKind, confidentiality, status));
    }

    @GetMapping("/documents/{id}")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    public Result<Detail> detail(@PathVariable long id, @RequestParam(required = false) Long revisionId) {
        return Result.success(knowledge.detail(id, revisionId));
    }

    @PostMapping("/documents")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    @Operation(summary = "创建知识库文档，返回事务保存回执")
    public Result<Receipt> create(@Valid @RequestBody DocWrite body,
                                  @RequestHeader("Idempotency-Key") String key) {
        return Result.success(knowledge.create(body, key));
    }

    @PostMapping("/documents/{id}/revisions")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    @Operation(summary = "保存新修订，校验并发版本与幂等键")
    public Result<Receipt> save(@PathVariable long id, @Valid @RequestBody DocWrite body,
                                @RequestHeader("Idempotency-Key") String key) {
        return Result.success(knowledge.save(id, body, key));
    }

    @GetMapping("/documents/{id}/acl")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    public Result<List<AclEntry>> acl(@PathVariable long id) {
        return Result.success(knowledge.acl(id));
    }

    @PutMapping("/documents/{id}/acl")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    public Result<Void> saveAcl(@PathVariable long id, @Valid @RequestBody AclSave body) {
        knowledge.saveAcl(id, body);
        return Result.success();
    }

    /**
     * 原始字节流上传：绕过全局 multipart 2MB 限制，避免为单个大文件放宽所有表单接口。
     * Content-Length 必填，服务端边写边算 SHA-256，并在落盘前校验 magic bytes。
     */
    @PostMapping("/assets/upload")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    public Result<Asset> upload(@RequestParam long spaceId,
                                @RequestParam String fileName,
                                @RequestHeader(value = "Content-Type", required = false) String contentType,
                                @RequestHeader(value = "Content-Length", required = false) Long contentLength,
                                HttpServletRequest request) throws IOException {
        long length = contentLength == null ? request.getContentLengthLong() : contentLength;
        return Result.success(assets.upload(spaceId, fileName, contentType, length, request.getInputStream()));
    }

    @GetMapping("/assets/{id}")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    public Result<Asset> asset(@PathVariable long id) {
        return Result.success(assets.view(id));
    }

    @GetMapping("/assets/{id}/preview")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    public ResponseEntity<InputStreamResource> preview(@PathVariable long id,
                                                       @RequestParam(required = false) Long nodeId) {
        return assets.download(id, nodeId, true);
    }

    @GetMapping("/assets/{id}/download")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    public ResponseEntity<InputStreamResource> download(@PathVariable long id,
                                                        @RequestParam(required = false) Long nodeId) {
        return assets.download(id, nodeId, false);
    }

    @GetMapping("/assets/{id}/office-preview")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "Office 原件转预览 PDF；未配置转换服务时返回 503")
    public ResponseEntity<byte[]> officePreview(@PathVariable long id,
                                                @RequestParam(required = false) Long nodeId) {
        return assets.officePreview(id, nodeId);
    }

    @PostMapping("/index/rebuild")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    @Operation(summary = "重建统一检索索引；派生数据，不影响正文")
    public Result<Void> rebuildIndex() {
        knowledge.rebuildIndex();
        return Result.success();
    }

    @GetMapping("/clearances/users")
    @RequirePermission(menu = "doc-space", action = "edit")
    @Operation(summary = "搜索可授权密级的登录账号（含无员工档案的内置账号）")
    public Result<List<ClearanceUser>> clearanceUsers(@RequestParam(required = false) String keyword) {
        return Result.success(clearances.searchUsers(keyword));
    }

    @GetMapping("/clearances")
    @RequirePermission(menu = "doc-space", action = "edit")
    @Operation(summary = "列出已授予的用户密级")
    public Result<List<Clearance>> clearances(@RequestParam(required = false) String keyword) {
        return Result.success(clearances.list(keyword));
    }

    @PutMapping("/clearances/{userId}")
    @RequirePermission(menu = "doc-space", action = "edit")
    @Operation(summary = "授予或调整用户密级，写追加审计")
    public Result<Clearance> saveClearance(@PathVariable long userId, @Valid @RequestBody ClearanceSave body) {
        return Result.success(clearances.save(userId, body));
    }

    @DeleteMapping("/clearances/{userId}")
    @RequirePermission(menu = "doc-space", action = "edit")
    @Operation(summary = "撤销用户密级，回落到默认 INTERNAL")
    public Result<Void> revokeClearance(@PathVariable long userId) {
        clearances.revoke(userId);
        return Result.success();
    }

    @GetMapping("/documents/{id}/ack-targets")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "读取当前生效版本的签收范围")
    public Result<List<AckTarget>> ackTargets(@PathVariable long id) {
        return Result.success(acks.targets(id));
    }

    @PutMapping("/documents/{id}/ack-targets")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    @Operation(summary = "整体替换当前生效版本的签收范围")
    public Result<List<AckTarget>> saveAckTargets(@PathVariable long id, @Valid @RequestBody AckTargetSave body) {
        return Result.success(acks.saveTargets(id, body));
    }

    @GetMapping("/documents/{id}/ack-status")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "当前用户在该制度上的签收状态")
    public Result<AckStatus> ackStatus(@PathVariable long id) {
        return Result.success(acks.status(id));
    }

    @PostMapping("/documents/{id}/ack")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "当前用户签收当前生效版本，重复点击幂等")
    public Result<AckStatus> ack(@PathVariable long id, HttpServletRequest request) {
        return Result.success(acks.ack(id, request.getRemoteAddr(), request.getHeader("User-Agent")));
    }

    @GetMapping("/documents/{id}/ack-receipts")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "签收回执明细，仅负责人/空间管理员")
    public Result<List<AckReceipt>> ackReceipts(@PathVariable long id) {
        return Result.success(acks.receipts(id));
    }

    @GetMapping("/documents/{id}/ack-coverage")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "按签收范围聚合覆盖率，仅负责人/空间管理员")
    public Result<AckCoverage> ackCoverage(@PathVariable long id) {
        return Result.success(acks.coverage(id));
    }

    @GetMapping("/documents/{id}/ack-receipts/export")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "导出签收回执 CSV，仅负责人/空间管理员")
    public ResponseEntity<byte[]> exportAckReceipts(@PathVariable long id) {
        AckExport export = acks.exportReceipts(id);
        byte[] body = new byte[export.content().length + 3];
        body[0] = (byte) 0xEF;
        body[1] = (byte) 0xBB;
        body[2] = (byte) 0xBF;
        System.arraycopy(export.content(), 0, body, 3, export.content().length);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(export.filename(), java.nio.charset.StandardCharsets.UTF_8).build().toString())
                .contentType(new MediaType("text", "csv", java.nio.charset.StandardCharsets.UTF_8))
                .body(body);
    }

    @GetMapping("/documents/{id}/reader-state")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "读取本人阅读进度")
    public Result<ReaderState> readerState(@PathVariable long id) {
        return Result.success(readings.state(id));
    }

    @PutMapping("/documents/{id}/reader-state")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "覆盖本人阅读进度（进度只增不减）")
    public Result<ReaderState> saveReaderState(@PathVariable long id, @Valid @RequestBody ReaderStateSave body) {
        return Result.success(readings.saveState(id, body));
    }

    @GetMapping("/favorites")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "本人收藏")
    public Result<List<Favorite>> favorites() {
        return Result.success(readings.favorites());
    }

    @PutMapping("/documents/{id}/favorite")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "收藏/取消收藏")
    public Result<Boolean> toggleFavorite(@PathVariable long id,
                                          @RequestParam(required = false) String folder) {
        return Result.success(readings.toggleFavorite(id, folder));
    }

    @GetMapping("/documents/{id}/notes")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "本人阅读笔记")
    public Result<List<Note>> notes(@PathVariable long id) {
        return Result.success(readings.notes(id));
    }

    @PostMapping("/documents/{id}/notes")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "新增阅读笔记")
    public Result<Note> saveNote(@PathVariable long id, @Valid @RequestBody NoteSave body) {
        return Result.success(readings.saveNote(id, body));
    }

    @DeleteMapping("/notes/{noteId}")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "删除本人阅读笔记")
    public Result<Void> deleteNote(@PathVariable long noteId) {
        readings.deleteNote(noteId);
        return Result.success();
    }

    @GetMapping("/documents/{id}/book-meta")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "书目元数据 + 本人进度")
    public Result<BookMeta> bookMeta(@PathVariable long id) {
        return Result.success(readings.bookMeta(id));
    }

    @PutMapping("/documents/{id}/book-meta")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    @Operation(summary = "保存书目元数据")
    public Result<BookMeta> saveBookMeta(@PathVariable long id, @Valid @RequestBody BookMetaSave body) {
        return Result.success(readings.saveBookMeta(id, body));
    }

    @GetMapping("/books")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "书籍角：PDF 书目 + 本人续读进度")
    public Result<BookPage> books(@RequestParam(required = false) Long spaceId,
                                  @RequestParam(required = false) String keyword,
                                  @RequestParam(defaultValue = "1") int page,
                                  @RequestParam(defaultValue = "20") int size) {
        return Result.success(readings.books(spaceId, keyword, page, size));
    }

    @GetMapping("/documents/{id}/api-specs")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "接口规格版本列表")
    public Result<List<ApiSpec>> apiSpecs(@PathVariable long id) {
        return Result.success(apiSpecs.specs(id));
    }

    @PostMapping("/documents/{id}/api-specs")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    @Operation(summary = "导入 OpenAPI JSON/YAML 并生成操作清单与差异")
    public Result<ApiSpecView> importApiSpec(@PathVariable long id, @Valid @RequestBody ApiSpecImport body) {
        return Result.success(apiSpecs.importSpec(id, body));
    }

    @GetMapping("/api-specs/{specId}")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "接口操作清单与差异")
    public Result<ApiSpecView> apiSpec(@PathVariable long specId) {
        return Result.success(apiSpecs.view(specId));
    }

    @GetMapping("/api-specs/{specId}/diff")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "指定两版接口差异")
    public Result<List<ApiChange>> apiDiff(@PathVariable long specId,
                                           @RequestParam(required = false) Long against) {
        return Result.success(apiSpecs.diff(specId, against));
    }

    @PostMapping("/api-changes/{changeId}/ack")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    @Operation(summary = "负责人确认破坏性变更")
    public Result<ApiChange> ackApiChange(@PathVariable long changeId) {
        return Result.success(apiSpecs.ackChange(changeId));
    }

    @PostMapping("/documents/{id}/archive")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    @Operation(summary = "归档文档并设置保管期限")
    public Result<ArchiveMeta> archive(@PathVariable long id, @Valid @RequestBody ArchiveSave body) {
        return Result.success(archives.archive(id, body));
    }

    @GetMapping("/archives")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    @Operation(summary = "档案列表（保管期限/冻结/销毁状态）")
    public Result<List<ArchiveMeta>> archives(@RequestParam(required = false) String keyword,
                                              @RequestParam(defaultValue = "1") int page,
                                              @RequestParam(defaultValue = "20") int size) {
        return Result.success(archives.archives(keyword, page, size));
    }

    @PostMapping("/documents/{id}/disposal-requests")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    @Operation(summary = "发起档案销毁申请")
    public Result<DisposalRequest> requestDisposal(@PathVariable long id, @Valid @RequestBody DisposalSave body) {
        return Result.success(archives.requestDisposal(id, body));
    }

    @GetMapping("/disposal-requests")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    @Operation(summary = "销毁申请列表")
    public Result<List<DisposalRequest>> disposalRequests(@RequestParam(required = false) Integer status,
                                                          @RequestParam(defaultValue = "1") int page,
                                                          @RequestParam(defaultValue = "20") int size) {
        return Result.success(archives.requests(status, page, size));
    }

    @PostMapping("/disposal-requests/{id}/approve")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    @Operation(summary = "审批销毁（申请人不能审批自己的申请）")
    public Result<DisposalRequest> decideDisposal(@PathVariable long id, @Valid @RequestBody DisposalDecision body) {
        return Result.success(archives.decide(id, body));
    }

    @GetMapping("/disposal-requests/export")
    @RequirePermission(menu = "doc-library", action = "edit", anyOf = {"doc-plans"})
    @Operation(summary = "导出销毁清册 CSV")
    public ResponseEntity<byte[]> exportDisposals() {
        byte[] csv = archives.exportDisposalCsv();
        byte[] body = new byte[csv.length + 3];
        body[0] = (byte) 0xEF;
        body[1] = (byte) 0xBB;
        body[2] = (byte) 0xBF;
        System.arraycopy(csv, 0, body, 3, csv.length);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename("disposal-register.csv", java.nio.charset.StandardCharsets.UTF_8).build().toString())
                .contentType(new MediaType("text", "csv", java.nio.charset.StandardCharsets.UTF_8))
                .body(body);
    }

    @GetMapping("/system-plans")
    @RequirePermission(menu = "doc-system-plans", action = "view")
    @Operation(summary = "系统方案库列表")
    public Result<SystemPlanPage> systemPlans(@RequestParam(required = false) String keyword,
                                              @RequestParam(required = false) String system,
                                              @RequestParam(defaultValue = "1") int page,
                                              @RequestParam(defaultValue = "20") int size) {
        return Result.success(systemPlans.list(keyword, system, page, size));
    }

    @GetMapping("/system-plans/systems")
    @RequirePermission(menu = "doc-system-plans", action = "view")
    public Result<List<String>> systemPlanSystems() {
        return Result.success(systemPlans.systems());
    }

    @GetMapping("/system-plans/{id}")
    @RequirePermission(menu = "doc-system-plans", action = "view")
    public Result<SystemPlanDetail> systemPlan(@PathVariable long id) {
        return Result.success(systemPlans.detail(id));
    }

    @PostMapping("/system-plans/scan")
    @RequirePermission(menu = "doc-system-plans", action = "edit")
    @Operation(summary = "同步系统生成的 MD 方案文件")
    public Result<Map<String, Object>> scanSystemPlans() {
        return Result.success(systemPlans.scan());
    }

    @GetMapping("/api-center/systems")
    @RequirePermission(menu = "doc-api-center", action = "view")
    public Result<List<ApiCatalogSystem>> apiCatalogSystems() {
        return Result.success(apiCatalog.systems());
    }

    @GetMapping("/api-center/apis")
    @RequirePermission(menu = "doc-api-center", action = "view")
    public Result<ApiCatalogPage> apiCatalog(@RequestParam(required = false) String systemCode,
                                             @RequestParam(required = false) String keyword,
                                             @RequestParam(required = false) String filter,
                                             @RequestParam(defaultValue = "1") int page,
                                             @RequestParam(defaultValue = "20") int size) {
        return Result.success(apiCatalog.apis(systemCode, keyword, filter, page, size));
    }

    @GetMapping("/api-center/apis/{id}")
    @RequirePermission(menu = "doc-api-center", action = "view")
    public Result<ApiCatalogEntry> apiCatalogEntry(@PathVariable long id) {
        return Result.success(apiCatalog.api(id));
    }

    @PutMapping("/api-center/apis/{id}")
    @RequirePermission(menu = "doc-api-center", action = "edit")
    @Operation(summary = "补齐接口文档并发布/下线")
    public Result<ApiCatalogEntry> updateApiCatalogEntry(@PathVariable long id,
                                                         @Valid @RequestBody ApiCatalogSave body) {
        return Result.success(apiCatalog.update(id, body));
    }

    @PostMapping("/api-center/scan")
    @RequirePermission(menu = "doc-api-center", action = "edit")
    @Operation(summary = "扫描 Spring Controller 生成全系统接口清单")
    public Result<Map<String, Object>> scanApiCatalog() {
        return Result.success(apiCatalog.scan());
    }

    @GetMapping("/me/pending-acks")
    @RequirePermission(menu = "doc-library", anyOf = {"doc-plans"})
    @Operation(summary = "我的待签收，按 ACL/密级在 SQL 内过滤")
    public Result<PendingAckPage> pendingAcks(@RequestParam(defaultValue = "1") int page,
                                             @RequestParam(defaultValue = "20") int size) {
        return Result.success(acks.pending(page, size));
    }
}
