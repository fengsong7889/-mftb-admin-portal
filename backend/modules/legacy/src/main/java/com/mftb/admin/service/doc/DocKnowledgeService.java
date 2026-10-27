package com.mftb.admin.service.doc;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocKnowledgeDTO.*;
import com.mftb.admin.dto.DocNativeDTO.Head;
import com.mftb.admin.dto.DocNativeDTO.Revision;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.time.LocalDateTime;
import java.time.Year;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.stream.Collectors;

import static com.mftb.admin.service.doc.DocContentValidation.hash;
import static com.mftb.admin.service.doc.DocNativeAccess.*;

/**
 * P0 知识库：分类、标签、目录检索、文档创建/修订、ACL。
 *
 * <p>安全口径：
 * <ul>
 *   <li>空间位集是权限上限；历史空间（无 doc_space_access）按菜单 + 文档 ACL 兼容。</li>
 *   <li>密级是硬门槛；SENSITIVE/RESTRICTED 必须 ACL 命中且用户密级足够。</li>
 *   <li>列表在 SQL 内完成权限与密级过滤，禁止先分页后裁剪。</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class DocKnowledgeService {
    private static final int MAX_TAGS = 20;
    private static final int MAX_TAG_LENGTH = 40;
    private static final int TAG_SNAPSHOT_MAX = 255;
    private static final Set<String> SUBJECT_TYPES = Set.of("USER", "DEPT", "ROLE", "ALL");

    private final DocNativeStore store;
    private final DocNativeAccess access;
    private final DocAclResolver aclResolver;
    private final DocAssetService assets;
    private final DocContentValidation validation;
    private final DocIndexService index;
    private final DocNativeSpaceService spaces;

    // ───────────────────────── 空间与分类 ─────────────────────────

    public List<Space> spaces() {
        access.documentMenu("view");
        long actor = access.actor();
        Long limited = access.integration() == null ? null : access.integration().grant().getSpaceId();
        return store.jdbc().query("SELECT s.id,s.name,s.description,COALESCE(s.space_kind,1) AS space_kind,"
                        + "CASE WHEN a.space_id IS NULL THEN 0 ELSE 1 END AS managed "
                        + "FROM doc_space s LEFT JOIN doc_space_access a ON a.space_id=s.id "
                        + "WHERE s.deleted=0 AND (a.space_id IS NULL OR EXISTS(SELECT 1 FROM doc_space_member m "
                        + "WHERE m.space_id=s.id AND m.user_id=? AND (m.permissions & 1)<>0)) "
                        + "AND (? IS NULL OR s.id=?) ORDER BY s.sort_order,s.id",
                (rs, i) -> new Space(rs.getLong("id"), rs.getString("name"), rs.getString("description"),
                        rs.getInt("space_kind"), rs.getBoolean("managed")),
                actor, limited, limited);
    }

    public List<CategoryNode> categoryTree(long spaceId) {
        access.documentMenu("view");
        requireSpaceRead(spaceId);
        List<CategoryNode> flat = store.jdbc().query(
                "SELECT id,parent_id,code,name,path,level,sort_order,status,doc_count FROM doc_category "
                        + "WHERE space_id=? AND status=1 ORDER BY level,sort_order,id",
                (rs, i) -> new CategoryNode(rs.getLong("id"), rs.getLong("parent_id"), rs.getString("code"),
                        rs.getString("name"), rs.getString("path"), rs.getInt("level"), rs.getInt("sort_order"),
                        rs.getInt("status"), rs.getInt("doc_count"), List.of()),
                spaceId);
        Map<Long, List<CategoryNode>> byParent = new LinkedHashMap<>();
        for (CategoryNode node : flat) byParent.computeIfAbsent(node.parentId(), key -> new ArrayList<>()).add(node);
        return buildTree(0L, byParent);
    }

    @Transactional
    public CategoryNode createCategory(long spaceId, CategorySave input) {
        access.manageSpaceCompat(spaceId);
        validation.validate(input);
        requireSpace(spaceId);
        String name = input.name().trim();
        long parentId = input.parentId() == null ? 0L : input.parentId();
        int level = 1;
        String parentPath = "/";
        if (parentId > 0) {
            Map<String, Object> parent = categoryRow(parentId);
            if (((Number) parent.get("space_id")).longValue() != spaceId) throw new BusinessException(400, "父分類不屬於此空間");
            level = ((Number) parent.get("level")).intValue() + 1;
            if (level > 4) throw new BusinessException(400, "分類最多四級");
            parentPath = String.valueOf(parent.get("path"));
        }
        if (store.count("SELECT COUNT(*) FROM doc_category WHERE space_id=? AND parent_id=? AND name=?", spaceId, parentId, name) > 0) {
            throw new BusinessException(409, "同級分類名稱已存在");
        }
        String code = input.code() == null || input.code().isBlank()
                ? "cat_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12)
                : input.code().trim();
        if (store.count("SELECT COUNT(*) FROM doc_category WHERE space_id=? AND code=?", spaceId, code) > 0) {
            throw new BusinessException(409, "分類編碼已存在");
        }
        int sort = input.sortOrder() == null ? 0 : input.sortOrder();
        long id = store.insert("INSERT INTO doc_category(space_id,parent_id,code,name,path,level,sort_order,status) VALUES(?,?,?,?,?,?,?,1)",
                spaceId, parentId, code, name, "", level, sort);
        String path = (parentPath.endsWith("/") ? parentPath : parentPath + "/") + id + "/";
        store.jdbc().update("UPDATE doc_category SET path=? WHERE id=?", path, id);
        store.audit(null, spaceId, access.actor(), "CATEGORY_CREATE", null, "category=" + id + ",name=" + name, null);
        return new CategoryNode(id, parentId, code, name, path, level, sort, 1, 0, List.of());
    }

    @Transactional
    public CategoryNode updateCategory(long id, CategorySave input) {
        validation.validate(input);
        Map<String, Object> row = categoryRow(id);
        long spaceId = ((Number) row.get("space_id")).longValue();
        access.manageSpaceCompat(spaceId);
        long parentId = ((Number) row.get("parent_id")).longValue();
        if (input.parentId() != null && input.parentId() != parentId) throw new BusinessException(400, "P0 暫不支援移動分類");
        String name = input.name().trim();
        if (store.count("SELECT COUNT(*) FROM doc_category WHERE space_id=? AND parent_id=? AND name=? AND id<>?", spaceId, parentId, name, id) > 0) {
            throw new BusinessException(409, "同級分類名稱已存在");
        }
        int sort = input.sortOrder() == null ? ((Number) row.get("sort_order")).intValue() : input.sortOrder();
        store.jdbc().update("UPDATE doc_category SET name=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", name, sort, id);
        store.audit(null, spaceId, access.actor(), "CATEGORY_UPDATE", null, "category=" + id + ",name=" + name, null);
        return new CategoryNode(id, parentId, String.valueOf(row.get("code")), name, String.valueOf(row.get("path")),
                ((Number) row.get("level")).intValue(), sort, 1,
                ((Number) row.get("doc_count")).intValue(), List.of());
    }

    @Transactional
    public void disableCategory(long id) {
        Map<String, Object> row = categoryRow(id);
        long spaceId = ((Number) row.get("space_id")).longValue();
        access.manageSpaceCompat(spaceId);
        if (store.count("SELECT COUNT(*) FROM doc_category WHERE parent_id=? AND status=1", id) > 0) {
            throw new BusinessException(409, "請先處理子分類");
        }
        if (store.count("SELECT COUNT(*) FROM doc_node WHERE category_id=? AND deleted=0", id) > 0) {
            throw new BusinessException(409, "分類下仍有文檔，不能停用");
        }
        store.jdbc().update("UPDATE doc_category SET status=0,updated_at=CURRENT_TIMESTAMP WHERE id=?", id);
        store.audit(null, spaceId, access.actor(), "CATEGORY_DISABLE", null, "category=" + id, null);
    }

    // ───────────────────────── 标签 ─────────────────────────

    public List<Tag> tags(Long spaceId) {
        access.documentMenu("view");
        if (spaceId != null) requireSpaceRead(spaceId);
        long scope = spaceId == null ? 0L : spaceId;
        return store.jdbc().query("SELECT id,space_id,name,color,status FROM doc_tag WHERE status=1 AND (space_id=0 OR space_id=?) ORDER BY space_id,name",
                (rs, i) -> new Tag(rs.getLong("id"), rs.getLong("space_id"), rs.getString("name"),
                        rs.getString("color"), rs.getInt("status")), scope);
    }

    @Transactional
    public Tag createTag(Long spaceId, TagSave input) {
        validation.validate(input);
        boolean global = Boolean.TRUE.equals(input.global()) || spaceId == null;
        long scope = global ? 0L : spaceId;
        if (global) {
            access.human();
            access.menu("doc-library", "edit");
        } else {
            access.manageSpaceCompat(spaceId);
        }
        String name = input.name().trim();
        store.jdbc().update("INSERT INTO doc_tag(space_id,name,color,status,created_by) VALUES(?,?,?,1,?) "
                        + "ON DUPLICATE KEY UPDATE color=VALUES(color),status=1",
                scope, name, input.color(), access.actor());
        Long id = store.jdbc().queryForObject("SELECT id FROM doc_tag WHERE space_id=? AND name=?", Long.class, scope, name);
        if (id == null) throw new IllegalStateException("標籤寫入未取得主鍵");
        return new Tag(id, scope, name, input.color(), 1);
    }

    @Transactional
    public void disableTag(long id) {
        List<Map<String, Object>> rows = store.jdbc().queryForList("SELECT space_id,name FROM doc_tag WHERE id=?", id);
        if (rows.isEmpty()) throw new BusinessException(404, "標籤不存在");
        long spaceId = ((Number) rows.get(0).get("space_id")).longValue();
        if (spaceId == 0) {
            access.human();
            access.menu("doc-library", "edit");
        } else {
            access.manageSpaceCompat(spaceId);
        }
        store.jdbc().update("UPDATE doc_tag SET status=0 WHERE id=?", id);
    }

    // ───────────────────────── 检索 ─────────────────────────

    public Page search(String keyword, Long spaceId, Long categoryId, Integer contentKind,
                       Integer confidentiality, Integer status, int page, int size) {
        access.documentMenu("view");
        if (keyword != null && keyword.length() > 100) throw new BusinessException(400, "關鍵字過長");
        int safePage = Math.max(1, Math.min(page, 100000));
        int safeSize = Math.max(1, Math.min(size, 100));
        Filter filter = filter(keyword, spaceId, categoryId, contentKind, confidentiality, status);
        var jdbc = new NamedParameterJdbcTemplate(store.jdbc());
        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM doc_search_index i JOIN doc_space s ON s.id=i.space_id"
                + filter.where(), filter.params(), Long.class);
        filter.params().addValue("limit", safeSize).addValue("offset", (safePage - 1) * safeSize);
        List<SearchRow> rows = jdbc.query("SELECT i.node_id,i.title,i.summary,i.space_id,s.name AS space_name,"
                        + "i.category_id,c.name AS category_name,i.content_kind,i.confidentiality,i.status,i.tags,"
                        + "u.name AS owner_name,EXISTS(SELECT 1 FROM doc_native_document d WHERE d.node_id=i.node_id) AS native_doc,"
                        + "i.updated_at "
                        + "FROM doc_search_index i JOIN doc_space s ON s.id=i.space_id "
                        + "LEFT JOIN doc_category c ON c.id=i.category_id LEFT JOIN sys_user u ON u.id=i.owner_user_id"
                        + filter.where() + " ORDER BY i.updated_at DESC,i.node_id DESC LIMIT :limit OFFSET :offset",
                filter.params(),
                (rs, i) -> new SearchRow(rs.getLong("node_id"), rs.getString("title"), rs.getString("summary"),
                        rs.getLong("space_id"), rs.getString("space_name"), nullableLong(rs, "category_id"),
                        rs.getString("category_name"), rs.getInt("content_kind"), rs.getInt("confidentiality"),
                        rs.getInt("status"), rs.getString("tags"), rs.getString("owner_name"),
                        rs.getBoolean("native_doc"), rs.getTimestamp("updated_at").toLocalDateTime()));
        return new Page(rows, total == null ? 0 : total, safePage, safeSize);
    }

    public Stats stats(String keyword, Long spaceId, Long categoryId, Integer contentKind,
                       Integer confidentiality, Integer status) {
        access.documentMenu("view");
        Filter filter = filter(keyword, spaceId, categoryId, contentKind, confidentiality, status);
        var jdbc = new NamedParameterJdbcTemplate(store.jdbc());
        Stats result = jdbc.queryForObject("SELECT COUNT(*) AS total,"
                        + "COALESCE(SUM(CASE WHEN i.status=3 THEN 1 ELSE 0 END),0) AS effective,"
                        + "COALESCE(SUM(CASE WHEN i.updated_at>=DATE_FORMAT(CURRENT_DATE,'%Y-%m-01') THEN 1 ELSE 0 END),0) AS updated_month,"
                        + "COALESCE(SUM(CASE WHEN i.content_kind IN (2,3) THEN 1 ELSE 0 END),0) AS files "
                        + "FROM doc_search_index i JOIN doc_space s ON s.id=i.space_id" + filter.where(),
                filter.params(),
                (rs, i) -> new Stats(rs.getLong("total"), rs.getLong("effective"), rs.getLong("updated_month"),
                        rs.getLong("files"), 0));
        return result == null ? new Stats(0, 0, 0, 0, 0) : result;
    }

    // ───────────────────────── 文档详情 ─────────────────────────

    public Detail detail(long nodeId, Long revisionId) {
        Head head = store.head(nodeId, false);
        access.readDocumentCompat(head);
        long actor = access.actor();
        boolean canEdit = access.canEditDocumentCompat(head, actor);
        boolean canDraft = canEdit || (pendingReviewer(head, actor));
        Long chosen = revisionId;
        if (chosen == null) {
            if (canDraft && head.getDraftRevisionId() != null
                    && !Objects.equals(head.getDraftRevisionId(), head.getEffectiveRevisionId())) {
                chosen = head.getDraftRevisionId();
            } else {
                chosen = head.getEffectiveRevisionId();
            }
        }
        if (chosen == null) DocNativeAccess.deny();
        Revision revision = store.revision(nodeId, chosen);
        boolean approved = store.count("SELECT COUNT(*) FROM doc_confirmation WHERE node_id=? AND revision_id=? AND status=2", nodeId, chosen) > 0;
        if (!approved && !Objects.equals(head.getEffectiveRevisionId(), chosen) && !canDraft) DocNativeAccess.deny();

        List<Revision> history = store.rows("SELECT id,node_id,revision_no,title,summary,tags_json,system_code,menu_key,"
                        + "original_filename,content_hash,change_reason,created_by_user_id,created_at FROM doc_revision r "
                        + "WHERE node_id=? AND (?=1 OR id=? OR EXISTS(SELECT 1 FROM doc_confirmation c WHERE c.node_id=r.node_id AND c.revision_id=r.id AND c.status=2)) "
                        + "ORDER BY revision_no DESC LIMIT 100",
                Revision.class, nodeId, canDraft ? 1 : 0, head.getEffectiveRevisionId() == null ? -1L : head.getEffectiveRevisionId());
        List<Asset> assets = assetsOfRevision(chosen);
        boolean manageAcl = access.canManageAclCompat(head, actor);
        List<AclEntry> acl = manageAcl ? aclOf(nodeId) : List.of();
        List<String> actions = new ArrayList<>();
        actions.add("read");
        if (access.canDownloadDocumentCompat(head, actor)) actions.add("download");
        if (canEdit && head.getLifecycle() == 1 && head.getDeletedAt() == null && store.pending(nodeId) == null) actions.add("edit");
        if (manageAcl) {
            actions.add("acl");
            actions.add("ack-targets");
            actions.add("ack-coverage");
            actions.add("ack-export");
        }
        if (canEdit && head.getDeletedAt() == null) actions.add("trash");
        if (!canDraft) head.setDraftRevisionId(null);
        return new Detail(head, revision, history, assets, acl, actions);
    }

    // ───────────────────────── 创建与修订 ─────────────────────────

    @Transactional
    public Receipt create(DocWrite input, String key) {
        validation.validate(input);
        access.human();
        access.menu("doc-library", "edit");
        access.editSpaceCompat(input.spaceId());
        if (!access.hasAccessRow(input.spaceId())) {
            throw new BusinessException(400, "歷史空間只讀，請先在治理頁建立原生空間再上傳");
        }
        Normalized body = normalize(input, null, null);
        if (body.sourceSessionKey() == null || body.sourceSessionKey().isBlank()) {
            throw new BusinessException(400, "缺少來源會話標識");
        }
        return once(key, "create-knowledge", body, () -> doCreate(body, key));
    }

    @Transactional
    public Receipt save(long nodeId, DocWrite input, String key) {
        validation.validate(input);
        Head initial = store.head(nodeId, false);
        access.editDocumentCompat(initial);
        Normalized body = normalize(input, nodeId, initial);
        if (body.expectedVersion() == null) throw new BusinessException(400, "缺少版本號");
        return once(key, "save-knowledge:" + nodeId, body, () -> doSave(nodeId, body, key));
    }

    private Receipt doCreate(Normalized body, String key) {
        lockSpace(body.spaceId());
        long actor = access.actor();
        // sourceSessionKey 是“同一次上传会话”的稳定键：网络重试即使换了 Idempotency-Key，
        // 也直接返回既有文档回执，而不是制造第二份或只报 409。
        List<Map<String, Object>> existing = store.jdbc().queryForList(
                "SELECT node_id,COALESCE(draft_revision_id,effective_revision_id) AS revision_id "
                        + "FROM doc_native_document WHERE created_by_user_id=? AND source_key=? "
                        + "ORDER BY node_id DESC LIMIT 1", actor, "KN:" + body.sourceSessionKey());
        if (!existing.isEmpty()) {
            long existingNode = ((Number) existing.get(0).get("node_id")).longValue();
            Number revision = (Number) existing.get(0).get("revision_id");
            if (revision == null) throw new BusinessException(409, "此來源已建立文檔，但尚未產生版本");
            return receipt(existingNode, revision.longValue());
        }
        recheckAssetBindings(null, body.assetIds());
        String categoryName = body.categoryName() == null ? "未分类" : body.categoryName();
        int legacyType = switch (body.contentKind()) {
            case 1 -> 1;
            case 4 -> 5;
            default -> 4;
        };
        String tagsSnapshot = snapshotTags(body.tags());
        // P0 上传即生效：评审/签收在 P1 接入；先保证读者不会看到无法打开的草稿。
        long id = store.insert("INSERT INTO doc_node(space_id,category,title,doc_type,status,tags,owner_user_id,owner_name,"
                        + "tencent_url,summary,created_by,updated_by,deleted,category_id) VALUES(?,?,?,?,3,?,?,?,?,?,?,?,0,?)",
                body.spaceId(), categoryName, body.title(), legacyType, tagsSnapshot, actor, access.user().getName(),
                body.contentKind() == 4 ? body.sourceUrl() : "", body.summary(),
                access.user().getUsername(), access.user().getUsername(), body.categoryId());
        String documentNo = "DOC-" + Year.now().getValue() + "-" + String.format("%06d", id);
        int restricted = body.confidentiality() >= DocAclResolver.SENSITIVE ? 1 : 0;
        store.jdbc().update("INSERT INTO doc_native_document(node_id,document_no,space_id,owner_user_id,created_by_user_id,"
                        + "source_key,version,lifecycle,execution_status,restricted,content_kind,category_id,confidentiality,"
                        + "download_policy,source_url,legal_hold,review_due_at) "
                        + "VALUES(?,?,?,?,?,?,1,1,1,?,?,?,?,?,?,0,DATE_ADD(CURRENT_DATE,INTERVAL 90 DAY))",
                id, documentNo, body.spaceId(), actor, actor, "KN:" + body.sourceSessionKey(), restricted,
                body.contentKind(), body.categoryId(), body.confidentiality(), body.downloadPolicy(), body.sourceUrl());
        long revisionId = insertRevision(id, 1, body, actor);
        bindAssets(revisionId, body.assetIds(), body.contentKind());
        store.jdbc().update("UPDATE doc_native_document SET draft_revision_id=?,effective_revision_id=? WHERE node_id=?",
                revisionId, revisionId, id);
        syncTags(id, body.spaceId(), body.tags());
        index.upsert(id);
        store.audit(id, body.spaceId(), actor, "CREATE_DOCUMENT", revisionId, "kind=" + body.contentKind(), key);
        return receipt(id, revisionId);
    }

    private Receipt doSave(long nodeId, Normalized body, String key) {
        lockSpace(body.spaceId());
        recheckAssetBindings(nodeId, body.assetIds());
        Head head = store.head(nodeId, true);
        access.editDocumentCompat(head);
        access.live(head);
        access.version(head, body.expectedVersion());
        if (!Objects.equals(body.spaceId(), head.getSpaceId())) throw new BusinessException(400, "修改正文不能移動空間");
        if (store.pending(nodeId) != null) throw new BusinessException(409, "待確認內容不可修改，請先撤回");
        if (body.confidentiality() < head.getConfidentiality() && !access.canManageAclCompat(head, access.actor())) {
            throw new BusinessException(403, "降低密級需要空間管理權限");
        }
        Long current = head.getDraftRevisionId() != null ? head.getDraftRevisionId() : head.getEffectiveRevisionId();
        if (current != null && revisionHash(body).equals(store.revision(nodeId, current).getContentHash())) {
            return receipt(nodeId, current);
        }
        long actor = access.actor();
        int number = (int) store.count("SELECT COALESCE(MAX(revision_no),0)+1 FROM doc_revision WHERE node_id=?", nodeId);
        long revisionId = insertRevision(nodeId, number, body, actor);
        bindAssets(revisionId, body.assetIds(), body.contentKind());
        String categoryName = body.categoryName() == null ? "未分类" : body.categoryName();
        store.jdbc().update("UPDATE doc_node SET title=?,summary=?,category=?,category_id=?,tags=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
                body.title(), body.summary(), categoryName, body.categoryId(), snapshotTags(body.tags()),
                access.user().getUsername(), nodeId);
        int restricted = (body.confidentiality() >= DocAclResolver.SENSITIVE
                || store.count("SELECT COUNT(*) FROM doc_acl_entry WHERE node_id=?", nodeId) > 0) ? 1 : 0;
        store.jdbc().update("UPDATE doc_native_document SET draft_revision_id=?,effective_revision_id=?,category_id=?,confidentiality=?,download_policy=?,"
                        + "source_url=?,restricted=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE node_id=?",
                revisionId, revisionId, body.categoryId(), body.confidentiality(), body.downloadPolicy(), body.sourceUrl(), restricted, nodeId);
        syncTags(nodeId, body.spaceId(), body.tags());
        index.upsert(nodeId);
        store.audit(nodeId, body.spaceId(), actor, "SAVE_KNOWLEDGE_REVISION", revisionId, body.changeReason(), key);
        return receipt(nodeId, revisionId);
    }

    private long insertRevision(long nodeId, int number, Normalized body, long actor) {
        String originalFilename = body.originalFilename();
        if ((originalFilename == null || originalFilename.isBlank()) && !body.assetIds().isEmpty()) {
            originalFilename = assets.requireAsset(body.assetIds().get(0)).originalName();
        }
        return store.insert("INSERT INTO doc_revision(node_id,revision_no,title,summary,markdown,tags_json,system_code,menu_key,"
                        + "original_filename,content_hash,change_reason,created_by_user_id) VALUES(?,?,?,?,?,?,'','',?,?,?,?)",
                nodeId, number, body.title(), body.summary(), body.markdown(), validation.encode(body.tags()),
                originalFilename == null ? "" : originalFilename, revisionHash(body), body.changeReason(), actor);
    }

    /** 锁空间后再次校验绑定关系：避免两个并发创建在 normalize 阶段都看到“未绑定”而共享同一资产。 */
    private void recheckAssetBindings(Long nodeId, List<Long> assetIds) {
        for (Long assetId : assetIds) {
            List<Long> linked = assets.linkedNodes(assetId);
            if (nodeId == null && !linked.isEmpty()) throw new BusinessException(409, "文件已綁定其他文檔");
            if (nodeId != null && linked.stream().anyMatch(id -> !id.equals(nodeId))) {
                throw new BusinessException(409, "文件已綁定其他文檔");
            }
        }
    }

    private void bindAssets(long revisionId, List<Long> assetIds, int contentKind) {
        int role = contentKind == 1 ? 4 : 1;
        int order = 0;
        for (Long assetId : assetIds) {
            store.jdbc().update("INSERT INTO doc_revision_asset(revision_id,asset_id,role,sort_order) VALUES(?,?,?,?) "
                    + "ON DUPLICATE KEY UPDATE sort_order=VALUES(sort_order)", revisionId, assetId, role, order++);
        }
    }

    private void syncTags(long nodeId, long spaceId, List<String> tags) {
        store.jdbc().update("DELETE FROM doc_node_tag WHERE node_id=?", nodeId);
        long actor = access.actor();
        for (String name : tags) {
            store.jdbc().update("INSERT INTO doc_tag(space_id,name,status,created_by) VALUES(?,?,1,?) "
                    + "ON DUPLICATE KEY UPDATE status=1", spaceId, name, actor);
            Long tagId = store.jdbc().queryForObject("SELECT id FROM doc_tag WHERE space_id=? AND name=?", Long.class, spaceId, name);
            if (tagId == null) throw new IllegalStateException("標籤寫入未取得主鍵");
            store.jdbc().update("INSERT IGNORE INTO doc_node_tag(node_id,tag_id) VALUES(?,?)", nodeId, tagId);
        }
        store.jdbc().update("UPDATE doc_node SET tags=? WHERE id=?", snapshotTags(tags), nodeId);
    }

    private Normalized normalize(DocWrite input, Long nodeId, Head existing) {
        String title = input.title().trim();
        if (title.isEmpty()) throw new BusinessException(400, "標題不能為空");
        int kind = input.contentKind();
        if (existing != null && kind != existing.getContentKind()) throw new BusinessException(400, "不支援修改內容形態");
        int confidentiality = input.confidentiality() == null
                ? (existing == null ? DocAclResolver.INTERNAL : existing.getConfidentiality())
                : input.confidentiality();
        int downloadPolicy = input.downloadPolicy() == null
                ? (existing == null ? (confidentiality >= DocAclResolver.SENSITIVE ? 2 : 1) : existing.getDownloadPolicy())
                : input.downloadPolicy();
        if (confidentiality >= DocAclResolver.SENSITIVE && downloadPolicy == 1) {
            throw new BusinessException(400, "敏感/機密文檔不能設為直接下載");
        }
        Long categoryId = input.categoryId() != null ? input.categoryId()
                : (existing == null ? null : existing.getCategoryId());
        String categoryName = categoryId == null ? null : validateCategory(input.spaceId(), categoryId);
        String markdown = input.markdown() == null ? "" : input.markdown();
        if ((kind == 1 || kind == 5) && markdown.isBlank()) throw new BusinessException(400, "文本型文檔正文不能為空");
        if (kind != 1 && kind != 5 && !markdown.isBlank()) throw new BusinessException(400, "文件型文檔請上傳文件而非正文");
        validation.markdown(title, input.summary(), markdown);
        List<Long> assetIds = normalizeAssets(input.spaceId(), nodeId, input.assetIds(), kind);
        String sourceUrl = input.sourceUrl() == null ? "" : input.sourceUrl().trim();
        if (kind == 4) {
            if (sourceUrl.isBlank()) throw new BusinessException(400, "外鏈文檔必須填寫地址");
            validateUrl(sourceUrl);
        } else if (!sourceUrl.isBlank()) {
            throw new BusinessException(400, "只有外鏈文檔可以填寫地址");
        }
        List<String> tags = normalizeTags(input.tags());
        String reason = input.changeReason() == null || input.changeReason().isBlank()
                ? (existing == null ? "建立文檔" : "儲存修訂") : input.changeReason().trim();
        return new Normalized(input.spaceId(), title, DocContentValidation.n(input.summary()), kind, categoryId,
                categoryName, confidentiality, downloadPolicy, tags, sourceUrl, markdown,
                input.originalFilename() == null ? "" : input.originalFilename().trim(),
                assetIds, reason, input.sourceSessionKey(), input.expectedVersion());
    }

    private List<Long> normalizeAssets(long spaceId, Long nodeId, List<Long> assetIds, int kind) {
        List<Long> ids = assetIds == null ? List.of() : assetIds.stream().filter(Objects::nonNull).distinct().toList();
        if (ids.size() > 20) throw new BusinessException(400, "附件不能超過 20 個");
        if ((kind == 2 || kind == 3) && ids.isEmpty()) throw new BusinessException(400, "文件型文檔必須上傳文件");
        if (kind == 4 && !ids.isEmpty()) throw new BusinessException(400, "外鏈文檔不能綁定附件");
        long actor = access.actor();
        for (Long assetId : ids) {
            Asset asset = assets.requireAsset(assetId);
            if (asset.spaceId() != spaceId) throw new BusinessException(400, "文件不屬於此空間");
            List<Long> linked = assets.linkedNodes(assetId);
            boolean boundHere = nodeId != null && linked.contains(nodeId);
            // 新建时允许“已绑定到本人既有文档”的资产进入 normalize：
            // 同 sourceSessionKey 的网络重试要先命中回执，不能在这里被 409 打断。
            // 真正的跨文档共享由 doCreate 锁空间后的 recheckAssetBindings 拒绝。
            if (nodeId != null && !linked.isEmpty() && !boundHere) throw new BusinessException(409, "文件已綁定其他文檔");
            if (!Objects.equals(asset.createdBy(), actor) && !boundHere) throw new BusinessException(403, "不能綁定他人上傳的文件");
        }
        return ids;
    }

    private List<String> normalizeTags(List<String> tags) {
        if (tags == null) return List.of();
        List<String> result = new ArrayList<>();
        for (String raw : tags) {
            if (raw == null) continue;
            String name = raw.trim();
            if (name.isEmpty()) continue;
            if (name.length() > MAX_TAG_LENGTH) throw new BusinessException(400, "標籤名稱過長");
            if (!result.contains(name)) result.add(name);
        }
        if (result.size() > MAX_TAGS) throw new BusinessException(400, "標籤不能超過 20 個");
        return result;
    }

    private String validateCategory(long spaceId, long categoryId) {
        List<Map<String, Object>> rows = store.jdbc().queryForList(
                "SELECT name,space_id,status FROM doc_category WHERE id=?", categoryId);
        if (rows.isEmpty()) throw new BusinessException(400, "分類不存在");
        Map<String, Object> row = rows.get(0);
        if (((Number) row.get("space_id")).longValue() != spaceId) throw new BusinessException(400, "分類不屬於此空間");
        if (((Number) row.get("status")).intValue() != 1) throw new BusinessException(400, "分類已停用");
        return String.valueOf(row.get("name"));
    }

    private static void validateUrl(String url) {
        try {
            URI uri = URI.create(url);
            String scheme = uri.getScheme();
            if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
                throw new BusinessException(400, "外鏈只支援 http/https");
            }
        } catch (IllegalArgumentException e) {
            throw new BusinessException(400, "外鏈地址格式不正確");
        }
    }

    private static String snapshotTags(List<String> tags) {
        String joined = String.join(",", tags);
        return joined.length() > TAG_SNAPSHOT_MAX ? joined.substring(0, TAG_SNAPSHOT_MAX) : joined;
    }

    private static String revisionHash(Normalized body) {
        String assetSeed = body.assetIds().stream().sorted(Comparator.naturalOrder())
                .map(String::valueOf).collect(Collectors.joining(","));
        return hash(body.title() + "\n" + body.summary() + "\n" + body.markdown() + "\n"
                + String.join(",", body.tags()) + "\n" + body.sourceUrl() + "\n" + assetSeed + "\n"
                + body.categoryId() + "\n" + body.confidentiality() + "\n" + body.downloadPolicy());
    }

    // ───────────────────────── ACL ─────────────────────────

    public List<AclEntry> acl(long nodeId) {
        Head head = store.head(nodeId, false);
        access.readDocumentCompat(head);
        if (!access.canManageAclCompat(head, access.actor())) DocNativeAccess.deny();
        return aclOf(nodeId);
    }

    @Transactional
    public void saveAcl(long nodeId, AclSave input) {
        access.human();
        validation.validate(input);
        Head head = store.head(nodeId, true);
        access.editDocumentCompat(head);
        access.version(head, input.expectedVersion());
        long actor = access.actor();
        if (!Objects.equals(head.getOwnerUserId(), actor) && (access.member(head.getSpaceId(), actor) & MANAGE) == 0) {
            throw new BusinessException(403, "只有負責人或空間管理員可以維護權限");
        }
        Set<String> seen = new LinkedHashSet<>();
        for (AclEntrySave entry : input.entries()) {
            String type = entry.subjectType().trim().toUpperCase();
            String subjectId = entry.subjectId().trim();
            if (!SUBJECT_TYPES.contains(type)) throw new BusinessException(400, "不支援的授權主體");
            if (!List.of(1, 3).contains(entry.permissions())) throw new BusinessException(400, "不支援的權限位");
            if (entry.expiresAt() != null && !entry.expiresAt().isAfter(LocalDateTime.now())) {
                throw new BusinessException(400, "授權有效期必須晚於目前時間");
            }
            if ("ALL".equals(type)) {
                if (head.getConfidentiality() >= DocAclResolver.SENSITIVE) throw new BusinessException(400, "敏感/機密文檔不能授權給全部人員");
                subjectId = "0";
            } else {
                requireSubject(type, subjectId);
            }
            if (!seen.add(type + ":" + subjectId)) throw new BusinessException(400, "授權主體重複");
        }
        store.jdbc().update("DELETE FROM doc_acl_entry WHERE node_id=?", nodeId);
        for (AclEntrySave entry : input.entries()) {
            String type = entry.subjectType().trim().toUpperCase();
            String subjectId = "ALL".equals(type) ? "0" : entry.subjectId().trim();
            store.jdbc().update("INSERT INTO doc_acl_entry(node_id,subject_type,subject_id,permissions,expires_at,created_by) "
                            + "VALUES(?,?,?,?,?,?)",
                    nodeId, type, subjectId, entry.permissions(), entry.expiresAt(), actor);
        }
        int restricted = (!input.entries().isEmpty() || head.getConfidentiality() >= DocAclResolver.SENSITIVE) ? 1 : 0;
        store.jdbc().update("UPDATE doc_native_document SET restricted=? WHERE node_id=?", restricted, nodeId);
        store.bump(nodeId);
        store.audit(nodeId, head.getSpaceId(), actor, "ACL_ENTRY_CHANGE", null, "entries=" + input.entries().size(), null);
    }

    private void requireSubject(String type, String subjectId) {
        if (!subjectId.matches("\\d{1,19}")) throw new BusinessException(400, "授權主體 ID 格式不正確");
        long id = Long.parseLong(subjectId);
        String table = switch (type) {
            case "USER" -> "sys_user";
            case "DEPT" -> "sys_department";
            case "ROLE" -> "sys_role";
            default -> throw new BusinessException(400, "不支援的授權主體");
        };
        if (store.count("SELECT COUNT(*) FROM " + table + " WHERE id=?", id) == 0) {
            throw new BusinessException(400, "授權主體不存在");
        }
    }

    // ───────────────────────── 索引 ─────────────────────────

    public void rebuildIndex() {
        access.human();
        access.menu("doc-library", "edit");
        index.rebuild();
    }

    // ───────────────────────── 内部工具 ─────────────────────────

    Filter filter(String keyword, Long spaceId, Long categoryId, Integer contentKind,
                 Integer confidentiality, Integer status) {
        long actor = access.actor();
        var params = new MapSqlParameterSource("actor", actor)
                .addValue("clearance", aclResolver.clearance(actor));
        var subjects = aclResolver.subjects(actor);
        params.addValue("dept", subjects.deptId() == null ? "-1" : String.valueOf(subjects.deptId()));
        List<String> roles = subjects.roleIds().stream().map(String::valueOf).toList();
        params.addValue("roles", roles.isEmpty() ? List.of("-1") : roles);

        StringBuilder where = new StringBuilder(" WHERE s.deleted=0")
                .append(" AND (i.status<>1 OR i.owner_user_id=:actor")
                .append(" OR EXISTS(SELECT 1 FROM doc_native_document nd WHERE nd.node_id=i.node_id AND nd.created_by_user_id=:actor))")
                .append(" AND (NOT EXISTS(SELECT 1 FROM doc_space_access sa WHERE sa.space_id=i.space_id)")
                .append(" OR EXISTS(SELECT 1 FROM doc_space_member m WHERE m.space_id=i.space_id AND m.user_id=:actor AND (m.permissions & 1)<>0))")
                .append(" AND (i.confidentiality<3 OR i.confidentiality<=:clearance")
                .append(" OR i.owner_user_id=:actor")
                .append(" OR EXISTS(SELECT 1 FROM doc_native_document nd WHERE nd.node_id=i.node_id AND nd.created_by_user_id=:actor))")
                .append(" AND ((i.confidentiality<3 AND NOT EXISTS(SELECT 1 FROM doc_native_document nd WHERE nd.node_id=i.node_id AND nd.restricted=1))")
                .append(" OR EXISTS(SELECT 1 FROM doc_native_document nd WHERE nd.node_id=i.node_id AND (nd.owner_user_id=:actor OR nd.created_by_user_id=:actor))")
                .append(" OR EXISTS(SELECT 1 FROM doc_document_acl da WHERE da.node_id=i.node_id AND da.user_id=:actor AND (da.permissions & 1)<>0)")
                .append(" OR EXISTS(SELECT 1 FROM doc_acl_entry e WHERE e.node_id=i.node_id AND (e.permissions & 1)<>0")
                .append(" AND (e.expires_at IS NULL OR e.expires_at>CURRENT_TIMESTAMP)")
                .append(" AND ((e.subject_type='USER' AND e.subject_id=CAST(:actor AS CHAR))")
                .append(" OR (e.subject_type='DEPT' AND e.subject_id=:dept)")
                .append(" OR (e.subject_type='ROLE' AND e.subject_id IN (:roles))")
                .append(" OR (e.subject_type='ALL' AND i.confidentiality<=2))))");
        var token = access.integration();
        if (token != null) {
            where.append(" AND i.space_id=:grantSpace AND i.confidentiality<=:grantConf");
            params.addValue("grantSpace", token.grant().getSpaceId());
            params.addValue("grantConf", token.grant().getMaxConfidentiality());
        }
        if (spaceId != null) {
            where.append(" AND i.space_id=:space");
            params.addValue("space", spaceId);
        }
        if (categoryId != null) {
            String path = categoryPath(spaceId, categoryId);
            where.append(" AND i.category_id IN (SELECT id FROM doc_category WHERE space_id=:catSpace AND path LIKE CONCAT(:catPath,'%'))");
            params.addValue("catSpace", spaceId);
            params.addValue("catPath", path);
        }
        if (contentKind != null) {
            where.append(" AND i.content_kind=:kind");
            params.addValue("kind", contentKind);
        }
        if (confidentiality != null) {
            where.append(" AND i.confidentiality=:conf");
            params.addValue("conf", confidentiality);
        }
        if (status != null) {
            where.append(" AND i.status=:status");
            params.addValue("status", status);
        }
        if (keyword != null && !keyword.isBlank()) {
            where.append(" AND (MATCH(i.title,i.summary,i.body_text,i.tags) AGAINST(:keyword IN NATURAL LANGUAGE MODE)")
                    .append(" OR LOCATE(:keyword,i.title)>0 OR LOCATE(:keyword,i.summary)>0 OR LOCATE(:keyword,i.tags)>0)");
            params.addValue("keyword", keyword.trim());
        }
        return new Filter(where.toString(), params);
    }

    private String categoryPath(Long spaceId, long categoryId) {
        if (spaceId == null) throw new BusinessException(400, "按分類篩選時必須指定空間");
        List<String> paths = store.jdbc().queryForList(
                "SELECT path FROM doc_category WHERE id=? AND space_id=?", String.class, categoryId, spaceId);
        if (paths.isEmpty()) throw new BusinessException(400, "分類不存在");
        return paths.get(0);
    }

    private List<Revision> revisions(boolean canDraft, long nodeId) {
        return store.rows("SELECT id,node_id,revision_no,title,summary,tags_json,system_code,menu_key,original_filename,"
                        + "content_hash,change_reason,created_by_user_id,created_at FROM doc_revision r WHERE node_id=? "
                        + "AND (?=1 OR EXISTS(SELECT 1 FROM doc_confirmation c WHERE c.node_id=r.node_id AND c.revision_id=r.id AND c.status=2)) "
                        + "ORDER BY revision_no DESC LIMIT 100",
                Revision.class, nodeId, canDraft ? 1 : 0);
    }

    private List<Asset> assetsOfRevision(long revisionId) {
        return store.jdbc().query("SELECT a.id,a.space_id,a.original_name,a.mime,a.size_bytes,a.status,a.scan_result,"
                        + "a.created_by,a.created_at FROM doc_revision_asset ra JOIN doc_asset a ON a.id=ra.asset_id "
                        + "WHERE ra.revision_id=? ORDER BY ra.role,ra.sort_order,a.id",
                (rs, i) -> new Asset(rs.getLong("id"), rs.getLong("space_id"), rs.getString("original_name"),
                        rs.getString("mime"), rs.getLong("size_bytes"), rs.getInt("status"),
                        rs.getString("scan_result"), rs.getLong("created_by"), rs.getTimestamp("created_at").toLocalDateTime()),
                revisionId);
    }

    private List<AclEntry> aclOf(long nodeId) {
        return store.jdbc().query("SELECT e.id,e.subject_type,e.subject_id,e.permissions,e.expires_at,"
                        + "COALESCE(u.name,dept.name,r.name,'全部') AS subject_name "
                        + "FROM doc_acl_entry e "
                        + "LEFT JOIN sys_user u ON e.subject_type='USER' AND u.id=CAST(e.subject_id AS UNSIGNED) "
                        + "LEFT JOIN sys_department dept ON e.subject_type='DEPT' AND dept.id=CAST(e.subject_id AS UNSIGNED) "
                        + "LEFT JOIN sys_role r ON e.subject_type='ROLE' AND r.id=CAST(e.subject_id AS UNSIGNED) "
                        + "WHERE e.node_id=? ORDER BY e.subject_type,e.subject_id",
                (rs, i) -> new AclEntry(rs.getLong("id"), rs.getString("subject_type"), rs.getString("subject_id"),
                        rs.getString("subject_name"), rs.getInt("permissions"),
                        rs.getTimestamp("expires_at") == null ? null : rs.getTimestamp("expires_at").toLocalDateTime()),
                nodeId);
    }

    private boolean pendingReviewer(Head head, long actor) {
        var pending = store.pending(head.getNodeId());
        return pending != null && pending.getReviewerUserId() == actor
                && (access.member(head.getSpaceId(), actor) & CONFIRM) != 0;
    }

    private void lockSpace(long spaceId) {
        if (access.hasAccessRow(spaceId)) {
            spaces.lockSpace(spaceId);
        } else {
            if (store.jdbc().queryForList("SELECT id FROM doc_space WHERE id=? AND deleted=0 FOR UPDATE", Long.class, spaceId).isEmpty()) {
                DocNativeAccess.deny();
            }
        }
    }

    private void requireSpace(long spaceId) {
        if (store.count("SELECT COUNT(*) FROM doc_space WHERE id=? AND deleted=0", spaceId) == 0) {
            throw new BusinessException(404, "空間不存在");
        }
    }

    private void requireSpaceRead(long spaceId) {
        requireSpace(spaceId);
        if (access.hasAccessRow(spaceId)) access.space(spaceId, READ);
    }

    private Map<String, Object> categoryRow(long id) {
        List<Map<String, Object>> rows = store.jdbc().queryForList(
                "SELECT space_id,parent_id,code,name,path,level,sort_order,status,doc_count FROM doc_category WHERE id=?", id);
        if (rows.isEmpty()) throw new BusinessException(404, "分類不存在");
        return rows.get(0);
    }

    private Receipt receipt(long nodeId, long revisionId) {
        Head head = store.head(nodeId, false);
        Revision revision = store.revision(nodeId, revisionId);
        return new Receipt(nodeId, head.getDocumentNo(), revisionId, revision.getContentHash(), head.getVersion(),
                revision.getCreatedAt(), "/doc-center/knowledge?id=" + nodeId + "&revision=" + revisionId);
    }

    /** 幂等：同一 actor + key 只产生一次事务结果；重放仍重新校验文档权限。 */
    private Receipt once(String key, String operation, Object body, Supplier<Receipt> action) {
        if (key == null || !key.matches("[A-Za-z0-9_.:-]{8,128}")) {
            throw new BusinessException(400, "必須提供有效的 Idempotency-Key");
        }
        long actor = access.actor();
        String digest = hash(operation + ":" + validation.encode(body));
        store.jdbc().update("INSERT INTO doc_ingest_request(actor_user_id,request_key,request_hash) VALUES(?,?,?) "
                + "ON DUPLICATE KEY UPDATE request_key=VALUES(request_key)", actor, key, digest);
        var row = store.jdbc().queryForMap("SELECT request_hash,response_json FROM doc_ingest_request "
                + "WHERE actor_user_id=? AND request_key=? FOR UPDATE", actor, key);
        if (!digest.equals(row.get("request_hash"))) {
            throw new BusinessException(409, "同一冪等鍵不可提交不同內容");
        }
        if (row.get("response_json") != null) {
            Receipt stored = validation.decode(row.get("response_json").toString(), Receipt.class);
            detail(stored.documentId(), stored.revisionId());
            return stored;
        }
        Receipt result = action.get();
        store.jdbc().update("UPDATE doc_ingest_request SET node_id=?,response_json=? WHERE actor_user_id=? AND request_key=?",
                result.documentId(), validation.encode(result), actor, key);
        return result;
    }

    private static List<CategoryNode> buildTree(Long parentId, Map<Long, List<CategoryNode>> byParent) {
        return byParent.getOrDefault(parentId, List.of()).stream()
                .map(node -> new CategoryNode(node.id(), node.parentId(), node.code(), node.name(), node.path(),
                        node.level(), node.sortOrder(), node.status(), node.docCount(), buildTree(node.id(), byParent)))
                .toList();
    }

    private static Long nullableLong(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }

    record Filter(String where, MapSqlParameterSource params) {}

    private record Normalized(long spaceId, String title, String summary, int contentKind, Long categoryId,
                              String categoryName, int confidentiality, int downloadPolicy, List<String> tags,
                              String sourceUrl, String markdown, String originalFilename, List<Long> assetIds,
                              String changeReason, String sourceSessionKey, Integer expectedVersion) {}
}
