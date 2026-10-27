package com.mftb.admin.config;

import com.mftb.admin.config.migration.ContractSpec;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * P0 知识库结构：分类/标签/资产/主体 ACL/密级/统一检索。
 *
 * <p>DDL 只在 classpath 脚本 {@code 292_doc_knowledge_p0.sql} 存一份；本类负责补列、回填与契约校验。
 * <p>补列必须用 information_schema 判断：MySQL 8 不支持 {@code ADD COLUMN IF NOT EXISTS}。
 * <p>回填只做可重入的幂等写入，不覆盖已有分类/索引内容。
 */
public final class DocKnowledgeSchema {
    public static final String SCRIPT = "292_doc_knowledge_p0.sql";
    private static final Pattern TABLE = Pattern.compile("CREATE TABLE IF NOT EXISTS ([a-z_]+)");
    private static final Pattern COLUMN = Pattern.compile(
            "(?m)^    ([a-z_]+)\\s+(?:BIGINT|INT|TINYINT|VARCHAR|CHAR|MEDIUMTEXT|LONGTEXT|JSON|DATE|DATETIME|DECIMAL)");
    private static final Pattern CONSTRAINT = Pattern.compile("CONSTRAINT ([a-z_]+)");

    private static final String[][] EXTRA_COLUMNS = {
            {"doc_space", "space_kind"},
            {"doc_space", "code"},
            {"doc_node", "category_id"},
            {"doc_native_document", "content_kind"},
            {"doc_native_document", "category_id"},
            {"doc_native_document", "confidentiality"},
            {"doc_native_document", "download_policy"},
            {"doc_native_document", "effective_from"},
            {"doc_native_document", "source_url"},
            {"doc_native_document", "legal_hold"},
            {"doc_integration_grant", "max_confidentiality"},
    };

    private DocKnowledgeSchema() {}

    public static List<ContractSpec> contracts() {
        List<ContractSpec> result = new ArrayList<>();
        for (String sql : MeetingMinutesSchema.statements(SCRIPT)) {
            var table = TABLE.matcher(sql);
            if (!table.find()) throw new IllegalStateException("知识库 DDL 只能声明预期建表语句");
            List<ContractSpec.ColumnSpec> columns = new ArrayList<>();
            var column = COLUMN.matcher(sql);
            while (column.find()) columns.add(new ContractSpec.ColumnSpec(column.group(1), null));
            result.add(new ContractSpec("doc-knowledge:" + table.group(1), table.group(1), sql, columns));
        }
        return result;
    }

