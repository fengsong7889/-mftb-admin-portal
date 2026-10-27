package com.mftb.admin.service.doc;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocNativeDTO.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.time.Year;
import java.util.*;
import java.util.function.Supplier;
import static com.mftb.admin.service.doc.DocNativeAccess.*;
import static com.mftb.admin.service.doc.DocContentValidation.*;

/** 原生内容事务边界：身份、版本、幂等回执和审计同事务落地。 */
@Service
@RequiredArgsConstructor
public class DocNativeService {
    private final DocNativeStore store;
    private final DocNativeAccess access;
    private final DocNativeSpaceService spaces;
    private final DocContentValidation validation;
    private final DocIndexService index;

    @Transactional
    public Receipt create(Save input,String key) {
        Save body=validation.content(input);
        access.documentMenu("edit"); access.space(body.spaceId(),EDIT);
        if (body.sourceSessionKey()==null || body.sourceSessionKey().isBlank()) throw new BusinessException(400,"缺少來源會話標識");
        return once(key,"create",body,()->{
            spaces.lockSpace(body.spaceId()); access.space(body.spaceId(),EDIT); validateScope(body);
            long actor=access.actor();
            if (store.count("SELECT COUNT(*) FROM doc_native_document WHERE created_by_user_id=? AND source_key=?",actor,body.sourceSessionKey())>0)
                throw new BusinessException(409,"此來源已建立文檔，請依回執取得原編號後更新");
            long id=store.insert("INSERT INTO doc_node(space_id,category,title,doc_type,status,tencent_url,owner_user_id,owner_name,created_by,updated_by,deleted) VALUES(?,'原生方案','原生文檔',1,1,'',?,?,?,?,0)",body.spaceId(),actor,access.user().getName(),access.user().getUsername(),access.user().getUsername());
            String number="PLAN-"+Year.now().getValue()+"-"+String.format("%06d",id);
            store.jdbc().update("INSERT INTO doc_native_document(node_id,document_no,space_id,owner_user_id,created_by_user_id,source_key,review_due_at) VALUES(?,?,?,?,?,?,DATE_ADD(CURRENT_DATE,INTERVAL 90 DAY))",id,number,body.spaceId(),actor,actor,body.sourceSessionKey());
            long revisionId=insertRevision(id,1,body);
            store.jdbc().update("UPDATE doc_native_document SET draft_revision_id=? WHERE node_id=?",revisionId,id);
            store.audit(id,body.spaceId(),actor,"CREATE_DRAFT",revisionId,body.changeReason(),key);
            index.upsert(id);
            return receipt(id,revisionId);
        });
    }
    @Transactional
    public Receipt save(long id,Save input,String key) {
        Save body=validation.content(input);
        Head initial=store.head(id,false); access.edit(initial);
        return once(key,"revision:"+id,body,()->{
            spaces.lockSpace(initial.getSpaceId());
            Head head=store.head(id,true); access.edit(head); access.live(head); access.version(head,body.expectedVersion());
            if (body.spaceId()!=head.getSpaceId().longValue()) throw new BusinessException(400,"修改正文不能移動空間");
            if (store.pending(id)!=null) throw new BusinessException(409,"待確認內容不可修改，請先撤回");
            validateScope(body);
            Long current=head.getDraftRevisionId()!=null ? head.getDraftRevisionId() : head.getEffectiveRevisionId();
            if (current!=null && validation.contentHash(body).equals(store.revision(id,current).getContentHash())) return receipt(id,current);
            int number=(int)store.count("SELECT COALESCE(MAX(revision_no),0)+1 FROM doc_revision WHERE node_id=?",id);
            long revisionId=insertRevision(id,number,body);
            store.jdbc().update("UPDATE doc_native_document SET draft_revision_id=? WHERE node_id=?",revisionId,id);
            store.bump(id); store.audit(id,head.getSpaceId(),access.actor(),"SAVE_REVISION",revisionId,body.changeReason(),key);
            index.upsert(id);
            return receipt(id,revisionId);
        });
    }
    private long insertRevision(long id,int number,Save body) {
        return store.insert("INSERT INTO doc_revision(node_id,revision_no,title,summary,markdown,tags_json,system_code,menu_key,original_filename,content_hash,change_reason,created_by_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                id,number,body.title(),body.summary(),body.markdown(),validation.encode(body.tags()),body.systemCode(),body.menuKey(),body.originalFilename(),validation.contentHash(body),body.changeReason(),access.actor());
    }
    private void validateScope(Save body) {
        if (!body.systemCode().isEmpty() && store.count("SELECT COUNT(*) FROM sys_system WHERE code=? AND status=1",body.systemCode())==0) throw new BusinessException(400,"所選系統不存在");
        if (!body.menuKey().isEmpty() && store.count("SELECT COUNT(*) FROM sys_menu WHERE menu_key=? AND system_code=? AND deleted=0",body.menuKey(),body.systemCode())==0) throw new BusinessException(400,"所選菜單不屬於此系統");
    }
    private Receipt receipt(long id,long revisionId) {
        Head head=store.head(id,false); Revision revision=store.revision(id,revisionId);
        return new Receipt(id,head.getDocumentNo(),revisionId,revision.getContentHash(),head.getVersion(),revision.getCreatedAt(),"/doc-plans/detail?id="+id+"&revision="+revisionId);
    }
    private Receipt once(String key,String operation,Object body,Supplier<Receipt> action) {
        if (key==null || !key.matches("[A-Za-z0-9_.:-]{8,128}")) throw new BusinessException(400,"必須提供有效的 Idempotency-Key");
        long actor=access.actor();
        String digest=hash(operation+":"+validation.encode(body));
        store.jdbc().update("INSERT INTO doc_ingest_request(actor_user_id,request_key,request_hash) VALUES(?,?,?) ON DUPLICATE KEY UPDATE request_key=VALUES(request_key)",actor,key,digest);
        var row=store.jdbc().queryForMap("SELECT request_hash,response_json FROM doc_ingest_request WHERE actor_user_id=? AND request_key=? FOR UPDATE",actor,key);
        if (!digest.equals(row.get("request_hash"))) throw new BusinessException(409,"同一幂等鍵不可提交不同內容");
        if (row.get("response_json")!=null) {
            Receipt stored=validation.decode(row.get("response_json").toString(),Receipt.class);
            read(stored.documentId(),stored.revisionId(),false);
            return stored;
        }
        Receipt result=action.get();
        store.jdbc().update("UPDATE doc_ingest_request SET node_id=?,response_json=? WHERE actor_user_id=? AND request_key=?",result.documentId(),validation.encode(result),actor,key);
        return result;
    }
    public Receipt getReceipt(String key) {
        access.documentMenu("view");
        var rows=store.jdbc().queryForList("SELECT response_json FROM doc_ingest_request WHERE actor_user_id=? AND request_key=?",String.class,access.actor(),key);
        if (rows.isEmpty() || rows.get(0)==null) throw new BusinessException(404,"未找到已完成的保存回執");
        Receipt receipt=validation.decode(rows.get(0),Receipt.class);
        read(receipt.documentId(),receipt.revisionId(),false);
        return receipt;
    }

    public View read(long id,Long revisionId,boolean draft) {
        Head head=store.head(id,false); access.read(head);
        boolean editor=access.canEdit(head,access.actor());
        boolean canDraft=access.canDraft(head,access.actor());
        if (head.getDeletedAt()!=null && !editor) DocNativeAccess.deny();
        Long chosen=revisionId!=null ? revisionId : draft ? head.getDraftRevisionId() : head.getEffectiveRevisionId();
        if (chosen==null && canDraft) chosen=head.getDraftRevisionId();
        if (chosen==null) DocNativeAccess.deny();
        Revision revision=store.revision(id,chosen);
        boolean approved=store.count("SELECT COUNT(*) FROM doc_confirmation WHERE node_id=? AND revision_id=? AND status=2",id,chosen)>0;
        if (!approved && !Objects.equals(head.getEffectiveRevisionId(),chosen) && !canDraft) DocNativeAccess.deny();
        List<Revision> history=store.rows("SELECT id,node_id,revision_no,title,summary,tags_json,system_code,menu_key,original_filename,content_hash,change_reason,created_by_user_id,created_at FROM doc_revision r WHERE node_id=? AND (?=1 OR id=? OR EXISTS(SELECT 1 FROM doc_confirmation c WHERE c.node_id=r.node_id AND c.revision_id=r.id AND c.status=2)) ORDER BY revision_no DESC LIMIT 100",Revision.class,id,canDraft?1:0,head.getEffectiveRevisionId()==null?-1L:head.getEffectiveRevisionId());
        List<String> actions=new ArrayList<>();
        actions.add("read");
        if (editor && head.getLifecycle()==1 && head.getDeletedAt()==null && store.pending(id)==null) actions.add("edit");
        if (access.integration()==null) {
            if (editor) actions.addAll(List.of("confirm-request","handoff","trash","restore","acl","execution"));
            var pending=store.pending(id);
            if (pending!=null && pending.getReviewerUserId()==access.actor() && (access.member(head.getSpaceId(),access.actor()) & CONFIRM)!=0) actions.add("confirm-decision");
        }
        if (!canDraft) head.setDraftRevisionId(null);
        var confirmations=canDraft ? store.rows("SELECT * FROM doc_confirmation WHERE node_id=? ORDER BY id DESC LIMIT 100",Confirmation.class,id) : List.<Confirmation>of();
        var handoffs=store.rows("SELECT * FROM doc_handoff WHERE node_id=? ORDER BY id DESC LIMIT 100",Handoff.class,id);
        return new View(head,revision,history,actions,confirmations,handoffs);
    }

    /** 搜索先做资源/版本过滤再计数分页，绝不先全库取结果后由前端裁剪。 */
    public Page search(String keyword,Long spaceId,String view,int page,int size) {
        access.documentMenu("view");
        if (!List.of("effective","drafts","trash","history").contains(view)) throw new BusinessException(400,"不支援的搜尋範圍");
        if (keyword!=null && keyword.length()>100) throw new BusinessException(400,"關鍵字過長");
        int safePage=Math.max(1,Math.min(page,100000)), safeSize=Math.max(1,Math.min(size,100));
        long actor=access.actor();
        String owner="(d.owner_user_id=:actor OR d.created_by_user_id=:actor)";
        String edit="((m.permissions & 2)<>0 AND ("+owner+" OR (COALESCE(a.permissions,0) & 2)<>0))";
        String canDraft="("+edit+" OR ((m.permissions & 4)<>0 AND EXISTS(SELECT 1 FROM doc_confirmation c WHERE c.node_id=d.node_id AND c.status=1 AND c.reviewer_user_id=:actor)))";
        String selected="drafts".equals(view) ? "d.draft_revision_id" : "COALESCE(d.effective_revision_id,CASE WHEN "+canDraft+" THEN d.draft_revision_id END)";
        String from=" FROM doc_native_document d JOIN doc_space s ON s.id=d.space_id AND s.deleted=0 JOIN doc_space_member m ON m.space_id=d.space_id AND m.user_id=:actor LEFT JOIN doc_document_acl a ON a.node_id=d.node_id AND a.user_id=:actor JOIN doc_revision r ON r.id="+selected+" WHERE (m.permissions & 1)<>0 AND (d.restricted=0 OR "+owner+" OR (COALESCE(a.permissions,0) & 1)<>0)";
        from += "trash".equals(view) ? " AND d.deleted_at IS NOT NULL AND "+edit : " AND d.deleted_at IS NULL";
        if ("effective".equals(view) || "drafts".equals(view)) from+=" AND d.lifecycle=1";
        if ("drafts".equals(view)) from+=" AND "+canDraft;
        var params=new MapSqlParameterSource("actor",actor);
        if (spaceId!=null) { from+=" AND d.space_id=:space"; params.addValue("space",spaceId); }
        if (access.integration()!=null) { from+=" AND d.space_id=:grantSpace"; params.addValue("grantSpace",access.integration().grant().getSpaceId()); }
        if (keyword!=null && !keyword.isBlank()) {
            from+=" AND (MATCH(r.title,r.summary,r.markdown) AGAINST(:keyword IN NATURAL LANGUAGE MODE) OR d.document_no=:keyword OR LOCATE(:keyword,r.title)>0 OR LOCATE(:keyword,r.original_filename)>0 OR LOCATE(:keyword,r.tags_json)>0 OR r.system_code=:keyword OR r.menu_key=:keyword)";
            params.addValue("keyword",keyword.trim());
        }
        var jdbc=new NamedParameterJdbcTemplate(store.jdbc());
        Long total=jdbc.queryForObject("SELECT COUNT(*)"+from,params,Long.class);
        params.addValue("limit",safeSize).addValue("offset",(safePage-1)*safeSize);
        List<Long> ids=jdbc.queryForList("SELECT d.node_id"+from+" ORDER BY d.updated_at DESC,d.node_id DESC LIMIT :limit OFFSET :offset",params,Long.class);
        List<View> result=new ArrayList<>();
        for (long id:ids) {
            View detail=read(id,null,"drafts".equals(view));
            detail.revision().setMarkdown(null);
            result.add(new View(detail.document(),detail.revision(),List.of(),detail.allowedActions(),List.of(),List.of()));
        }
        return new Page(result,total==null?0:total,safePage,safeSize);
    }

    @Transactional
    public void trash(long id,Action input,boolean restore) {
        access.human(); validation.validate(input); Head head=store.head(id,true); access.edit(head); access.version(head,input.expectedVersion());
        if (!restore && (input.reason()==null || input.reason().isBlank())) throw new BusinessException(400,"移除必須填寫原因");
        if (!restore && store.pending(id)!=null) throw new BusinessException(409,"請先撤回待確認申請");
        store.jdbc().update("UPDATE doc_native_document SET deleted_at=?,deleted_by=?,deletion_reason=? WHERE node_id=?",restore?null:LocalDateTime.now(),restore?null:access.actor(),restore?null:input.reason(),id);
        store.bump(id); store.audit(id,head.getSpaceId(),access.actor(),restore?"RESTORE":"TRASH",null,n(input.reason()),null);
        if (restore) index.upsert(id); else index.delete(id);
    }
    public List<Map<String,Object>> audit(long id) {
        access.human(); Head head=store.head(id,false); access.read(head);
        if (!access.canEdit(head,access.actor())) access.space(head.getSpaceId(),MANAGE);
        return store.jdbc().queryForList("SELECT id,action,revision_id,detail,actor_user_id,created_at FROM doc_audit_event WHERE node_id=? ORDER BY id DESC LIMIT 100",id);
    }
}
