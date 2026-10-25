package com.mftb.admin.service.doc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocKnowledgeDTO.*;
import com.mftb.admin.dto.DocNativeDTO.Head;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * P1 阅读域：阅读进度、收藏、笔记、书目元数据。
 *
 * <p>所有入口先复用文档统一 ACL/密级读校验；收藏与笔记始终按当前登录人隔离，
 * 空间可见笔记只允许负责人/空间管理显式选择。
 */
@Service
@RequiredArgsConstructor
public class DocReadingService {
    private static final ObjectMapper JSON = new ObjectMapper();

    private final DocNativeStore store;
    private final DocNativeAccess access;
    private final DocKnowledgeService knowledge;

    public ReaderState state(long nodeId) {
        Head head = readable(nodeId);
        long actor = access.actor();
        List<ReaderState> rows = store.jdbc().query(
                "SELECT revision_id,position_json,percent,total_seconds,last_read_at "
                        + "FROM doc_reader_state WHERE user_id=? AND node_id=?",
                (rs, i) -> new ReaderState(nodeId, (Long) rs.getObject("revision_id"),
                        rs.getString("position_json"), rs.getDouble("percent"),
                        rs.getInt("total_seconds"), rs.getTimestamp("last_read_at").toLocalDateTime()),
                actor, nodeId);
        return rows.isEmpty() ? new ReaderState(nodeId, head.getEffectiveRevisionId(), null, 0, 0, null)
                : rows.get(0);
    }

    @Transactional
    public ReaderState saveState(long nodeId, ReaderStateSave input) {
        Head head = readable(nodeId);
        Long revisionId = input.revisionId() == null ? head.getEffectiveRevisionId() : input.revisionId();
        requireRevision(nodeId, revisionId);
        String position = jsonOrNull(input.positionJson());
        double percent = Math.max(0, Math.min(100, input.percent()));
        int seconds = input.seconds() == null ? 0 : Math.max(0, Math.min(3600, input.seconds()));
        store.jdbc().update("INSERT INTO doc_reader_state(user_id,node_id,revision_id,position_json,percent,"
                        + "total_seconds,last_read_at) VALUES(?,?,?,?,?,?,NOW()) "
                        + "ON DUPLICATE KEY UPDATE revision_id=VALUES(revision_id),position_json=VALUES(position_json),"
                        + "percent=GREATEST(percent,VALUES(percent)),total_seconds=total_seconds+VALUES(total_seconds),"
                        + "last_read_at=NOW()",
                access.actor(), nodeId, revisionId, position, percent, seconds);
        return state(nodeId);
    }

    public List<Favorite> favorites() {
        access.documentMenu("view");
        long actor = access.actor();
        DocKnowledgeService.Filter filter = knowledge.filter(null, null, null, null, null, null);
        MapSqlParameterSource params = filter.params().addValue("favoriteUser", actor);
        String from = " FROM doc_favorite f JOIN doc_search_index i ON i.node_id=f.node_id "
                + "JOIN doc_space s ON s.id=i.space_id" + filter.where()
                + " AND f.user_id=:favoriteUser ORDER BY f.created_at DESC LIMIT 200";
        return new NamedParameterJdbcTemplate(store.jdbc()).query(
                "SELECT i.node_id,i.title,i.summary,i.content_kind,i.confidentiality,i.updated_at,f.folder" + from,
                params, (rs, i) -> new Favorite(rs.getLong("node_id"), rs.getString("title"),
                        rs.getString("summary"), rs.getInt("content_kind"), rs.getInt("confidentiality"),
                        rs.getTimestamp("updated_at").toLocalDateTime(), rs.getString("folder")));
    }

    @Transactional
    public boolean toggleFavorite(long nodeId, String folder) {
        readable(nodeId);
        long actor = access.actor();
        Long count = store.count("SELECT COUNT(*) FROM doc_favorite WHERE user_id=? AND node_id=?", actor, nodeId);
        if (count != null && count > 0) {
            store.jdbc().update("DELETE FROM doc_favorite WHERE user_id=? AND node_id=?", actor, nodeId);
            return false;
        }
        String safeFolder = StringUtils.hasText(folder) ? folder.trim() : "默认";
        if (safeFolder.length() > 64) throw new BusinessException(400, "收藏夾名稱過長");
        store.jdbc().update("INSERT INTO doc_favorite(user_id,node_id,folder) VALUES(?,?,?)",
                actor, nodeId, safeFolder);
        return true;
    }

