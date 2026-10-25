package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.DocNativeDTO.*;
import com.mftb.admin.service.doc.*;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/** 原生文档接口。入口门禁不代替服务层资源和集成身份校验。 */
@RestController
@RequestMapping("/api/doc/v2")
@RequiredArgsConstructor
public class DocNativeController {
    private final DocNativeService documents;
    private final DocNativeSpaceService spaces;
    private final DocNativeWorkflowService workflow;
    private final DocIntegrationGrantService grants;
    private final DocNativeAccess access;

    @GetMapping("/documents")
    @RequirePermission(menu="doc-plans",anyOf={"doc-library"})
    @Operation(summary="按授权范围搜索原生文档")
    public Result<Page> list(@RequestParam(required=false) String keyword,@RequestParam(required=false) Long spaceId,
                             @RequestParam(defaultValue="effective") String view,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size) {
        return Result.success(documents.search(keyword,spaceId,view,page,size));
    }
    @GetMapping("/documents/{id}")
    @RequirePermission(menu="doc-plans",anyOf={"doc-library"})
    @Operation(summary="读取有效版本或授权草稿")
    public Result<View> detail(@PathVariable long id,@RequestParam(required=false) Long revisionId,@RequestParam(defaultValue="false") boolean draft) {
        return Result.success(documents.read(id,revisionId,draft));
    }
    @GetMapping("/documents/{id}/revisions/{revisionId}")
    @RequirePermission(menu="doc-plans",anyOf={"doc-library"})
    @Operation(summary="读取固定修订版本")
    public Result<View> revision(@PathVariable long id,@PathVariable long revisionId) { return Result.success(documents.read(id,revisionId,false)); }
    @PostMapping("/documents")
    @RequirePermission(menu="doc-plans",action="edit")
    @Operation(summary="创建原生草稿，返回事务保存回执")
    public Result<Receipt> create(@Valid @RequestBody Save body,@RequestHeader("Idempotency-Key") String key) { return Result.success(documents.create(body,key)); }
    @PostMapping("/documents/{id}/revisions")
    @RequirePermission(menu="doc-plans",action="edit")
    @Operation(summary="保存新修订，校验并发版本及幂等键")
    public Result<Receipt> save(@PathVariable long id,@Valid @RequestBody Save body,@RequestHeader("Idempotency-Key") String key) { return Result.success(documents.save(id,body,key)); }
    @GetMapping("/ingest-receipts/{key}")
    @RequirePermission(menu="doc-plans")
    @Operation(summary="核验本人的保存回执，重新校验文档权限")
    public Result<Receipt> receipt(@PathVariable String key) { return Result.success(documents.getReceipt(key)); }