    public static void migrate(JdbcTemplate jdbc) {
        for (var contract : contracts()) jdbc.execute(contract.createTableIfMissing());

        addColumn(jdbc, "doc_space", "space_kind",
                "ALTER TABLE doc_space ADD COLUMN space_kind TINYINT NOT NULL DEFAULT 1 COMMENT '1知识库 2制度库 3图书库 4接口库 5档案库'");
        addColumn(jdbc, "doc_space", "code",
                "ALTER TABLE doc_space ADD COLUMN code VARCHAR(32) NULL COMMENT '空间稳定编码，档案全宗用'");
        addIndex(jdbc, "doc_space", "uk_doc_space_code",
                "ALTER TABLE doc_space ADD UNIQUE KEY uk_doc_space_code (code)");

        addColumn(jdbc, "doc_node", "category_id",
                "ALTER TABLE doc_node ADD COLUMN category_id BIGINT NULL COMMENT '主分类ID，兼容旧category快照'");
        addIndex(jdbc, "doc_node", "idx_doc_node_category",
                "ALTER TABLE doc_node ADD INDEX idx_doc_node_category (category_id)");

        addColumn(jdbc, "doc_native_document", "content_kind",
                "ALTER TABLE doc_native_document ADD COLUMN content_kind TINYINT NOT NULL DEFAULT 1 COMMENT '1Markdown 2PDF 3Office 4外链 5OpenAPI'");
        addColumn(jdbc, "doc_native_document", "category_id",
                "ALTER TABLE doc_native_document ADD COLUMN category_id BIGINT NULL COMMENT '主分类ID'");
        addColumn(jdbc, "doc_native_document", "confidentiality",
                "ALTER TABLE doc_native_document ADD COLUMN confidentiality TINYINT NOT NULL DEFAULT 2 COMMENT '1公开 2内部 3敏感 4机密'");
        addColumn(jdbc, "doc_native_document", "download_policy",
                "ALTER TABLE doc_native_document ADD COLUMN download_policy TINYINT NOT NULL DEFAULT 1 COMMENT '1允许 2需审批 3禁止'");
        addColumn(jdbc, "doc_native_document", "effective_from",
                "ALTER TABLE doc_native_document ADD COLUMN effective_from DATE NULL COMMENT '生效日期；P1 制度生命周期使用'");
        addColumn(jdbc, "doc_native_document", "source_url",
                "ALTER TABLE doc_native_document ADD COLUMN source_url VARCHAR(500) NULL COMMENT '外链型文档的目标地址'");
        addColumn(jdbc, "doc_native_document", "legal_hold",
                "ALTER TABLE doc_native_document ADD COLUMN legal_hold TINYINT NOT NULL DEFAULT 0 COMMENT '1法律冻结，禁止销毁'");
        addIndex(jdbc, "doc_native_document", "idx_doc_native_category",
                "ALTER TABLE doc_native_document ADD INDEX idx_doc_native_category (category_id)");
        addIndex(jdbc, "doc_native_document", "idx_doc_native_conf",
                "ALTER TABLE doc_native_document ADD INDEX idx_doc_native_conf (confidentiality)");

        addColumn(jdbc, "doc_integration_grant", "max_confidentiality",
                "ALTER TABLE doc_integration_grant ADD COLUMN max_confidentiality TINYINT NOT NULL DEFAULT 2 COMMENT '机器令牌可读最高密级，默认内部'");

        backfill(jdbc);
    }

