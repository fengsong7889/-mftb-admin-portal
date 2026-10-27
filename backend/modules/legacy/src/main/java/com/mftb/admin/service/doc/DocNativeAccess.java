package com.mftb.admin.service.doc;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocNativeDTO.Head;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

/** 菜单准入、空间权限、文档限制、草稿参与者与集成范围取交集。 */
@Service
@RequiredArgsConstructor
public class DocNativeAccess {
    public static final int READ=1, EDIT=2, CONFIRM=4, MANAGE=8;
    private final DocNativeStore store;
    private final OperatorResolver operators;
    private final PermissionService permissions;
    private final DocAclResolver aclResolver;

    public SysUser user() {
        SysUser user = operators.currentUser();
        if (user == null || !Integer.valueOf(1).equals(user.getStatus()) || Boolean.TRUE.equals(user.getMustChangePassword()))
            throw new BusinessException(401, "登入身分不可用");
        if (!permissions.hasSystemAccess(user, "doc")) deny();
        return user;
    }
    public long actor() { return user().getId(); }
    public DocIntegrationAuthentication integration() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return auth instanceof DocIntegrationAuthentication token ? token : null;
    }
    public void human() {
        if (integration() != null) throw new BusinessException(403, "集成身分只能讀取授權內容或寫入草稿");
    }
    public void menu(String menu, String action) {
        if (!permissions.hasPermission(user(), menu, action)) deny();
    }
    public void documentMenu(String action) {
        SysUser user = user();
        if (!permissions.hasPermission(user, "doc-plans", action)
                && !("view".equals(action) && permissions.hasPermission(user, "doc-library", "view"))) deny();
    }
    public int member(long spaceId, long userId) {
        var values = store.jdbc().queryForList("SELECT m.permissions FROM doc_space_member m JOIN doc_space s ON s.id=m.space_id AND s.deleted=0 WHERE m.space_id=? AND m.user_id=?", Integer.class, spaceId, userId);
        return values.isEmpty() ? 0 : values.get(0);
    }
    public void space(long spaceId, int needed) {
        long actor = actor();
        if ((member(spaceId, actor) & needed) != needed) deny();
        var token = integration();
        if (token != null && (token.grant().getSpaceId() != spaceId || (needed != READ && (needed != EDIT || !token.grant().isCanWrite())))) deny();
    }
    public boolean canRead(Head head, long actor) {
        if ((member(head.getSpaceId(), actor) & READ) == 0) return false;
        var token = integration();
        if (token != null && head.getConfidentiality() > token.grant().getMaxConfidentiality()) return false;
        return aclResolver.canRead(head, actor);
    }
    public boolean canEdit(Head head, long actor) {
        return canRead(head, actor) && (member(head.getSpaceId(), actor) & EDIT) != 0
                && aclResolver.canEdit(head, actor);
    }
    public boolean canDownload(Head head, long actor) {
        if (integration() != null) return false;
        if (!canRead(head, actor)) return false;
        return aclResolver.canDownload(head, actor);
    }
    public void download(Head head) {
        read(head);
        if (!canDownload(head, actor())) throw new BusinessException(403, "此文檔不允許下載，請申請授權");
    }
    public boolean canDraft(Head head, long actor) {
        if (!canRead(head, actor)) return false;
        var pending = store.pending(head.getNodeId());
        return canEdit(head, actor) || (pending != null && pending.getReviewerUserId() == actor
                && (member(head.getSpaceId(), actor) & CONFIRM) != 0);
    }
    public void read(Head head) {
        documentMenu("view");
        space(head.getSpaceId(), READ);
        if (!canRead(head, actor())) deny();
    }
    /** v3 文档库入口：兼容历史空间（无 doc_space_access 行）只校验菜单与文档 ACL。 */
    public void readDocumentCompat(Head head) {
        menu("doc-library", "view");
        if (!canReadDocumentCompat(head, actor())) deny();
    }
    public boolean canReadDocumentCompat(Head head, long actor) {
        if (hasAccessRow(head.getSpaceId()) && (member(head.getSpaceId(), actor) & READ) == 0) return false;
        var token = integration();
        if (token != null && head.getConfidentiality() > token.grant().getMaxConfidentiality()) return false;
        return aclResolver.canRead(head, actor);
    }
    public void editDocumentCompat(Head head) {
        human();
        menu("doc-library", "edit");
        if (hasAccessRow(head.getSpaceId())) space(head.getSpaceId(), EDIT);
        if (!canEditDocumentCompat(head, actor())) deny();
    }
    public void downloadDocumentCompat(Head head) {
        human();
        readDocumentCompat(head);
        if (!canDownloadDocumentCompat(head, actor())) throw new BusinessException(403, "此文檔不允許下載，請申請授權");
    }
    public boolean canDownloadDocumentCompat(Head head, long actor) {
        if (integration() != null) return false;
        if (!canReadDocumentCompat(head, actor)) return false;
        return aclResolver.canDownload(head, actor);
    }
    public void editSpaceCompat(long spaceId) {
        human();
        menu("doc-library", "edit");
        if (hasAccessRow(spaceId)) space(spaceId, EDIT);
    }
    public void manageSpaceCompat(long spaceId) {
        human();
        menu("doc-library", "edit");
        if (hasAccessRow(spaceId)) space(spaceId, MANAGE);
    }
    public boolean hasAccessRow(long spaceId) {
        return store.count("SELECT COUNT(*) FROM doc_space_access WHERE space_id=?", spaceId) > 0;
    }
    public boolean canManageAcl(Head head, long actor) {
        return canEdit(head, actor) || (member(head.getSpaceId(), actor) & MANAGE) != 0;
    }
    public boolean canEditDocumentCompat(Head head, long actor) {
        if (hasAccessRow(head.getSpaceId()) && (member(head.getSpaceId(), actor) & EDIT) == 0) return false;
        return aclResolver.canEdit(head, actor);
    }
    public boolean canManageAclCompat(Head head, long actor) {
        if (hasAccessRow(head.getSpaceId()) && (member(head.getSpaceId(), actor) & MANAGE) != 0) return true;
        return canEditDocumentCompat(head, actor);
    }
    public void edit(Head head) {
        documentMenu("edit");
        space(head.getSpaceId(), EDIT);
        if (!canEdit(head, actor())) deny();
    }
    public void live(Head head) {
        if (head.getDeletedAt() != null || head.getLifecycle() != 1) throw new BusinessException(409, "此文檔已移除或不再有效");
    }
    public void version(Head head, Integer expected) {
        if (expected == null || expected != head.getVersion()) throw new BusinessException(409, "內容已更新，請重新載入後再操作");
    }
    public static void deny() { throw new BusinessException(403, "文檔不存在或不可存取"); }
}
