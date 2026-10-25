package com.mftb.admin.service.doc;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocKnowledgeDTO.SystemPlan;
import com.mftb.admin.dto.DocKnowledgeDTO.SystemPlanDetail;
import com.mftb.admin.dto.DocKnowledgeDTO.SystemPlanPage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 系统方案库：把系统建设/整改生成的 MD 方案独立归档。
 *
 * <p>方案正文落库，来源路径、文件哈希、生成时间和所属系统一并记录；
 * 后续代码仓库变动或文件删除，仍可在菜单追溯当时方案。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DocSystemPlanService {
    private static final long MAX_FILE_BYTES = 5L * 1024 * 1024;

    private final DocNativeStore store;
    private final DocNativeAccess access;

    @Value("${doc.system-plan.root:../docs/design}")
    private String root;

    @Transactional
    public Map<String, Object> scan() {
        access.menu("doc-system-plans", "edit");
        Path dir = Path.of(root).toAbsolutePath().normalize();
        if (!Files.isDirectory(dir)) throw new BusinessException(400, "方案目錄不存在: " + dir);
        int inserted = 0;
        int updated = 0;
        int skipped = 0;
        try (var stream = Files.walk(dir, 1)) {
            List<Path> files = stream.filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().toLowerCase().endsWith(".md"))
                    .sorted()
                    .toList();
            for (Path file : files) {
                long size = Files.size(file);
                if (size <= 0 || size > MAX_FILE_BYTES) {
                    skipped++;
                    continue;
                }
                String fileName = file.getFileName().toString();
                String content = Files.readString(file, StandardCharsets.UTF_8);
                if (!StringUtils.hasText(content)) {
                    skipped++;
                    continue;
                }
                String title = title(content, fileName);
                String systemName = systemName(fileName);
                String systemCode = systemCode(systemName);
                String planType = planType(fileName);
                LocalDateTime generatedAt = time(Files.getLastModifiedTime(file));
                String contentHash = hash(content);
                String key = hash(fileName);
                Path parent = dir.getParent();
                String prefix = parent == null ? dir.getFileName().toString()
                        : parent.getFileName() + "/" + dir.getFileName();
                String sourcePath = prefix + "/" + dir.relativize(file).toString().replace('\\', '/');
                int changed = store.jdbc().update(
                        "INSERT INTO doc_system_plan(plan_key,file_name,title,system_name,system_code,plan_type,"
                                + "generated_at,source_path,content_hash,content,file_size,status) "
                                + "VALUES(?,?,?,?,?,?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE "
                                + "title=VALUES(title),system_name=VALUES(system_name),system_code=VALUES(system_code),"
                                + "plan_type=VALUES(plan_type),generated_at=VALUES(generated_at),"
                                + "source_path=VALUES(source_path),content_hash=VALUES(content_hash),"
                                + "content=VALUES(content),file_size=VALUES(file_size),updated_at=NOW()",
                        key, fileName, title, systemName, systemCode, planType, generatedAt, sourcePath,
                        contentHash, content, size);
                // MySQL ON DUPLICATE KEY UPDATE 返回 1=插入、2=更新；0=内容完全一致
                if (changed == 1) inserted++;
                else if (changed == 2) updated++;
                else skipped++;
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.warn("系统方案同步失败: {}", e.getClass().getSimpleName());
            throw new BusinessException(500, "方案目錄讀取失敗");
        }
        return Map.of("root", dir.toString(), "inserted", inserted, "updated", updated, "skipped", skipped);
    }

    public SystemPlanPage list(String keyword, String systemName, int page, int size) {
        access.menu("doc-system-plans", "view");
        int safePage = Math.max(1, Math.min(page, 100000));
        int safeSize = Math.max(1, Math.min(size, 100));
        String like = StringUtils.hasText(keyword) ? "%" + keyword.trim() + "%" : null;
        String system = StringUtils.hasText(systemName) ? systemName.trim() : null;
        Long total = store.jdbc().queryForObject(
                "SELECT COUNT(*) FROM doc_system_plan WHERE status=1 "
                        + "AND (? IS NULL OR title LIKE ? OR file_name LIKE ? OR system_name LIKE ?) "
                        + "AND (? IS NULL OR system_name=?)",
                Long.class, like, like, like, like, system, system);
        List<SystemPlan> rows = store.jdbc().query(
                "SELECT id,file_name,title,system_name,system_code,plan_type,generated_at,source_path,"
                        + "content_hash,file_size,updated_at FROM doc_system_plan WHERE status=1 "
                        + "AND (? IS NULL OR title LIKE ? OR file_name LIKE ? OR system_name LIKE ?) "
                        + "AND (? IS NULL OR system_name=?) ORDER BY generated_at DESC,id DESC LIMIT ? OFFSET ?",
                (rs, i) -> plan(rs), like, like, like, like, system, system,
                safeSize, (safePage - 1) * safeSize);
        return new SystemPlanPage(rows, total == null ? 0 : total, safePage, safeSize);
    }

    public SystemPlanDetail detail(long id) {
        access.menu("doc-system-plans", "view");
        List<SystemPlanDetail> rows = store.jdbc().query(
                "SELECT id,file_name,title,system_name,system_code,plan_type,generated_at,source_path,"
                        + "content_hash,file_size,updated_at,content FROM doc_system_plan WHERE id=? AND status=1",
                (rs, i) -> new SystemPlanDetail(plan(rs), rs.getString("content")), id);
        if (rows.isEmpty()) throw new BusinessException(404, "方案不存在");
        return rows.get(0);
    }

    public List<String> systems() {
        access.menu("doc-system-plans", "view");
        return store.jdbc().queryForList("SELECT DISTINCT system_name FROM doc_system_plan "
                + "WHERE status=1 ORDER BY system_name", String.class);
    }

    private static SystemPlan plan(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new SystemPlan(rs.getLong("id"), rs.getString("file_name"), rs.getString("title"),
                rs.getString("system_name"), rs.getString("system_code"), rs.getString("plan_type"),
                rs.getTimestamp("generated_at").toLocalDateTime(), rs.getString("source_path"),
                rs.getString("content_hash"), rs.getLong("file_size"),
                rs.getTimestamp("updated_at").toLocalDateTime());
    }

    private String systemCode(String systemName) {
        if (!StringUtils.hasText(systemName)) return null;
        List<String> codes = store.jdbc().queryForList(
                "SELECT code FROM sys_system WHERE deleted=0 AND (name=? OR name LIKE ?) LIMIT 1",
                String.class, systemName, "%" + systemName + "%");
        return codes.isEmpty() ? null : codes.get(0);
    }

    private static String systemName(String fileName) {
        String base = fileName.replaceFirst("\\.[^.]+$", "");
        int underscore = base.indexOf('_');
        String value = underscore > 0 ? base.substring(0, underscore) : "通用";
        return value.length() > 100 ? value.substring(0, 100) : value;
    }

    private static String planType(String fileName) {
        for (String keyword : List.of("整改方案", "重构方案", "建设方案", "实施方案", "修复方案", "分析方案", "设计方案")) {
            if (fileName.contains(keyword)) return keyword;
        }
        if (fileName.contains("整改")) return "整改方案";
        if (fileName.contains("重构")) return "重构方案";
        if (fileName.contains("分析")) return "分析方案";
        return "方案";
    }

    private static String title(String content, String fileName) {
        for (String line : content.split("\\R")) {
            String trimmed = line.trim();
            if (trimmed.startsWith("# ")) {
                String title = trimmed.substring(2).trim();
                if (!title.isEmpty()) return title.length() > 300 ? title.substring(0, 300) : title;
            }
        }
        return fileName.replaceFirst("\\.[^.]+$", "");
    }

    private static LocalDateTime time(FileTime value) {
        return LocalDateTime.ofInstant(value.toInstant(), ZoneId.systemDefault());
    }

    private static String hash(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }
}