    public List<Note> notes(long nodeId) {
        readable(nodeId);
        return store.jdbc().query("SELECT id,node_id,revision_id,note_type,anchor_json,quote_text,content,"
                        + "visibility,created_at,updated_at FROM doc_note WHERE user_id=? AND node_id=? "
                        + "ORDER BY created_at DESC LIMIT 500",
                (rs, i) -> new Note(rs.getLong("id"), rs.getLong("node_id"), rs.getLong("revision_id"),
                        rs.getInt("note_type"), rs.getString("anchor_json"), rs.getString("quote_text"),
                        rs.getString("content"), rs.getInt("visibility"),
                        rs.getTimestamp("created_at").toLocalDateTime(),
                        rs.getTimestamp("updated_at").toLocalDateTime()),
                access.actor(), nodeId);
    }

    @Transactional
    public Note saveNote(long nodeId, NoteSave input) {
        Head head = readable(nodeId);
        requireRevision(nodeId, input.revisionId());
        if (input.visibility() == 2 && !access.canManageAclCompat(head, access.actor())) {
            throw new BusinessException(403, "只有負責人/空間管理可建立空間可見筆記");
        }
        String content = trim(input.content(), 4000);
        String quote = trim(input.quoteText(), 1000);
        if (!StringUtils.hasText(content) && !StringUtils.hasText(quote)) {
            throw new BusinessException(400, "筆記內容不能為空");
        }
        String anchor = jsonOrNull(input.anchorJson());
        store.jdbc().update("INSERT INTO doc_note(user_id,node_id,revision_id,note_type,anchor_json,quote_text,"
                        + "content,visibility) VALUES(?,?,?,?,?,?,?,?)",
                access.actor(), nodeId, input.revisionId(), input.noteType(), anchor, quote, content,
                input.visibility());
        Long id = store.jdbc().queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        return notes(nodeId).stream().filter(note -> note.id().equals(id)).findFirst()
                .orElseThrow(() -> new BusinessException(500, "筆記保存失敗"));
    }

    @Transactional
    public void deleteNote(long id) {
        if (store.jdbc().update("DELETE FROM doc_note WHERE id=? AND user_id=?", id, access.actor()) == 0) {
            throw new BusinessException(404, "筆記不存在");
        }
    }

    public BookMeta bookMeta(long nodeId) {
        Head head = readable(nodeId);
        List<BookMeta> rows = store.jdbc().query(
                "SELECT d.node_id,i.title,i.summary,bm.isbn,bm.author,bm.publisher,bm.publish_year,bm.language,"
                        + "bm.page_count,bm.cover_asset_id,bm.book_category_id,COALESCE(bm.access_mode,1) access_mode,"
                        + "COALESCE(rs.percent,0) percent,rs.last_read_at "
                        + "FROM doc_native_document d JOIN doc_search_index i ON i.node_id=d.node_id "
                        + "LEFT JOIN doc_book_meta bm ON bm.node_id=d.node_id "
                        + "LEFT JOIN doc_reader_state rs ON rs.node_id=d.node_id AND rs.user_id=? "
                        + "WHERE d.node_id=?",
                (rs, i) -> new BookMeta(rs.getLong("node_id"), rs.getString("title"), rs.getString("summary"),
                        rs.getString("isbn"), rs.getString("author"), rs.getString("publisher"),
                        (Integer) rs.getObject("publish_year"), rs.getString("language"),
                        (Integer) rs.getObject("page_count"), (Long) rs.getObject("cover_asset_id"),
                        (Long) rs.getObject("book_category_id"), rs.getInt("access_mode"), rs.getDouble("percent"),
                        rs.getTimestamp("last_read_at") == null ? null
                                : rs.getTimestamp("last_read_at").toLocalDateTime()),
                access.actor(), nodeId);
        return rows.isEmpty() ? new BookMeta(head.getNodeId(), null, null, null, null, null, null,
                null, null, null, null, 1, 0, null) : rows.get(0);
    }

