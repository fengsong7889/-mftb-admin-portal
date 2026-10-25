package com.mftb.admin.service.doc;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocNativeDTO.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Objects;
import static com.mftb.admin.service.doc.DocNativeAccess.*;
import static com.mftb.admin.service.doc.DocContentValidation.n;

/** 人类决定与执行基线独立；固定锁顺序为空间、文档、子记录。 */
@Service
@RequiredArgsConstructor
public class DocNativeWorkflowService {
    private final DocNativeStore store;
    private final DocNativeAccess access;
    private final DocNativeSpaceService spaces;
    private final DocContentValidation validation;

    private Head lock(long id) {
        Head snapshot=store.head(id,false);
        spaces.lockSpace(snapshot.getSpaceId());
        return store.head(id,true);
    }
    @Transactional
    public long submit(long id,Submit input) {
        access.human(); validation.validate(input);
        Head head=lock(id); access.edit(head); access.live(head); access.version(head,input.expectedVersion());
        if (!Objects.equals(head.getDraftRevisionId(),input.revisionId()) || store.pending(id)!=null) throw new BusinessException(409,"指定草稿已變更或正在確認");
        spaces.requireActiveUser(input.reviewerUserId());
        if (!access.canRead(head,input.reviewerUserId()) || (access.member(head.getSpaceId(),input.reviewerUserId()) & CONFIRM)==0) throw new BusinessException(400,"確認人沒有此文檔的確認權限");
        long confirmation=store.insert("INSERT INTO doc_confirmation(node_id,revision_id,reviewer_user_id,submitted_by) VALUES(?,?,?,?)",id,input.revisionId(),input.reviewerUserId(),access.actor());
        store.bump(id); store.audit(id,head.getSpaceId(),access.actor(),"SUBMIT_CONFIRMATION",input.revisionId(),"指定確認人="+input.reviewerUserId(),null);
        return confirmation;
    }
    @Transactional
    public void decide(long confirmationId,Decision input) {
        access.human(); validation.validate(input);
        Confirmation record=store.one("SELECT * FROM doc_confirmation WHERE id=?",Confirmation.class,confirmationId);
        if (record==null) DocNativeAccess.deny();
        Head head=lock(record.getNodeId()); access.read(head); access.live(head); access.version(head,input.expectedVersion());
        record=store.one("SELECT * FROM doc_confirmation WHERE id=? FOR UPDATE",Confirmation.class,confirmationId);
        if (record.getStatus()!=1 || !Objects.equals(record.getRevisionId(),head.getDraftRevisionId())) throw new BusinessException(409,"確認申請已處理或版本已變更");
        int status;
        switch(input.decision()) {
            case "approve" -> status=2;
            case "reject" -> { if (n(input.note()).isBlank()) throw new BusinessException(400,"退回必須填寫原因"); status=3; }
            case "withdraw" -> status=4;
            default -> throw new BusinessException(400,"不支援的確認動作");
        }
        if (status==4) access.edit(head);
        else {
            access.documentMenu("confirm"); access.space(head.getSpaceId(),CONFIRM);
            if (record.getReviewerUserId()!=access.actor()) DocNativeAccess.deny();
        }
        store.jdbc().update("UPDATE doc_confirmation SET status=?,note=?,decided_by=?,decided_at=CURRENT_TIMESTAMP WHERE id=? AND status=1",status,n(input.note()),access.actor(),confirmationId);
        if (status==2) store.jdbc().update("UPDATE doc_native_document SET effective_revision_id=?,draft_revision_id=NULL WHERE node_id=?",record.getRevisionId(),head.getNodeId());
        store.bump(head.getNodeId());
        store.audit(head.getNodeId(),head.getSpaceId(),access.actor(),"CONFIRMATION_"+input.decision().toUpperCase(),record.getRevisionId(),n(input.note()),null);
    }
    @Transactional
    public long handoff(long id,HandoffSave input) {
        access.human(); validation.validate(input);
        Head head=lock(id); access.edit(head); access.live(head); access.version(head,input.expectedVersion());
        if (head.getOwnerUserId()!=access.actor()) DocNativeAccess.deny();
        Long baseline=head.getAdoptedRevisionId()!=null ? head.getAdoptedRevisionId() : head.getEffectiveRevisionId();
        if (baseline==null || !Objects.equals(baseline,input.revisionId())) throw new BusinessException(409,"交接版本必須是目前採用的有效基線");
        spaces.requireActiveUser(input.recipientUserId());
        if (input.recipientUserId()==access.actor() || !access.canRead(head,input.recipientUserId()) || (access.member(head.getSpaceId(),input.recipientUserId()) & EDIT)==0) throw new BusinessException(400,"接手人必須是可讀此文檔的空間編輯者");
        if (store.count("SELECT COUNT(*) FROM doc_handoff WHERE node_id=? AND status=1",id)>0) throw new BusinessException(409,"已有待接收的交接");
        long handoff=store.insert("INSERT INTO doc_handoff(node_id,revision_id,sender_user_id,recipient_user_id,completed_text,remaining_text,risk_text) VALUES(?,?,?,?,?,?,?)",id,baseline,access.actor(),input.recipientUserId(),input.completedText(),input.remainingText(),n(input.riskText()));
        store.jdbc().update("UPDATE doc_native_document SET adopted_revision_id=? WHERE node_id=?",baseline,id);
        store.bump(id); store.audit(id,head.getSpaceId(),access.actor(),"HANDOFF_CREATE",baseline,"接手人="+input.recipientUserId(),null);
        return handoff;
    }
    @Transactional
    public void accept(long handoffId,Action input) {
        access.human(); validation.validate(input); access.documentMenu("edit");
        Handoff handoff=store.one("SELECT * FROM doc_handoff WHERE id=?",Handoff.class,handoffId);
        if (handoff==null) DocNativeAccess.deny();
        Head head=lock(handoff.getNodeId()); access.read(head); access.live(head); access.space(head.getSpaceId(),EDIT);
        if (handoff.getRecipientUserId()!=access.actor()) DocNativeAccess.deny();
        if (handoff.getStatus()==2) return;
        access.version(head,input.expectedVersion());
        store.jdbc().update("UPDATE doc_handoff SET status=2,accepted_at=CURRENT_TIMESTAMP WHERE id=? AND status=1",handoffId);
        store.jdbc().update("UPDATE doc_native_document SET owner_user_id=?,adopted_revision_id=? WHERE node_id=?",access.actor(),handoff.getRevisionId(),head.getNodeId());
        store.bump(head.getNodeId()); store.audit(head.getNodeId(),head.getSpaceId(),access.actor(),"HANDOFF_ACCEPT",handoff.getRevisionId(),"接收指定版本",null);
    }
    @Transactional
    public void execution(long id,Execution input) {
        access.human(); validation.validate(input);
        Head head=lock(id); access.edit(head); access.live(head); access.version(head,input.expectedVersion());
        if (!List.of(1,2,3,4).contains(input.status())) throw new BusinessException(400,"執行狀態不合法");
        boolean approved=store.count("SELECT COUNT(*) FROM doc_confirmation WHERE node_id=? AND revision_id=? AND status=2",id,input.revisionId())>0;
        if (!approved) throw new BusinessException(409,"執行必須採用已確認版本");
        int old=head.getExecutionStatus(), next=input.status();
        if (!(old==next || old==1 && next==2 || old==2 && (next==3 || next==4) || old==3 && next==2)) throw new BusinessException(409,"不允許跳過執行狀態");
        store.jdbc().update("UPDATE doc_native_document SET execution_status=?,adopted_revision_id=? WHERE node_id=?",next,input.revisionId(),id);
        store.bump(id); store.audit(id,head.getSpaceId(),access.actor(),"EXECUTION_UPDATE",input.revisionId(),input.evidence(),null);
    }
}
