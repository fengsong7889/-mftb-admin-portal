package com.mftb.admin.service.doc;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocKnowledgeDTO.SystemPlan;
import com.mftb.admin.dto.DocKnowledgeDTO.SystemPlanDetail;
import com.mftb.admin.dto.DocKnowledgeDTO.SystemPlanPage;
import com.mftb.admin.dto.DocSystemPlanQuery;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 系统方案库：把仓库里的 MD 方案独立归档到数据库，供后续改造追溯。
 *
 * <p><b>数据源是 git 提交树，不是工作区目录。</b>旧实现用 {@code Files.walk} 扫本地目录，
 * 而根 {@code .dockerignore} 明确排除了 {@code docs/}，生产容器里根本没有这些文件，
 * 点同步只会报「方案目錄不存在: /docs/design」；本地能跑通只是因为恰好有工作区。
 * 镜像本来就为「版本记录同步」保留了 {@code .git}（Dockerfile COPY .git + safe.directory），
 * 改为读提交树后：生产与本地读的是同一棵树，结果必然一致，也不必增大镜像。
 *
 * <p>代价（已在页面提示）：<b>未提交的 md 扫不到</b>，写完方案必须先 commit。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DocSystemPlanService {
    private static final long MAX_FILE_BYTES = 5L * 1024 * 1024;
    private static final Pattern BLOB_SHA = Pattern.compile("^[0-9a-f]{7,64}$");

    /**
     * 猜不出所属系统时的兜底。
     * <p>旧实现把文件名第一个 {@code '_'} 之前的片段直接当系统名，在
     * {@code 员工管理_Core_HR_整改方案_94e06fc1.md} 这类命名下恰好成立，
     * 但 {@code HOME_REQUEST_STORM_2026-10.md} 会被猜成「HOME」、
     * {@code Enterprise_Agent_Platform_Progress_*.md} 会被猜成「Enterprise」。
     * 所属系统现在是筛选条件，垃圾值会直接污染下拉列表，因此必须回退到「通用」。
     */
    private static final String GENERIC_SYSTEM = "通用";

    /** 类型按声明顺序首次命中，越靠前越具体；关键词同时匹配文件名与正文标题。 */
    private static final List<Map.Entry<String, List<String>>> PLAN_TYPE_RULES = List.of(
            Map.entry("整改方案", List.of("整改方案", "整改")),
            Map.entry("重构方案", List.of("重构方案", "重构")),
            Map.entry("建设方案", List.of("建设方案", "建设")),
            Map.entry("实施方案", List.of("实施方案", "实施")),
            Map.entry("修复方案", List.of("修复方案", "修复")),
            Map.entry("分析方案", List.of("分析方案", "分析")),
            Map.entry("设计方案", List.of("设计方案", "设计")),
            Map.entry("进度交接", List.of("进度交接", "交接", "Progress", "Handoff")),
            Map.entry("验收手册", List.of("验收手册", "验收", "Runbook")),
            Map.entry("审计报告", List.of("审计报告", "审计", "audit")),
            Map.entry("测试记录", List.of("测试用例", "测试记录", "深度测试")),
            Map.entry("立项记录", List.of("立项")));

    private static final String DEFAULT_PLAN_TYPE = "方案";

    /** git log 的自定义记录头；真实路径都以 {@code docs/} 等目录开头，不会与此冲突。 */
    private static final String COMMIT_HEADER = "@commit ";

    private final DocNativeStore store;
    private final DocNativeAccess access;

    /** 逗号分隔的 git pathspec。默认只归档 {@code docs}，编码规范（.qoder/rules）与 README 不属于方案。 */
    @Value("${doc.system-plan.paths:docs}")
    private String pathSpecs;

    @Transactional
    public Map<String, Object> scan() {
        access.menu("doc-system-plans", "edit");
        Path repo = resolveRepoRoot();
        List<String> specs = pathSpecList();
        List<Blob> blobs = listBlobs(repo, specs);
        Map<String, CommitTimes> times = commitTimes(repo, specs);
        List<SystemOption> systems = systemOptions();

        int inserted = 0;
        int updated = 0;
        int unchanged = 0;
        int skipped = 0;
        int conflicted = 0;
        // 不能用 affected-rows 区分新增/更新：Connector/J 默认 useAffectedRows=false（found-rows 语义），
        // 对已存在行做 ON DUPLICATE KEY UPDATE 也返回 1，导致每次同步都报「新增 33」。
        // 改为先拉一份 plan_key → content_hash 快照，按内容是否变化分类。
        Map<String, String> existingHash = new HashMap<>();
        for (Map<String, Object> row : store.jdbc().queryForList("SELECT plan_key, content_hash FROM doc_system_plan")) {
            existingHash.put(String.valueOf(row.get("plan_key")), String.valueOf(row.get("content_hash")));
        }
        // plan_key 取「文件名的 SHA-256」而非整条路径：历史归档行建在这个键上，
        // 换成路径键会把已有记录变成孤儿。代价是不同目录下的同名文件会互相覆盖，
        // 因此这里显式计数上报，而不是让后扫到的静默盖掉先扫到的。
        Map<String, String> seenByName = new HashMap<>();
        for (Blob blob : blobs) {
            String fileName = Path.of(blob.path()).getFileName().toString();
            String previous = seenByName.putIfAbsent(fileName, blob.path());
            if (previous != null && !previous.equals(blob.path())) {
                conflicted++;
                continue;
            }
            byte[] raw = catFile(repo, blob.sha());
            if (raw.length == 0 || raw.length > MAX_FILE_BYTES) {
                skipped++;
                continue;
            }
            String content = new String(raw, StandardCharsets.UTF_8);
            if (!StringUtils.hasText(content)) {
                skipped++;
                continue;
            }
            String title = title(content, fileName);
            SystemOption system = resolveSystem(fileName, title, systems);
            String planType = planType(fileName, title);
            // 生成时间取该文件在 git 里的首次提交时间：文件 mtime 在任何一次
            // clone / CI 检出 / 镜像构建后都会塌缩成检出时间，跨机器不可信。
            CommitTimes commit = times.get(blob.path());
            LocalDateTime generatedAt = commit == null ? null : commit.firstAt();
            LocalDateTime lastTouched = commit == null ? null : commit.lastAt();
            if (generatedAt == null) {
                skipped++;
                continue;
            }
            String contentHash = hash(content);
            String key = hash(fileName);
            String previousHash = existingHash.get(key);
            String sourcePath = blob.path();
            int changed = store.jdbc().update(
                    "INSERT INTO doc_system_plan(plan_key,file_name,title,system_name,system_code,plan_type,"
                            + "generated_at,source_path,content_hash,content,file_size,status,updated_at) "
                            + "VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?) ON DUPLICATE KEY UPDATE "
                            + "title=VALUES(title),system_name=VALUES(system_name),system_code=VALUES(system_code),"
                            + "plan_type=VALUES(plan_type),generated_at=VALUES(generated_at),"
                            + "source_path=VALUES(source_path),content_hash=VALUES(content_hash),"
                            + "content=VALUES(content),file_size=VALUES(file_size),updated_at=VALUES(updated_at)",
                    key, fileName, title, system.name(), system.code(), planType, generatedAt, sourcePath,
                    contentHash, content, raw.length, lastTouched == null ? generatedAt : lastTouched);
            if (changed == 0) {
                // 只有驱动真的回报 0（已存在且各列值未变）才能确认是空操作；不影响分类判定。
                log.debug("系统方案空写入: {}", sourcePath);
            }
            // 注意 UPDATE 段刻意不含 status：人工「停用」的方案不得被再次同步悄悄恢复成生效。
            if (previousHash == null) inserted++;
            else if (!previousHash.equals(contentHash)) updated++;
            else unchanged++;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("repo", repo.toString());
        result.put("paths", String.join(",", specs));
        result.put("found", blobs.size());
        result.put("inserted", inserted);
        result.put("updated", updated);
        result.put("unchanged", unchanged);
        result.put("skipped", skipped);
        result.put("conflicted", conflicted);
        return result;
    }

    public SystemPlanPage list(DocSystemPlanQuery query) {
        access.menu("doc-system-plans", "view");
        int page = query.getPage();
        int size = query.getSize();
        int safePage = Math.max(1, Math.min(page, 100000));
        int safeSize = Math.max(1, Math.min(size, 100));
        StringBuilder where = new StringBuilder(" FROM doc_system_plan WHERE 1=1");
        List<Object> args = new ArrayList<>();
        if (StringUtils.hasText(query.getTitle())) {
            where.append(" AND (title LIKE ? OR file_name LIKE ?)");
            String like = "%" + query.getTitle().trim() + "%";
            args.add(like);
            args.add(like);
        }
        if (StringUtils.hasText(query.getSystemName())) {
            where.append(" AND system_name=?");
            args.add(query.getSystemName().trim());
        }
        if (StringUtils.hasText(query.getPlanType())) {
            where.append(" AND plan_type=?");
            args.add(query.getPlanType().trim());
        }
        // status 为 null 表示「全部」：已停用项必须仍可被筛出查看，
        // 不能像旧实现那样无条件藏起来——藏起来会让人以为方案消失了。
        if (query.getStatus() != null) {
            where.append(" AND status=?");
            args.add(query.getStatus());
        }
        appendRange(where, args, "generated_at", startOf(query.getGeneratedFrom()), endOf(query.getGeneratedTo()));
        appendRange(where, args, "updated_at", startOf(query.getUpdatedFrom()), endOf(query.getUpdatedTo()));

        Long total = store.jdbc().queryForObject("SELECT COUNT(*)" + where, Long.class, args.toArray());
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(safeSize);
        pageArgs.add((safePage - 1) * safeSize);
        List<SystemPlan> rows = store.jdbc().query(
                "SELECT id,file_name,title,system_name,system_code,plan_type,generated_at,source_path,"
                        + "content_hash,file_size,updated_at,status" + where
                        + " ORDER BY generated_at DESC,id DESC LIMIT ? OFFSET ?",
                (rs, i) -> plan(rs), pageArgs.toArray());
        return new SystemPlanPage(rows, total == null ? 0 : total, safePage, safeSize);
    }

    public SystemPlanDetail detail(long id) {
        access.menu("doc-system-plans", "view");
        // 不按 status 过滤：已停用方案仍要可打开，页面据此挂警示条。
        // 「停用」的意义是提示不要作为当前依据，不是把历史抹掉。
        List<SystemPlanDetail> rows = store.jdbc().query(
                "SELECT id,file_name,title,system_name,system_code,plan_type,generated_at,source_path,"
                        + "content_hash,file_size,updated_at,status,content FROM doc_system_plan WHERE id=?",
                (rs, i) -> new SystemPlanDetail(plan(rs), rs.getString("content")), id);
        if (rows.isEmpty()) throw new BusinessException(404, "方案不存在");
        return rows.get(0);
    }

    /**
     * 停用/启用。
     * <p>停用原因暂不落库：表内无对应列，而 {@code DocSystemPlanSchema} 派生出的结构契约
     * 把每列都声明为「缺失时不可自愈」，直接加列会让已有库出现漂移、生产严格模式下中止启动。
     * 补列需要同时给出 addColumnDdl 或另起迁移版本，作为后续项单独做。
     */
    @Transactional
    public SystemPlan updateStatus(long id, int status) {
        access.menu("doc-system-plans", "edit");
        if (status != 0 && status != 1) throw new BusinessException(400, "狀態只能是生效或停用");
        int changed = store.jdbc().update("UPDATE doc_system_plan SET status=? WHERE id=?", status, id);
        if (changed == 0) throw new BusinessException(404, "方案不存在");
        List<SystemPlan> rows = store.jdbc().query(
                "SELECT id,file_name,title,system_name,system_code,plan_type,generated_at,source_path,"
                        + "content_hash,file_size,updated_at,status FROM doc_system_plan WHERE id=?",
                (rs, i) -> plan(rs), id);
        return rows.get(0);
    }

    /** 筛选项候选：跨全部状态取值，否则「已停用」筛选下的下拉会缺项。 */
    public List<String> systems() {
        access.menu("doc-system-plans", "view");
        return store.jdbc().queryForList("SELECT DISTINCT system_name FROM doc_system_plan ORDER BY system_name",
                String.class);
    }

    public List<String> planTypes() {
        access.menu("doc-system-plans", "view");
        return store.jdbc().queryForList("SELECT DISTINCT plan_type FROM doc_system_plan ORDER BY plan_type",
                String.class);
    }

    /* ────────────────── git 读取 ────────────────── */

    private List<String> pathSpecList() {
        List<String> specs = Arrays.stream(pathSpecs == null ? new String[0] : pathSpecs.split(","))
                .map(String::trim).filter(StringUtils::hasText).toList();
        if (specs.isEmpty()) throw new BusinessException(400, "未配置方案路徑 doc.system-plan.paths");
        return specs;
    }

    /** 复用「版本记录同步」的做法：以 git 自己报的仓库根为准，容器内为 /app。 */
    private static Path resolveRepoRoot() {
        String output = runGit(null, List.of("rev-parse", "--show-toplevel"));
        String top = output.trim();
        if (top.isEmpty() || !Files.isDirectory(Path.of(top))) {
            throw new BusinessException(400, "找不到 Git 倉庫，無法同步方案（生產環境鏡像需包含 .git）");
        }
        return Path.of(top);
    }

    /** {@code git ls-tree -z} 每条记录形如 {@code mode<TAB>type<TAB><sha>\t<path>}——tab 前只有 3 个字段。 */
    private static List<Blob> listBlobs(Path repo, List<String> specs) {
        List<String> args = new ArrayList<>(List.of("ls-tree", "-r", "HEAD", "-z", "--"));
        args.addAll(specs);
        String raw = runGit(repo, args);
        List<Blob> blobs = new ArrayList<>();
        for (String record : raw.split("\0")) {
            if (record.isBlank()) continue;
            int tab = record.indexOf('\t');
            if (tab < 0) continue;
            String meta = record.substring(0, tab);
            String path = record.substring(tab + 1).trim();
            String[] parts = meta.split("\\s+");
            if (parts.length != 3 || !"blob".equals(parts[1]) || path.isEmpty()) continue;
            if (!path.toLowerCase().endsWith(".md") || isHidden(path)) continue;
            blobs.add(new Blob(parts[2], path));
        }
        return blobs;
    }

    /**
     * 一次 {@code git log --reverse} 求出每个路径的首次/最后一次提交时间。
     * <p>{@code --reverse} 为旧→新，因此同一文件第一次出现即生成时间、最后一次即最后修改时间；
     * 逐文件再调一次 git 会带来几十次进程创建，没必要。
     */
    private static Map<String, CommitTimes> commitTimes(Path repo, List<String> specs) {
        List<String> args = new ArrayList<>(List.of(
                "log", "--reverse", "--format=" + COMMIT_HEADER + "%cI", "--name-only", "--"));
        args.addAll(specs);
        String raw = runGit(repo, args);
        Map<String, CommitTimes> result = new HashMap<>();
        LocalDateTime current = null;
        for (String line : raw.split("\n")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty()) continue;
            if (trimmed.startsWith(COMMIT_HEADER)) {
                current = parseIso(trimmed.substring(COMMIT_HEADER.length()));
                continue;
            }
            if (current == null || !trimmed.toLowerCase().endsWith(".md") || isHidden(trimmed)) continue;
            CommitTimes existing = result.get(trimmed);
            if (existing == null) result.put(trimmed, new CommitTimes(current, current));
            else result.put(trimmed, new CommitTimes(existing.firstAt(), current));
        }
        return result;
    }

    private static LocalDateTime parseIso(String value) {
        try {
            return OffsetDateTime.parse(value.trim()).toLocalDateTime();
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static byte[] catFile(Path repo, String sha) {
        if (!BLOB_SHA.matcher(sha).matches()) throw new BusinessException(500, "方案物件指標異常");
        ProcessBuilder pb = new ProcessBuilder("git", "cat-file", "blob", sha);
        pb.directory(repo.toFile());
        pb.redirectErrorStream(false);
        try {
            Process process = pb.start();
            byte[] content = readAll(process.getInputStream());
            int code = process.waitFor();
            if (code != 0) throw new BusinessException(500, "方案正文讀取失敗: " + sha.substring(0, Math.min(8, sha.length())));
            return content;
        } catch (IOException e) {
            throw new BusinessException(500, "方案正文讀取失敗");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusinessException(500, "方案同步被中斷");
        }
    }

    /**
     * 执行 git 并返回 stdout。
     * <p>刻意不 {@code redirectErrorStream}：把 stderr 混进 stdout 会让调用方无法区分成败，
     * 历史实现因此把 git 失败当成「没有文件」静默返回。这里非 0 一律抛出，同步失败必须可见。
     */
    private static String runGit(Path workDir, List<String> args) {
        List<String> command = new ArrayList<>();
        command.add("git");
        // 中文路径默认会被转义成 "docs/\345\211\215..."，不关掉就扫不到任何中文名方案。
        command.add("-c");
        command.add("core.quotePath=false");
        command.addAll(args);
        ProcessBuilder pb = new ProcessBuilder(command);
        if (workDir != null) pb.directory(workDir.toFile());
        try {
            Process process = pb.start();
            String stdout = new String(readAll(process.getInputStream()), StandardCharsets.UTF_8);
            String stderr = new String(readAll(process.getErrorStream()), StandardCharsets.UTF_8);
            int code = process.waitFor();
            if (code != 0) {
                throw new BusinessException(500, "Git 讀取失敗: " + firstLine(stderr.isEmpty() ? stdout : stderr));
            }
            return stdout;
        } catch (IOException e) {
            throw new BusinessException(500, "Git 不可用，無法同步方案");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusinessException(500, "方案同步被中斷");
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
        return out.toByteArray();
    }

    private static String firstLine(String value) {
        int newline = value.indexOf('\n');
        String line = newline < 0 ? value : value.substring(0, newline);
        return line.length() > 200 ? line.substring(0, 200) : line;
    }

    /* ────────────────── 元数据推导 ────────────────── */

    private static void appendRange(StringBuilder where, List<Object> args, String column,
                                    LocalDateTime from, LocalDateTime to) {
        if (from != null) {
            where.append(" AND ").append(column).append(" >= ?");
            args.add(from);
        }
        if (to != null) {
            where.append(" AND ").append(column).append(" <= ?");
            args.add(to);
        }
    }

    /** 只选结束日也应包含当天，否则「生成时间 = 今天」会查不到今天刚提交的方案。 */
    private static LocalDateTime startOf(LocalDate date) {
        return date == null ? null : date.atStartOfDay();
    }

    private static LocalDateTime endOf(LocalDate date) {
        return date == null ? null : date.atTime(LocalTime.MAX);
    }

    private static SystemPlan plan(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new SystemPlan(rs.getLong("id"), rs.getString("file_name"), rs.getString("title"),
                rs.getString("system_name"), rs.getString("system_code"), rs.getString("plan_type"),
                rs.getTimestamp("generated_at").toLocalDateTime(), rs.getString("source_path"),
                rs.getString("content_hash"), rs.getLong("file_size"),
                rs.getTimestamp("updated_at").toLocalDateTime(), rs.getInt("status"));
    }

    private List<SystemOption> systemOptions() {
        // sys_system 的主键是 code、排序列是 sort_order，表内没有 id 也没有 sort；
        // 这两列名写错都会让整个同步在写库前崩掉。
        return store.jdbc().query(
                "SELECT code, name FROM sys_system WHERE deleted=0 ORDER BY sort_order, code",
                (rs, i) -> new SystemOption(rs.getString("code"), rs.getString("name")));
    }

    /**
     * 所属系统解析：文件名前缀精确匹配系统名 → 前缀等于系统 code（忽略大小写，
     * 接住 {@code RDM_*} / {@code HR_*} 这类英文缩写命名）→ 系统名包含前缀（旧 LIKE 口径）
     * → 标题包含系统名 → 兜底「通用」。
     */
    private static SystemOption resolveSystem(String fileName, String title, List<SystemOption> systems) {
        String base = fileName.replaceFirst("\\.[^.]+$", "");
        int underscore = base.indexOf('_');
        String prefix = (underscore > 0 ? base.substring(0, underscore) : base).trim();
        String needle = prefix.length() > 100 ? prefix.substring(0, 100) : prefix;
        for (SystemOption option : systems) {
            if (option.name().equals(needle)) return option;
        }
        for (SystemOption option : systems) {
            if (StringUtils.hasText(option.code()) && option.code().equalsIgnoreCase(needle)) return option;
        }
        for (SystemOption option : systems) {
            if (StringUtils.hasText(needle) && option.name() != null && option.name().contains(needle)) return option;
        }
        for (SystemOption option : systems) {
            if (option.name() != null && StringUtils.hasText(title) && title.contains(option.name())) return option;
        }
        return new SystemOption(null, GENERIC_SYSTEM);
    }

    private static String planType(String fileName, String title) {
        String haystack = fileName + " " + title;
        for (var rule : PLAN_TYPE_RULES) {
            for (String keyword : rule.getValue()) {
                if (haystack.contains(keyword)) return rule.getKey();
            }
        }
        return DEFAULT_PLAN_TYPE;
    }

    /** 跳过 .qoder 之类的点开头目录，避免把工具产物当方案归档。 */
    private static boolean isHidden(String path) {
        for (String segment : path.split("/")) {
            if (segment.startsWith(".")) return true;
        }
        return false;
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

    private static String hash(String value) {
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }

    /** 一条 git blob：对象号 + 仓库根相对路径。 */
    private record Blob(String sha, String path) {
    }

    /** 文件在 git 历史里的首次/末次提交时间。 */
    private record CommitTimes(LocalDateTime firstAt, LocalDateTime lastAt) {
    }

    /** sys_system 的最小投影，用于把文件名/标题映射到真实系统，避免逐文件查库。 */
    private record SystemOption(String code, String name) {
    }
}
