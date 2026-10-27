package com.mftb.admin.service.doc;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocNativeDTO.*;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.PermissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import static com.mftb.admin.service.doc.DocNativeAccess.*;
import static com.mftb.admin.service.doc.DocContentValidation.hash;

/** 令牌原文只在签发时返回一次；撤权、停用、强制改密均立即阻断集成调用。 */
@Service
@RequiredArgsConstructor
public class DocIntegrationGrantService {
    public static final String TOKEN_PREFIX="docint_";
    private final DocNativeStore store;
    private final DocNativeAccess access;
    private final DocContentValidation validation;
    private final SysUserMapper users;
    private final PermissionService permissions;
    private final DocAclResolver clearances;
    private static final SecureRandom RANDOM=new SecureRandom();

    @Transactional
    public GrantCreated issue(GrantSave input) {
        access.human(); access.documentMenu("edit"); validation.validate(input);
        access.space(input.spaceId(),input.canWrite()?EDIT:READ);
        byte[] random=new byte[32]; RANDOM.nextBytes(random);
        String token=TOKEN_PREFIX+Base64.getUrlEncoder().withoutPadding().encodeToString(random);
        LocalDateTime expiry=LocalDateTime.now().plusDays(input.days());
        // 机器令牌不得高于签发人本人密级；缺省内部，避免 AI 适配器默认读到敏感文档。
        int requested=input.maxConfidentiality()==null?DocAclResolver.INTERNAL:input.maxConfidentiality();
        int maxConfidentiality=Math.min(requested,clearances.clearance(access.actor()));
        long id=store.insert("INSERT INTO doc_integration_grant(owner_user_id,space_id,name,token_hash,can_write,expires_at,max_confidentiality) VALUES(?,?,?,?,?,?,?)",access.actor(),input.spaceId(),input.name(),hash(token),input.canWrite(),expiry,maxConfidentiality);
        store.audit(null,input.spaceId(),access.actor(),"GRANT_ISSUE",null,"grant="+id,null);
        return new GrantCreated(id,token,expiry);
    }
    public List<Grant> list() {
        access.human(); access.documentMenu("view");
        return store.rows("SELECT id,owner_user_id,space_id,name,can_write,max_confidentiality,expires_at,revoked_at,created_at FROM doc_integration_grant WHERE owner_user_id=? ORDER BY id DESC LIMIT 100",Grant.class,access.actor());
    }
    @Transactional
    public void revoke(long id) {
        access.human(); access.documentMenu("view");
        Grant grant=store.one("SELECT * FROM doc_integration_grant WHERE id=? AND owner_user_id=? FOR UPDATE",Grant.class,id,access.actor());
        if (grant==null) DocNativeAccess.deny();
        store.jdbc().update("UPDATE doc_integration_grant SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND revoked_at IS NULL",id);
        store.audit(null,grant.getSpaceId(),access.actor(),"GRANT_REVOKE",null,"grant="+id,null);
    }
    @Transactional
    public DocIntegrationAuthentication authenticate(String token,boolean write) {
        if (token==null || !token.matches("docint_[A-Za-z0-9_-]{43}")) throw new BusinessException(401,"集成憑據無效");
        Grant grant=store.one("SELECT * FROM doc_integration_grant WHERE token_hash=? AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP",Grant.class,hash(token));
        if (grant==null) throw new BusinessException(401,"集成憑據無效或已到期");
        var user=users.selectById(grant.getOwnerUserId());
        if (user==null || !Integer.valueOf(1).equals(user.getStatus()) || Boolean.TRUE.equals(user.getMustChangePassword())) throw new BusinessException(401,"集成所屬帳號不可用");
        if (!permissions.hasSystemAccess(user,"doc") || !permissions.hasPermission(user,"doc-plans",write?"edit":"view")) DocNativeAccess.deny();
        int membership=access.member(grant.getSpaceId(),user.getId());
        if ((membership & READ)==0 || write && (!grant.isCanWrite() || (membership & EDIT)==0)) DocNativeAccess.deny();
        int limited=store.jdbc().update("UPDATE doc_integration_grant SET request_count=IF(rate_window<DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 1 MINUTE),1,request_count+1),rate_window=IF(rate_window<DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 1 MINUTE),CURRENT_TIMESTAMP,rate_window) WHERE id=? AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP AND (rate_window<DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 1 MINUTE) OR request_count<120)",grant.getId());
        if (limited==0) throw new BusinessException(429,"集成請求過於頻繁或授權已變更");
        return new DocIntegrationAuthentication(user,grant);
    }
}