    @PostMapping("/documents/{id}/confirmations")
    @RequirePermission(menu="doc-plans",action="edit")
    @Operation(summary="提交具体版本供指定人员确认")
    public Result<Long> submit(@PathVariable long id,@Valid @RequestBody Submit body) { return Result.success(workflow.submit(id,body)); }
    @PostMapping("/confirmations/{id}/decision")
    @RequirePermission(menu="doc-plans",action="view")
    @Operation(summary="人工确认、退回或撤回，服务层按动作再次校验")
    public Result<Void> decision(@PathVariable long id,@Valid @RequestBody Decision body) { workflow.decide(id,body); return Result.success(); }
    @PostMapping("/documents/{id}/handoffs")
    @RequirePermission(menu="doc-plans",action="edit")
    @Operation(summary="按采用版本发起交接")
    public Result<Long> handoff(@PathVariable long id,@Valid @RequestBody HandoffSave body) { return Result.success(workflow.handoff(id,body)); }
    @PostMapping("/handoffs/{id}/accept")
    @RequirePermission(menu="doc-plans",action="edit")
    @Operation(summary="指定接手人接收交接")
    public Result<Void> accept(@PathVariable long id,@Valid @RequestBody Action body) { workflow.accept(id,body); return Result.success(); }
    @PostMapping("/documents/{id}/execution")
    @RequirePermission(menu="doc-plans",action="edit")
    @Operation(summary="登记独立方案的执行基线和证据")
    public Result<Void> execution(@PathVariable long id,@Valid @RequestBody Execution body) { workflow.execution(id,body); return Result.success(); }
    @PostMapping("/documents/{id}/trash")
    @RequirePermission(menu="doc-plans",action="edit")
    @Operation(summary="移入回收站，保留原身份和版本")
    public Result<Void> trash(@PathVariable long id,@Valid @RequestBody Action body) { documents.trash(id,body,false); return Result.success(); }
    @PostMapping("/documents/{id}/restore")
    @RequirePermission(menu="doc-plans",action="edit")
    @Operation(summary="恢复原文档而非重新登记")
    public Result<Void> restore(@PathVariable long id,@Valid @RequestBody Action body) { documents.trash(id,body,true); return Result.success(); }
    @GetMapping("/documents/{id}/acl")
    @RequirePermission(menu="doc-plans",action="view")
    @Operation(summary="读取文档收窄限制，供维护页回显")
    public Result<AclView> aclView(@PathVariable long id) { return Result.success(spaces.acl(id)); }
    @PutMapping("/documents/{id}/acl")
    @RequirePermission(menu="doc-plans",action="edit")
    @Operation(summary="维护文档收窄限制")
    public Result<Void> acl(@PathVariable long id,@Valid @RequestBody AclSave body) { spaces.saveAcl(id,body); return Result.success(); }
    @GetMapping("/documents/{id}/audit")
    @RequirePermission(menu="doc-plans")
    @Operation(summary="查询授权范围内关键操作记录")
    public Result<List<Map<String,Object>>> audit(@PathVariable long id) { return Result.success(documents.audit(id)); }
    @GetMapping("/documents/{id}/export")
    @RequirePermission(menu="doc-plans",action="export")
    @Operation(summary="按固定版本导出 Markdown，禁止集成凭据批量流出")
    public ResponseEntity<byte[]> export(@PathVariable long id,@RequestParam(required=false) Long revisionId) {
        access.human(); var view=documents.read(id,revisionId,false);
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store")
                .header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(view.document().getDocumentNo()+"-v"+view.revision().getRevisionNo()+".md").build().toString())
                .contentType(MediaType.APPLICATION_OCTET_STREAM).body(view.revision().getMarkdown().getBytes(StandardCharsets.UTF_8));
    }
    @GetMapping("/spaces")
    @RequirePermission(menu="doc-plans",anyOf={"doc-library","doc-space"})
    public Result<List<Space>> spaces() { return Result.success(spaces.spaces()); }
    @PostMapping("/spaces")
    @RequirePermission(menu="doc-space",action="edit")
    public Result<Space> space(@Valid @RequestBody SpaceSave body) { return Result.success(spaces.create(body)); }
    @GetMapping("/spaces/{id}/members")
    @RequirePermission(menu="doc-plans",anyOf={"doc-space"})
    public Result<List<Member>> members(@PathVariable long id) { return Result.success(spaces.members(id)); }
    @PutMapping("/spaces/{id}/members")
    @RequirePermission(menu="doc-space",action="edit")
    public Result<Void> member(@PathVariable long id,@Valid @RequestBody MemberSave body) { spaces.saveMember(id,body); return Result.success(); }
    @DeleteMapping("/spaces/{id}/members/{userId}")
    @RequirePermission(menu="doc-space",action="edit")
    public Result<Void> removeMember(@PathVariable long id,@PathVariable long userId) { spaces.removeMember(id,userId); return Result.success(); }
    @GetMapping("/grants")
    @RequirePermission(menu="doc-plans")
    public Result<List<Grant>> grants() { return Result.success(grants.list()); }
    @PostMapping("/grants")
    @RequirePermission(menu="doc-plans",action="edit")
    @Operation(summary="本人创建受限集成凭据，明文仅返回一次")
    public Result<GrantCreated> grant(@Valid @RequestBody GrantSave body) { return Result.success(grants.issue(body)); }
    @DeleteMapping("/grants/{id}")
    @RequirePermission(menu="doc-plans")
    public Result<Void> revoke(@PathVariable long id) { grants.revoke(id); return Result.success(); }
}