    @Transactional
    public BookMeta saveBookMeta(long nodeId, BookMetaSave input) {
        access.human();
        Head head = store.head(nodeId, true);
        access.editDocumentCompat(head);
        access.live(head);
        if (input.accessMode() == 2) {
            throw new BusinessException(400, "限時借閱尚未開放，請使用自由閱讀");
        }
        Long cover = input.coverAssetId();
        if (cover != null && store.count("SELECT COUNT(*) FROM doc_asset WHERE id=? AND space_id=? "
                + "AND status=2", cover, head.getSpaceId()) == 0) {
            throw new BusinessException(400, "封面資產不屬於此文檔空間");
        }
        Long category = input.bookCategoryId();
        if (category != null && store.count("SELECT COUNT(*) FROM doc_category WHERE id=? AND space_id=?",
                category, head.getSpaceId()) == 0) {
            throw new BusinessException(400, "書籍分類不存在");
        }
        store.jdbc().update("INSERT INTO doc_book_meta(node_id,isbn,author,publisher,publish_year,language,"
                        + "page_count,cover_asset_id,book_category_id,access_mode) VALUES(?,?,?,?,?,?,?,?,?,?) "
                        + "ON DUPLICATE KEY UPDATE isbn=VALUES(isbn),author=VALUES(author),publisher=VALUES(publisher),"
                        + "publish_year=VALUES(publish_year),language=VALUES(language),page_count=VALUES(page_count),"
                        + "cover_asset_id=VALUES(cover_asset_id),book_category_id=VALUES(book_category_id),"
                        + "access_mode=VALUES(access_mode),updated_at=NOW()",
                nodeId, trim(input.isbn(), 32), trim(input.author(), 200), trim(input.publisher(), 200),
                input.publishYear(), trim(input.language(), 16), input.pageCount(), cover, category,
                input.accessMode());
        store.audit(nodeId, head.getSpaceId(), access.actor(), "BOOK_META", head.getEffectiveRevisionId(),
                "accessMode=" + input.accessMode(), null);
        return bookMeta(nodeId);
    }

    public BookPage books(Long spaceId, String keyword, int page, int size) {
        access.documentMenu("view");
        if (keyword != null && keyword.length() > 100) throw new BusinessException(400, "關鍵字過長");
        int safePage = Math.max(1, Math.min(page, 100000));
        int safeSize = Math.max(1, Math.min(size, 100));
        long actor = access.actor();
        DocKnowledgeService.Filter filter = knowledge.filter(keyword, spaceId, null, 2, null, 3);
        MapSqlParameterSource params = filter.params().addValue("reader", actor)
                .addValue("limit", safeSize).addValue("offset", (safePage - 1) * safeSize);
        String from = " FROM doc_search_index i JOIN doc_space s ON s.id=i.space_id "
                + "JOIN doc_native_document d ON d.node_id=i.node_id "
                + "LEFT JOIN doc_book_meta bm ON bm.node_id=i.node_id "
                + "LEFT JOIN doc_reader_state rs ON rs.node_id=i.node_id AND rs.user_id=:reader"
                + filter.where();
        var jdbc = new NamedParameterJdbcTemplate(store.jdbc());
        Long total = jdbc.queryForObject("SELECT COUNT(*)" + from, params, Long.class);
        List<BookMeta> rows = jdbc.query("SELECT i.node_id,i.title,i.summary,bm.isbn,bm.author,bm.publisher,"
                        + "bm.publish_year,bm.language,bm.page_count,bm.cover_asset_id,bm.book_category_id,"
                        + "COALESCE(bm.access_mode,1) access_mode,COALESCE(rs.percent,0) percent,rs.last_read_at"
                        + from + " ORDER BY COALESCE(rs.last_read_at,i.updated_at) DESC LIMIT :limit OFFSET :offset",
                params, (rs, i) -> new BookMeta(rs.getLong("node_id"), rs.getString("title"),
                        rs.getString("summary"), rs.getString("isbn"), rs.getString("author"), rs.getString("publisher"),
                        (Integer) rs.getObject("publish_year"), rs.getString("language"),
                        (Integer) rs.getObject("page_count"), (Long) rs.getObject("cover_asset_id"),
                        (Long) rs.getObject("book_category_id"), rs.getInt("access_mode"), rs.getDouble("percent"),
                        rs.getTimestamp("last_read_at") == null ? null
                                : rs.getTimestamp("last_read_at").toLocalDateTime()));
        return new BookPage(rows, total == null ? 0 : total, safePage, safeSize);
    }

    private Head readable(long nodeId) {
        Head head = store.head(nodeId, false);
        access.readDocumentCompat(head);
        return head;
    }

    private void requireRevision(long nodeId, Long revisionId) {
        if (revisionId == null || store.count("SELECT COUNT(*) FROM doc_revision WHERE id=? AND node_id=?",
                revisionId, nodeId) == 0) {
            throw new BusinessException(400, "修訂版本不屬於此文檔");
        }
    }

    private static String jsonOrNull(String value) {
        if (!StringUtils.hasText(value)) return null;
        try {
            JSON.readTree(value);
            return value;
        } catch (Exception e) {
            throw new BusinessException(400, "位置/錨點不是合法 JSON");
        }
    }

    private static String trim(String value, int max) {
        if (value == null) return null;
        String text = value.replaceAll("[\\p{Cntrl}&&[^\\r\\n\\t]]", "").trim();
        return text.length() > max ? text.substring(0, max) : text;
    }

}