    public static void verify(JdbcTemplate jdbc) {
        for (var contract : contracts()) {
            Long tableCount = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
                    Long.class, contract.table());
            if (tableCount == null || tableCount == 0) throw new IllegalStateException("知识库表未就绪: " + contract.table());
            var columns = jdbc.queryForList(
                    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
                    String.class, contract.table());
            for (var column : contract.requiredColumns()) {
                if (!columns.contains(column.column()))
                    throw new IllegalStateException("知识库结构缺列: " + contract.table() + "." + column.column());
            }
            var constraints = jdbc.queryForList(
                    "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND ENFORCED='YES'",
                    String.class, contract.table());
            var expected = CONSTRAINT.matcher(contract.createTableIfMissing());
            while (expected.find()) {
                if (!constraints.contains(expected.group(1)))
                    throw new IllegalStateException("知识库约束未就绪: " + expected.group(1));
            }
        }
        for (String[] required : EXTRA_COLUMNS) {
            Long count = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?",
                    Long.class, required[0], required[1]);
            if (count == null || count == 0)
                throw new IllegalStateException("知识库扩展列未就绪: " + required[0] + "." + required[1]);
        }
        Long fulltext = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='doc_search_index' AND INDEX_NAME='ft_doc_search' AND INDEX_TYPE='FULLTEXT'",
                Long.class);
        if (fulltext == null || fulltext == 0) throw new IllegalStateException("知识库全文索引未就绪");
    }

    private static void addColumn(JdbcTemplate jdbc, String table, String column, String ddl) {
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?",
                Long.class, table, column);
        if (count == null || count == 0) jdbc.execute(ddl);
    }

    private static void addIndex(JdbcTemplate jdbc, String table, String index, String ddl) {
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?",
                Long.class, table, index);
        if (count == null || count == 0) jdbc.execute(ddl);
    }

    private static void backfill(JdbcTemplate jdbc) {
        List<Long> spaces = jdbc.queryForList("SELECT id FROM doc_space WHERE deleted=0", Long.class);
        for (Long spaceId : spaces) {
            long uncategorized = ensureCategory(jdbc, spaceId, "uncategorized", "未分类", 9999);
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "SELECT DISTINCT category FROM doc_node WHERE space_id=? AND deleted=0 AND category IS NOT NULL AND category<>'' AND category<>'未分类'",
                    spaceId);
            for (Map<String, Object> row : rows) {
                String name = String.valueOf(row.get("category"));
                String code = "legacy_" + sha16(spaceId + ":" + name);
                long categoryId = ensureCategory(jdbc, spaceId, code, name, 100);
                jdbc.update("UPDATE doc_node SET category_id=? WHERE space_id=? AND category=? AND deleted=0",
                        categoryId, spaceId, name);
            }
            jdbc.update("UPDATE doc_node SET category_id=? WHERE space_id=? AND deleted=0 AND (category IS NULL OR category='' OR category='未分类')",
                    uncategorized, spaceId);
        }

        jdbc.update("INSERT INTO doc_acl_entry(node_id,subject_type,subject_id,permissions,created_by) "
                + "SELECT a.node_id,'USER',CAST(a.user_id AS CHAR),a.permissions,0 FROM doc_document_acl a "
                + "WHERE NOT EXISTS (SELECT 1 FROM doc_acl_entry e WHERE e.node_id=a.node_id AND e.subject_type='USER' AND e.subject_id=CAST(a.user_id AS CHAR))");

        jdbc.update("INSERT INTO doc_search_index(node_id,space_id,category_id,title,summary,body_text,tags,owner_user_id,"
                + "content_kind,confidentiality,status,effective_from,index_state,updated_at) "
                + "SELECT n.id,n.space_id,n.category_id,n.title,COALESCE(n.summary,''),COALESCE(r.markdown,''),COALESCE(n.tags,''),n.owner_user_id,"
                + "COALESCE(d.content_kind,4),COALESCE(d.confidentiality,2),n.status,d.effective_from,"
                + "CASE WHEN COALESCE(d.content_kind,4)=1 AND r.id IS NOT NULL THEN 2 ELSE 1 END,n.updated_at "
                + "FROM doc_node n LEFT JOIN doc_native_document d ON d.node_id=n.id "
                + "LEFT JOIN doc_revision r ON r.id=COALESCE(d.effective_revision_id,d.draft_revision_id) "
                + "WHERE n.deleted=0 "
                + "ON DUPLICATE KEY UPDATE space_id=VALUES(space_id),category_id=VALUES(category_id),title=VALUES(title),"
                + "summary=VALUES(summary),body_text=VALUES(body_text),tags=VALUES(tags),owner_user_id=VALUES(owner_user_id),"
                + "content_kind=VALUES(content_kind),confidentiality=VALUES(confidentiality),status=VALUES(status),"
                + "effective_from=VALUES(effective_from),index_state=VALUES(index_state),updated_at=VALUES(updated_at)");

        jdbc.update("UPDATE doc_category c SET doc_count=(SELECT COUNT(*) FROM doc_node n WHERE n.category_id=c.id AND n.deleted=0)");
    }

    private static long ensureCategory(JdbcTemplate jdbc, long spaceId, String code, String name, int sortOrder) {
        jdbc.update("INSERT INTO doc_category(space_id,parent_id,code,name,path,level,sort_order,status) "
                        + "VALUES(?,0,?,?,'',1,?,1) ON DUPLICATE KEY UPDATE name=VALUES(name)",
                spaceId, code, name, sortOrder);
        Long id = jdbc.queryForObject("SELECT id FROM doc_category WHERE space_id=? AND code=?", Long.class, spaceId, code);
        if (id == null) throw new IllegalStateException("分类回填未取得主键: " + spaceId + "/" + code);
        jdbc.update("UPDATE doc_category SET path=? WHERE id=?", "/" + id + "/", id);
        return id;
    }

    private static String sha16(String text) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest).substring(0, 16);
        } catch (Exception e) {
            throw new IllegalStateException("分类编码生成失败", e);
        }
    }
}
