package com.mftb.admin.service.doc;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocNativeDTO.*;
import com.mftb.admin.mapper.SysUserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import static com.mftb.admin.service.doc.DocNativeAccess.*;

@Service
@RequiredArgsConstructor
public class DocNativeSpaceService {
    private final DocNativeStore store;
    private final DocNativeAccess access;
    private final DocContentValidation validation;
    private final SysUserMapper users;

    public List<Space> spaces() {
        access.documentMenu("view");
        long actor=access.actor();
        Long limited=access.integration()==null ? null : access.integration().grant().getSpaceId();
        return store.jdbc().query("SELECT s.id,s.name,s.description,a.owner_user_id,m.permissions FROM doc_space s JOIN doc_space_access a ON a.space_id=s.id JOIN doc_space_member m ON m.space_id=s.id AND m.user_id=? WHERE s.deleted=0 AND (m.permissions & 1)=1 AND (? IS NULL OR s.id=?) ORDER BY s.id",
                (row,index)->new Space(row.getLong("id"),row.getString("name"),row.getString("description"),row.getLong("owner_user_id"),row.getInt("permissions")), actor,limited,limited);
    }
    @Transactional
    public Space create(SpaceSave input) {
        access.human(); access.menu("doc-space","edit"); validation.validate(input);
        long actor=access.actor();
        long id=store.insert("INSERT INTO doc_space(name,description,sort_order,created_by,updated_by,deleted) VALUES(?,?,0,?,?,0)",input.name().trim(),input.description(),access.user().getUsername(),access.user().getUsername());
        store.jdbc().update("INSERT INTO doc_space_access(space_id,owner_user_id) VALUES(?,?)",id,actor);
        store.jdbc().update("INSERT INTO doc_space_member(space_id,user_id,permissions) VALUES(?,?,15)",id,actor);
        store.audit(null,id,actor,"SPACE_CREATE",null,"建立私有原生空間",null);
        return new Space(id,input.name().trim(),input.description(),actor,15);
    }
    public List<Member> members(long spaceId) {
        access.human(); access.documentMenu("view"); access.space(spaceId,READ);
        return store.jdbc().query("SELECT m.user_id,u.name,u.emp_id,m.permissions FROM doc_space_member m JOIN sys_user u ON u.id=m.user_id WHERE m.space_id=? ORDER BY m.user_id",
                (row,index)->new Member(row.getLong("user_id"),row.getString("name"),row.getString("emp_id"),row.getInt("permissions")),spaceId);
    }
    @Transactional
    public void saveMember(long spaceId, MemberSave input) {
        access.human(); access.menu("doc-space","edit"); validation.validate(input);
        lockSpace(spaceId); access.space(spaceId,MANAGE);
        if (!List.of(1,3,5,7,15).contains(input.permissions())) throw new BusinessException(400,"不支援的空間角色");
        requireActiveUser(input.userId());
        long owner=store.count("SELECT owner_user_id FROM doc_space_access WHERE space_id=?",spaceId);
        if (owner==input.userId() && input.permissions()!=15) throw new BusinessException(409,"空間負責人必須保留管理權限");
        store.jdbc().update("INSERT INTO doc_space_member(space_id,user_id,permissions) VALUES(?,?,?) ON DUPLICATE KEY UPDATE permissions=VALUES(permissions),updated_at=CURRENT_TIMESTAMP",spaceId,input.userId(),input.permissions());
        store.audit(null,spaceId,access.actor(),"MEMBER_SAVE",null,"user="+input.userId()+", permissions="+input.permissions(),null);
    }
    @Transactional
    public void removeMember(long spaceId,long userId) {
        access.human(); access.menu("doc-space","edit"); lockSpace(spaceId); access.space(spaceId,MANAGE);
        if (store.count("SELECT COUNT(*) FROM doc_space_access WHERE space_id=? AND owner_user_id=?",spaceId,userId)>0)
            throw new BusinessException(409,"不能移除空間負責人");
        store.jdbc().update("DELETE FROM doc_space_member WHERE space_id=? AND user_id=?",spaceId,userId);
        store.jdbc().update("UPDATE doc_integration_grant SET revoked_at=CURRENT_TIMESTAMP WHERE space_id=? AND owner_user_id=? AND revoked_at IS NULL",spaceId,userId);
        store.audit(null,spaceId,access.actor(),"MEMBER_REMOVE",null,"user="+userId,null);
    }
    void lockSpace(long id) {
        if (store.jdbc().queryForList("SELECT space_id FROM doc_space_access WHERE space_id=? FOR UPDATE",Long.class,id).isEmpty()) DocNativeAccess.deny();
    }
    void requireActiveUser(long id) {
        var user=users.selectById(id);
        if (user==null || !Integer.valueOf(1).equals(user.getStatus()) || Boolean.TRUE.equals(user.getMustChangePassword())) throw new BusinessException(400,"所選人員不可用");
    }
    /**
     * 回显收窄名单：只给能维护该文档的人（编辑者或空间管理员）。
     * 集成身份不允许读取权限元数据，避免机器枚举授权关系。
     */
    public AclView acl(long id) {
        access.human();
        Head head=store.head(id,false); access.read(head);
        if (!access.canEdit(head,access.actor())) access.space(head.getSpaceId(),MANAGE);
        List<Member> members=store.jdbc().query("SELECT a.user_id,u.name,u.emp_id,a.permissions FROM doc_document_acl a JOIN sys_user u ON u.id=a.user_id WHERE a.node_id=? ORDER BY a.user_id",
                (row,index)->new Member(row.getLong("user_id"),row.getString("name"),row.getString("emp_id"),row.getInt("permissions")),id);
        return new AclView(head.isRestricted(),members);
    }
    @Transactional
    public void saveAcl(long id,AclSave input) {
        access.human(); validation.validate(input);
        Head head=store.head(id,true); access.edit(head); access.version(head,input.expectedVersion());
        if (head.getOwnerUserId()!=access.actor()) access.space(head.getSpaceId(),MANAGE);
        for (MemberSave member:input.members()) {
            validation.validate(member);
            if (!List.of(1,3).contains(member.permissions()) || access.member(head.getSpaceId(),member.userId())==0) throw new BusinessException(400,"文檔限制不能跨空間授權");
        }
        store.jdbc().update("DELETE FROM doc_document_acl WHERE node_id=?",id);
        for (MemberSave member:input.members()) store.jdbc().update("INSERT INTO doc_document_acl(node_id,user_id,permissions) VALUES(?,?,?)",id,member.userId(),member.permissions());
        store.jdbc().update("UPDATE doc_native_document SET restricted=? WHERE node_id=?",input.restricted(),id);
        store.bump(id); store.audit(id,head.getSpaceId(),access.actor(),"ACL_CHANGE",null,"更新文件收窄限制",null);
    }
}
