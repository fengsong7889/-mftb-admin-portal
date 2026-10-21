package com.mftb.admin.service.agent;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AiKnowledgeChunk;
import com.mftb.admin.entity.AiKnowledgeDoc;
import com.mftb.admin.mapper.AiKnowledgeChunkMapper;
import com.mftb.admin.mapper.AiKnowledgeDocMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * RAG 知识库：文档维护 + 固定窗口切分 + 检索。
 *
 * <p>检索优先走 MySQL FULLTEXT（迁移探测创建，ngram 不可用时降级为普通索引），
 * 不支持全文或命中为空时回退 LIKE 关键词匹配；两条路径都只返回 active 文档。
 * <p>为什么不用向量库：当前文档量级在千级分块以内，MySQL 全文 + 关键词回退足够，
 * 引入 embedding 会带来额外费用与运维面，等数据量真正上来再换。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiKnowledgeService {

    private static final int CHUNK_SIZE = 420;
    private static final int CHUNK_OVERLAP = 60;
    private static final int MAX_CHUNKS = 200;
    private static final int MAX_CONTENT = 60_000;
    private static final int MAX_QUERY = 120;
    private static final int SNIPPET_RADIUS = 80;

    private final AiKnowledgeDocMapper docMapper;
    private final AiKnowledgeChunkMapper chunkMapper;
    private final JdbcTemplate jdbcTemplate;
    private final AiConfigAuditService auditService;

    /** 列表不返回正文，避免配置页一次拉回几十万字。 */
    public List<AiKnowledgeDoc> list(String keyword, String systemCode) {
        LambdaQueryWrapper<AiKnowledgeDoc> wrapper = new LambdaQueryWrapper<AiKnowledgeDoc>()
                // 列表不选正文，避免配置页一次拉回几十万字
                .select(AiKnowledgeDoc.class, i -> !"content".equals(i.getColumn()))
                .orderByDesc(AiKnowledgeDoc::getUpdatedAt);
        if (StringUtils.hasText(keyword)) wrapper.like(AiKnowledgeDoc::getTitle, keyword.trim());
        if (StringUtils.hasText(systemCode)) wrapper.eq(AiKnowledgeDoc::getSystemCode, systemCode.trim());
        List<AiKnowledgeDoc> rows = docMapper.selectList(wrapper);
        for (AiKnowledgeDoc row : rows) row.setContent(null);
        return rows;
    }

    public AiKnowledgeDoc get(Long id) {
        AiKnowledgeDoc doc = id == null ? null : docMapper.selectById(id);
        if (doc == null) throw new BusinessException("知識庫文檔不存在");
        return doc;
    }

    @Transactional(rollbackFor = Exception.class)
    public AiKnowledgeDoc save(AiKnowledgeDoc input, String operator) {
        if (input == null) throw new BusinessException("缺少文檔內容");
        String title = trim(input.getTitle());
        String content = input.getContent() == null ? "" : input.getContent().trim();
        if (!StringUtils.hasText(title)) throw new BusinessException("請填寫文檔標題");
        if (!StringUtils.hasText(content)) throw new BusinessException("請填寫文檔內容");
        if (content.length() > MAX_CONTENT) {
            throw new BusinessException("文檔內容最多 " + MAX_CONTENT + " 字，請拆分為多篇");
        }
        AiKnowledgeDoc doc = input.getId() == null ? new AiKnowledgeDoc() : get(input.getId());
        Map<String, Object> before = doc.getId() == null ? null : snapshot(doc);
        doc.setTitle(title.length() > 200 ? title.substring(0, 200) : title);
        doc.setSystemCode(StringUtils.hasText(input.getSystemCode()) ? input.getSystemCode().trim() : "common");
        doc.setSourceType(StringUtils.hasText(input.getSourceType()) ? input.getSourceType().trim() : "manual");
        doc.setContent(content);
        doc.setStatus(StringUtils.hasText(input.getStatus()) ? input.getStatus() : "active");
        doc.setUpdatedBy(operator);
        if (doc.getId() == null) {
            doc.setChunkCount(0);
            docMapper.insert(doc);
        } else {
            docMapper.updateById(doc);
        }
        int chunks = rebuildChunks(doc.getId(), content);
        doc.setChunkCount(chunks);
        docMapper.updateById(doc);
        auditService.record("knowledge", "doc:" + doc.getId(),
                before == null ? "create" : "update", before, snapshot(doc));
        return doc;
    }

    @Transactional(rollbackFor = Exception.class)
    public AiKnowledgeDoc setStatus(Long id, String status) {
        if (!List.of("active", "disabled").contains(status)) {
            throw new BusinessException("不支持的狀態");
        }
        AiKnowledgeDoc doc = get(id);
        Map<String, Object> before = snapshot(doc);
        doc.setStatus(status);
        docMapper.updateById(doc);
        auditService.record("knowledge", "doc:" + id, "status", before, snapshot(doc));
        return doc;
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        AiKnowledgeDoc doc = get(id);
        chunkMapper.delete(new LambdaQueryWrapper<AiKnowledgeChunk>().eq(AiKnowledgeChunk::getDocId, id));
        docMapper.deleteById(id);
        auditService.record("knowledge", "doc:" + id, "delete", snapshot(doc), null);
    }

    /** 重建分块：配置页保存后自动执行；返回分块数。 */
    @Transactional(rollbackFor = Exception.class)
    public int rebuild(Long id) {
        AiKnowledgeDoc doc = get(id);
        int previous = doc.getChunkCount() == null ? 0 : doc.getChunkCount();
        int count = rebuildChunks(doc.getId(), doc.getContent());
        doc.setChunkCount(count);
        docMapper.updateById(doc);
        auditService.record("knowledge", "doc:" + id, "rebuild",
                Map.of("chunks", previous), Map.of("chunks", count));
        return count;
    }

    private int rebuildChunks(Long docId, String content) {
        chunkMapper.delete(new LambdaQueryWrapper<AiKnowledgeChunk>().eq(AiKnowledgeChunk::getDocId, docId));
        List<String> parts = split(content);
        for (int i = 0; i < parts.size(); i++) {
            AiKnowledgeChunk chunk = new AiKnowledgeChunk();
            chunk.setDocId(docId);
            chunk.setChunkNo(i);
            chunk.setContent(parts.get(i));
            chunkMapper.insert(chunk);
        }
        return parts.size();
    }

    /** 固定窗口切分，保留重叠避免答案被切断。 */
    static List<String> split(String content) {
        List<String> out = new ArrayList<>();
        String text = content == null ? "" : content.replace("\r\n", "\n").trim();
        if (text.isEmpty()) return out;
        int start = 0;
        while (start < text.length() && out.size() < MAX_CHUNKS) {
            int end = Math.min(text.length(), start + CHUNK_SIZE);
            String piece = text.substring(start, end).trim();
            if (!piece.isEmpty()) out.add(piece);
            if (end >= text.length()) break;
            start = Math.max(end - CHUNK_OVERLAP, start + 1);
        }
        return out;
    }

    /**
     * 检索知识库：先全文，失败/无命中回退 LIKE。
     *
     * @param query      用户问题/关键词
     * @param systemCode 可选：限定系统
     * @param limit      1~10
     */
    public List<KnowledgeHit> search(String query, String systemCode, int limit) {
        String q = trim(query);
        if (!StringUtils.hasText(q)) return List.of();
        if (q.length() > MAX_QUERY) q = q.substring(0, MAX_QUERY);
        int cap = Math.min(Math.max(limit, 1), 10);
        List<KnowledgeHit> hits = fullTextSearch(q, systemCode, cap);
        if (hits.isEmpty()) hits = likeSearch(q, systemCode, cap);
        return hits;
    }

    private List<KnowledgeHit> fullTextSearch(String q, String systemCode, int limit) {
        if (q.length() > 80) return List.of();
        try {
            boolean bySystem = StringUtils.hasText(systemCode);
            String sql = "SELECT c.doc_id, c.chunk_no, c.content, d.title, d.system_code, "
                    + "MATCH(c.content) AGAINST (? IN NATURAL LANGUAGE MODE) AS score "
                    + "FROM ai_knowledge_chunk c JOIN ai_knowledge_doc d ON d.id = c.doc_id "
                    + "WHERE d.status = 'active' AND MATCH(c.content) AGAINST (? IN NATURAL LANGUAGE MODE) > 0 "
                    + (bySystem ? "AND d.system_code = ? " : "")
                    + "ORDER BY score DESC LIMIT ?";
            if (bySystem) {
                return jdbcTemplate.query(sql,
                        (rs, i) -> toHit(rs.getLong("doc_id"), rs.getInt("chunk_no"), rs.getString("content"),
                                rs.getString("title"), rs.getString("system_code"), rs.getDouble("score"), q),
                        q, q, systemCode, limit);
            }
            return jdbcTemplate.query(sql,
                    (rs, i) -> toHit(rs.getLong("doc_id"), rs.getInt("chunk_no"), rs.getString("content"),
                            rs.getString("title"), rs.getString("system_code"), rs.getDouble("score"), q),
                    q, q, limit);
        } catch (Exception e) {
            log.debug("[AiKnowledge] FULLTEXT 不可用，回退 LIKE: {}", e.getMessage());
            return List.of();
        }
    }

    private List<KnowledgeHit> likeSearch(String q, String systemCode, int limit) {
        List<String> tokens = tokens(q);
        if (tokens.isEmpty()) tokens = List.of(q);
        StringBuilder where = new StringBuilder();
        List<Object> args = new ArrayList<>();
        for (int i = 0; i < tokens.size(); i++) {
            if (i > 0) where.append(" OR ");
            where.append("c.content LIKE ?");
            args.add("%" + tokens.get(i) + "%");
        }
        String sql = "SELECT c.doc_id, c.chunk_no, c.content, d.title, d.system_code "
                + "FROM ai_knowledge_chunk c JOIN ai_knowledge_doc d ON d.id = c.doc_id "
                + "WHERE d.status = 'active' AND (" + where + ") "
                + (StringUtils.hasText(systemCode) ? "AND d.system_code = ? " : "")
                + "ORDER BY d.updated_at DESC LIMIT ?";
        if (StringUtils.hasText(systemCode)) args.add(systemCode);
        args.add(Math.max(limit * 3, 10));
        List<KnowledgeHit> rows = jdbcTemplate.query(sql,
                (rs, i) -> toHit(rs.getLong("doc_id"), rs.getInt("chunk_no"), rs.getString("content"),
                        rs.getString("title"), rs.getString("system_code"), 0d, q),
                args.toArray());
        for (KnowledgeHit row : rows) {
            int hits = 0;
            String lower = row.getSnippet() == null ? "" : row.getSnippet().toLowerCase(Locale.ROOT);
            for (String token : tokens) {
                if (lower.contains(token.toLowerCase(Locale.ROOT))) hits++;
            }
            if (hits > 0) row.setScore(hits);
        }
        rows.sort((a, b) -> Double.compare(b.getScore(), a.getScore()));
        return rows.size() <= limit ? rows : rows.subList(0, limit);
    }

    private KnowledgeHit toHit(Long docId, int chunkNo, String content, String title, String systemCode,
                               double score, String query) {
        return new KnowledgeHit(docId, chunkNo, title, systemCode, snippet(content, query), score);
    }

    /** 片段截取：取窗口中心附近 160 字，首尾加省略号。 */
    private static String snippet(String content, String query) {
        String text = content == null ? "" : content.replaceAll("\\s+", " ").trim();
        if (text.length() <= SNIPPET_RADIUS * 2) return text;
        String lower = text.toLowerCase(Locale.ROOT);
        int pos = -1;
        for (String token : tokens(query)) {
            int p = lower.indexOf(token.toLowerCase(Locale.ROOT));
            if (p >= 0 && (pos < 0 || p < pos)) pos = p;
        }
        if (pos < 0) pos = 0;
        int start = Math.max(0, pos - SNIPPET_RADIUS);
        int end = Math.min(text.length(), start + SNIPPET_RADIUS * 2);
        return (start > 0 ? "…" : "") + text.substring(start, end) + (end < text.length() ? "…" : "");
    }

    static List<String> tokens(String q) {
        Set<String> out = new LinkedHashSet<>();
        for (String part : q.split("[\\s,，。？?！!、；;：:（）()\\[\\]【】\"'“”]+")) {
            String token = part.trim();
            if (token.length() >= 2 && !"什麼".equals(token) && !"如何".equals(token)) {
                out.add(token);
            }
            if (out.size() >= 6) break;
        }
        return new ArrayList<>(out);
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    /** 审计快照：不把整篇正文写进审计，只留标题/状态/长度与预览。 */
    private static Map<String, Object> snapshot(AiKnowledgeDoc doc) {
        if (doc == null) return null;
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", doc.getId());
        map.put("title", doc.getTitle());
        map.put("systemCode", doc.getSystemCode());
        map.put("status", doc.getStatus());
        map.put("chunkCount", doc.getChunkCount());
        String content = doc.getContent();
        map.put("contentLength", content == null ? 0 : content.length());
        map.put("contentPreview", content == null ? null
                : content.substring(0, Math.min(content.length(), 300)));
        return map;
    }

    /** 检索命中；{@code score} 为全文相关度或关键词命中数。 */
    @lombok.Data
    public static class KnowledgeHit {
        private final Long docId;
        private final int chunkNo;
        private final String title;
        private final String systemCode;
        private final String snippet;
        private double score;

        public KnowledgeHit(Long docId, int chunkNo, String title, String systemCode, String snippet, double score) {
            this.docId = docId;
            this.chunkNo = chunkNo;
            this.title = title;
            this.systemCode = systemCode;
            this.snippet = snippet;
            this.score = score;
        }
    }
}
