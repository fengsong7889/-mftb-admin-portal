package com.mftb.admin.service.doc;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 统一检索索引维护。索引是派生数据，失败只影响检索，不回滚正文事务；
 * 调用方应在保存成功后尽力更新，管理端可全量重建。
 */
@Service
@RequiredArgsConstructor
public class DocIndexService {
    private final DocNativeStore store;

    public void upsert(long nodeId) {
        store.jdbc().update("INSERT INTO doc_search_index(node_id,space_id,category_id,title,summary,body_text,tags,owner_user_id,"
                + "content_kind,confidentiality,status,effective_from,index_state,updated_at) "
                + "SELECT n.id,n.space_id,n.category_id,n.title,COALESCE(n.summary,''),"
                + "CASE WHEN COALESCE(d.content_kind,4)=1 THEN COALESCE(r.markdown,'') ELSE '' END,"
                + "COALESCE((SELECT GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ',') FROM doc_node_tag nt "
                + "JOIN doc_tag t ON t.id=nt.tag_id WHERE nt.node_id=n.id),COALESCE(n.tags,'')),"
                + "n.owner_user_id,COALESCE(d.content_kind,4),COALESCE(d.confidentiality,2),n.status,d.effective_from,"
                + "CASE WHEN COALESCE(d.content_kind,4)=1 AND r.id IS NOT NULL THEN 2 ELSE 1 END,n.updated_at "
                + "FROM doc_node n LEFT JOIN doc_native_document d ON d.node_id=n.id "
                + "LEFT JOIN doc_revision r ON r.id=COALESCE(d.effective_revision_id,d.draft_revision_id) "
                + "WHERE n.id=? "
                + "ON DUPLICATE KEY UPDATE space_id=VALUES(space_id),category_id=VALUES(category_id),title=VALUES(title),"
                + "summary=VALUES(summary),body_text=VALUES(body_text),tags=VALUES(tags),owner_user_id=VALUES(owner_user_id),"
                + "content_kind=VALUES(content_kind),confidentiality=VALUES(confidentiality),status=VALUES(status),"
                + "effective_from=VALUES(effective_from),index_state=VALUES(index_state),updated_at=VALUES(updated_at)", nodeId);
    }

    public void delete(long nodeId) {
        store.jdbc().update("DELETE FROM doc_search_index WHERE node_id=?", nodeId);
    }

    public void rebuild() {
        store.jdbc().update("INSERT INTO doc_search_index(node_id,space_id,category_id,title,summary,body_text,tags,owner_user_id,"
                + "content_kind,confidentiality,status,effective_from,index_state,updated_at) "
                + "SELECT n.id,n.space_id,n.category_id,n.title,COALESCE(n.summary,''),"
                + "CASE WHEN COALESCE(d.content_kind,4)=1 THEN COALESCE(r.markdown,'') ELSE '' END,"
                + "COALESCE((SELECT GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ',') FROM doc_node_tag nt "
                + "JOIN doc_tag t ON t.id=nt.tag_id WHERE nt.node_id=n.id),COALESCE(n.tags,'')),"
                + "n.owner_user_id,COALESCE(d.content_kind,4),COALESCE(d.confidentiality,2),n.status,d.effective_from,"
                + "CASE WHEN COALESCE(d.content_kind,4)=1 AND r.id IS NOT NULL THEN 2 ELSE 1 END,n.updated_at "
                + "FROM doc_node n LEFT JOIN doc_native_document d ON d.node_id=n.id "
                + "LEFT JOIN doc_revision r ON r.id=COALESCE(d.effective_revision_id,d.draft_revision_id) "
                + "WHERE n.deleted=0 "
                + "ON DUPLICATE KEY UPDATE space_id=VALUES(space_id),category_id=VALUES(category_id),title=VALUES(title),"
                + "summary=VALUES(summary),body_text=VALUES(body_text),tags=VALUES(tags),owner_user_id=VALUES(owner_user_id),"
                + "content_kind=VALUES(content_kind),confidentiality=VALUES(confidentiality),status=VALUES(status),"
                + "effective_from=VALUES(effective_from),index_state=VALUES(index_state),updated_at=VALUES(updated_at)");
        store.jdbc().update("DELETE i FROM doc_search_index i LEFT JOIN doc_node n ON n.id=i.node_id WHERE n.id IS NULL OR n.deleted=1");
    }
}
