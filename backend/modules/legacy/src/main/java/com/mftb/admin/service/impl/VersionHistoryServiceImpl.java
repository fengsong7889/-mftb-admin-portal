package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.VersionHistoryVO;
import com.mftb.admin.entity.SysVersionHistory;
import com.mftb.admin.mapper.SysVersionHistoryMapper;
import com.mftb.admin.service.VersionHistoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 版本发布历史记录服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class VersionHistoryServiceImpl implements VersionHistoryService {

    /** 版本号段位封顶：第二位及之后的每一位最大 99，再 +1 时向前一位进位（里程表式） */
    static final int SEGMENT_CAP = 99;

    private static final int SEGMENT_BASE = SEGMENT_CAP + 1;

    /** 版本号写法：第一段 1~4 位，第二~四段各 1~2 位（即 0~99），第四段可省略 */
    private static final Pattern VERSION_PATTERN = Pattern.compile("^\\d{1,4}\\.\\d{1,2}\\.\\d{1,2}(\\.\\d{1,2})?$");

    /**
     * 可作为重排起点的号形：每段只要求是数字，故意放宽到允许进位规则上线前的旧号（如 1.0.117.00），
     * 这类号取进来后由 {@link #carrySegments(int[])} 归位，不会把非法序列继承下去。
     */
    private static final Pattern STARTABLE_VERSION = Pattern.compile("^\\d+\\.\\d+\\.\\d+(\\.\\d+)?$");

    /** 重排起始号的兜底值：仅当首条记录的现有号解不出上面这种形状（历史脏值、临时号残留）时才用 */
    static final String RENUMBER_FALLBACK_START = "1.0.0.00";

    private final SysVersionHistoryMapper mapper;

    /** 需求表按版本号的字符串快照关联发布记录，重新编号后必须同步换号，只能走原生 SQL */
    private final JdbcTemplate jdbcTemplate;

    @Override
    public PageResult<VersionHistoryVO> list(long page, long size, String keyword, String releaseType,
                                              java.time.LocalDate startDate, java.time.LocalDate endDate, Integer status,
                                              String createdBy, String updatedBy,
                                              java.time.LocalDate updatedStartDate, java.time.LocalDate updatedEndDate) {
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);

        LambdaQueryWrapper<SysVersionHistory> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(SysVersionHistory::getVersionNo, keyword)
                    .or().like(SysVersionHistory::getSummary, keyword));
        }
        if (StringUtils.hasText(releaseType)) {
            wrapper.eq(SysVersionHistory::getReleaseType, releaseType);
        }
        if (startDate != null) {
            wrapper.ge(SysVersionHistory::getReleaseDate, startDate);
        }
        if (endDate != null) {
            wrapper.le(SysVersionHistory::getReleaseDate, endDate);
        }
        if (status != null) {
            wrapper.eq(SysVersionHistory::getStatus, status);
        }
        if (StringUtils.hasText(createdBy)) {
            wrapper.like(SysVersionHistory::getCreatedBy, createdBy);
        }
        if (StringUtils.hasText(updatedBy)) {
            wrapper.like(SysVersionHistory::getUpdatedBy, updatedBy);
        }
        if (updatedStartDate != null) {
            wrapper.ge(SysVersionHistory::getUpdatedAt, updatedStartDate.atStartOfDay());
        }
        if (updatedEndDate != null) {
            wrapper.le(SysVersionHistory::getUpdatedAt, updatedEndDate.plusDays(1).atStartOfDay());
        }
        // 按版本号数值降序排列（最大版本号在最前面，进入菜单即可看到最新版本）
        wrapper.last("ORDER BY "
                + "CAST(SUBSTRING_INDEX(version_no,'.',1) AS UNSIGNED) DESC, "
                + "CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(version_no,'.',2),'.',-1) AS UNSIGNED) DESC, "
                + "CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(version_no,'.',3),'.',-1) AS UNSIGNED) DESC, "
                + "CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(version_no,'.',4),'.',-1) AS UNSIGNED) DESC");

        // 使用 MyBatis-Plus Page 自动处理 count + 分页
        com.baomidou.mybatisplus.extension.plugins.pagination.Page<SysVersionHistory> pageObj =
                new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(page, size, true);
        mapper.selectPage(pageObj, wrapper);
        long total = pageObj.getTotal();
        List<SysVersionHistory> records = pageObj.getRecords();

        List<VersionHistoryVO> voList = records.stream().map(this::toVO).toList();
        return new PageResult<>(voList, total);
    }

    @Override
    public VersionHistoryVO getById(Long id) {
        SysVersionHistory entity = mapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("版本記錄不存在");
        }
        return toVO(entity);
    }

    @Override
    public Long create(VersionHistoryVO vo, String operator) {
        validateVersionNo(vo.getVersionNo(), null);
        SysVersionHistory entity = new SysVersionHistory();
        copyFromVO(entity, vo);
        entity.setCreatedBy(operator);
        entity.setUpdatedBy(operator);
        mapper.insert(entity);
        return entity.getId();
    }

    @Override
    public void update(Long id, VersionHistoryVO vo, String operator) {
        SysVersionHistory entity = mapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("版本記錄不存在");
        }
        // 存量记录可能保留进位规则上线前的超标号（如 1.0.117.00），只改概要等其他字段时不得因此卡死；
        // 一旦真的改号，必须按新规则在服务端重新裁决（前端校验只负责 UX）
        if (!Objects.equals(entity.getVersionNo(), vo.getVersionNo())) {
            validateVersionNo(vo.getVersionNo(), id);
        }
        copyFromVO(entity, vo);
        entity.setUpdatedBy(operator);
        mapper.updateById(entity);
    }

    /** 版本号格式与唯一性的服务端裁决 */
    private void validateVersionNo(String versionNo, Long selfId) {
        String trimmed = versionNo == null ? null : versionNo.trim();
        if (trimmed == null || trimmed.isEmpty() || !VERSION_PATTERN.matcher(trimmed).matches()) {
            throw new BusinessException("版本號格式不正確：第二位及之後每一位最大 99，滿 99 向前一位進位"
                    + "（例 1.0.117.00 應寫為 1.1.17.00）；合法寫法如 1.0.1 或 1.0.01");
        }
        LambdaQueryWrapper<SysVersionHistory> dup = new LambdaQueryWrapper<>();
        dup.eq(SysVersionHistory::getVersionNo, trimmed);
        if (selfId != null) {
            dup.ne(SysVersionHistory::getId, selfId);
        }
        if (mapper.selectCount(dup) > 0) {
            // 唯一键冲突若交给数据库抛异常会变成 500，这里给业务可读提示
            throw new BusinessException("版本號 " + trimmed + " 已存在，請更換後再保存");
        }
    }

    @Override
    public void delete(Long id) {
        SysVersionHistory entity = mapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("版本記錄不存在");
        }
        mapper.deleteById(id);
    }

    private VersionHistoryVO toVO(SysVersionHistory entity) {
        VersionHistoryVO vo = new VersionHistoryVO();
        vo.setId(entity.getId());
        vo.setVersionNo(entity.getVersionNo());
        vo.setReleaseDate(entity.getReleaseDate());
        vo.setReleaseType(entity.getReleaseType());
        vo.setSummary(entity.getSummary());
        vo.setFrontendChanges(entity.getFrontendChanges());
        vo.setBackendChanges(entity.getBackendChanges());
        vo.setDatabaseChanges(entity.getDatabaseChanges());
        vo.setCommitHash(entity.getCommitHash());
        vo.setStatus(entity.getStatus());
        vo.setCreatedBy(entity.getCreatedBy());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setCreatedAt(entity.getCreatedAt());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }

    private void copyFromVO(SysVersionHistory entity, VersionHistoryVO vo) {
        entity.setVersionNo(vo.getVersionNo());
        entity.setReleaseDate(vo.getReleaseDate());
        entity.setReleaseType(vo.getReleaseType());
        entity.setSummary(vo.getSummary());
        entity.setFrontendChanges(vo.getFrontendChanges());
        entity.setBackendChanges(vo.getBackendChanges());
        entity.setDatabaseChanges(vo.getDatabaseChanges());
        entity.setCommitHash(vo.getCommitHash());
        entity.setStatus(vo.getStatus());
    }

    // ─────────────────────────────────────────────
    // Git 同步版本记录
    // ──────────────────────────────────────────────

    @Override
    public String syncFromGit(String operator) {
        if (!isGitAvailable()) {
            return "當前環境未安裝 Git，無法從 Git 同步版本記錄";
        }

        String projectDir = getProjectRootDir();
        if (projectDir == null) {
            return "無法定位項目根目錄，請確認應用部署在 Git 倉庫中";
        }

        // 优先使用已同步的最新 commit hash 做增量同步（精确到提交级别）
        String lastCommitHash = getLastSyncedCommitHash();
        LocalDate fallbackDate = null;
        if (lastCommitHash == null) {
            // 旧记录没有 commitHash 字段，回退到日期方式（减 1 天避免遗漏同日提交）
            fallbackDate = getLastVersionReleaseDate();
            if (fallbackDate != null) {
                fallbackDate = fallbackDate.minusDays(1);
            }
        }

        List<GitCommit> commits = readGitLog(projectDir, lastCommitHash, fallbackDate);
        if (commits.isEmpty()) {
            return "沒有新的 Git 提交需要同步";
        }

        Map<LocalDate, List<GitCommit>> grouped = commits.stream()
                .collect(Collectors.groupingBy(GitCommit::getDate,
                        () -> new TreeMap<LocalDate, List<GitCommit>>(),
                        Collectors.toList()));

        int created = 0;
        // 基于最后版本号计算下一个版本
        String lastVersionNo = getLastVersionNo();
        String nextVersion = lastVersionNo != null ? lastVersionNo : "1.0.0";

        for (Map.Entry<LocalDate, List<GitCommit>> entry : grouped.entrySet()) {
            LocalDate date = entry.getKey();
            List<GitCommit> dayCommits = entry.getValue();

            nextVersion = bumpVersion(nextVersion, dayCommits);

            String summary = dayCommits.stream()
                    .map(GitCommit::getSubject)
                    .collect(Collectors.joining("; "));

            String frontendChanges = dayCommits.stream()
                    .filter(GitCommit::hasFrontendChanges)
                    .map(GitCommit::getSubject)
                    .collect(Collectors.joining("\n"));

            String backendChanges = dayCommits.stream()
                    .filter(GitCommit::hasBackendChanges)
                    .map(GitCommit::getSubject)
                    .collect(Collectors.joining("\n"));

            String databaseChanges = dayCommits.stream()
                    .filter(GitCommit::hasDatabaseChanges)
                    .map(GitCommit::getSubject)
                    .collect(Collectors.joining("\n"));

            String releaseType = determineReleaseType(dayCommits);

            // 取该日期分组的第一个提交 hash（git log 按时间倒序，即最新 commit）
            String latestHash = dayCommits.get(0).getHash();

            SysVersionHistory entity = new SysVersionHistory();
            entity.setVersionNo(nextVersion);
            entity.setReleaseDate(date);
            entity.setReleaseType(releaseType);
            entity.setSummary(summary);
            entity.setFrontendChanges(frontendChanges.isEmpty() ? null : frontendChanges);
            entity.setBackendChanges(backendChanges.isEmpty() ? null : backendChanges);
            entity.setDatabaseChanges(databaseChanges.isEmpty() ? null : databaseChanges);
            entity.setCommitHash(latestHash);
            entity.setStatus(1);
            entity.setCreatedBy(operator != null ? operator : "Git Sync");
            entity.setUpdatedBy(operator != null ? operator : "Git Sync");
            mapper.insert(entity);
            created++;
        }

        String msg = String.format("成功從 Git 同步 %d 條版本記錄（%d 個提交）", created, commits.size());
        log.info(msg);
        return msg;
    }

    private boolean isGitAvailable() {
        try {
            Process p = new ProcessBuilder("git", "--version").start();
            return p.waitFor() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    private String getProjectRootDir() {
        try {
            Process p = new ProcessBuilder(gitCmd("rev-parse", "--show-toplevel"))
                    .redirectErrorStream(true)
                    .start();
            String output = readProcessOutput(p).trim();
            if (p.waitFor() == 0 && !output.isEmpty()) {
                return output;
            }
        } catch (Exception e) {
            log.warn("無法獲取 Git 項目根目錄: {}", e.getMessage());
        }
        String[] candidates = {"/Users/yangjingjing/Desktop/SARY", "."};
        for (String dir : candidates) {
            File f = new File(dir, ".git");
            if (f.exists()) {
                return new File(dir).getAbsolutePath();
            }
        }
        return null;
    }

    /** 获取最新同步的 commit hash（按 id 倒序取有 commitHash 的记录，比 createdAt 更可靠） */
    private String getLastSyncedCommitHash() {
        LambdaQueryWrapper<SysVersionHistory> wrapper = new LambdaQueryWrapper<>();
        wrapper.isNotNull(SysVersionHistory::getCommitHash);
        wrapper.ne(SysVersionHistory::getCommitHash, "");
        wrapper.orderByDesc(SysVersionHistory::getId);
        wrapper.last("LIMIT 1");
        SysVersionHistory latest = mapper.selectOne(wrapper);
        return latest != null ? latest.getCommitHash() : null;
    }

    /** 获取最大发布日期，用于 Git 同步 fallback */
    private LocalDate getLastVersionReleaseDate() {
        LambdaQueryWrapper<SysVersionHistory> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(SysVersionHistory::getReleaseDate);
        wrapper.orderByDesc(SysVersionHistory::getReleaseDate);
        wrapper.last("LIMIT 1");
        SysVersionHistory latest = mapper.selectOne(wrapper);
        return latest != null ? latest.getReleaseDate() : null;
    }

    /** 获取最后版本记录的版本号（按数值排序，非字符串排序） */
    private String getLastVersionNo() {
        List<SysVersionHistory> all = mapper.selectList(
                new LambdaQueryWrapper<SysVersionHistory>().orderByDesc(SysVersionHistory::getCreatedAt));
        if (all.isEmpty()) return null;

        // 按数值比较找最大版本号
        SysVersionHistory latest = all.get(0);
        for (int i = 1; i < all.size(); i++) {
            if (compareVersion(all.get(i).getVersionNo(), latest.getVersionNo()) > 0) {
                latest = all.get(i);
            }
        }
        return latest.getVersionNo();
    }

    /**
     * 语义化版本号数值比较
     * 支持 3 段式 (X.Y.Z) 和 4 段式 (X.Y.Z.SS)
     * 返回: >0 表示 v1>v2, =0 表示相等, <0 表示 v1<v2
     */
    private int compareVersion(String v1, String v2) {
        if (v1 == null && v2 == null) return 0;
        if (v1 == null) return -1;
        if (v2 == null) return 1;

        String[] p1 = v1.split("\\.");
        String[] p2 = v2.split("\\.");

        int major1 = safeInt(p1, 0), minor1 = safeInt(p1, 1), patch1 = safeInt(p1, 2), sub1 = safeInt(p1, 3);
        int major2 = safeInt(p2, 0), minor2 = safeInt(p2, 1), patch2 = safeInt(p2, 2), sub2 = safeInt(p2, 3);

        if (major1 != major2) return Integer.compare(major1, major2);
        if (minor1 != minor2) return Integer.compare(minor1, minor2);
        if (patch1 != patch2) return Integer.compare(patch1, patch2);
        return Integer.compare(sub1, sub2);
    }

    private int safeInt(String[] parts, int index) {
        if (index >= parts.length) return 0;
        try { return Integer.parseInt(parts[index]); } catch (NumberFormatException e) { return 0; }
    }

    /**
     * 解析版本号字符串为 [major, minor, patch, subPatch]
     * 支持 3 段式 (X.Y.Z) 和 4 段式 (X.Y.Z.SS)
     */
    private int[] parseVersion(String version) {
        String[] parts = version.split("\\.");
        return new int[]{safeInt(parts, 0), safeInt(parts, 1), safeInt(parts, 2), safeInt(parts, 3)};
    }

    /**
     * 里程表式进位：第二~四段任何一位超过 {@link #SEGMENT_CAP} 就向前一位进 1、本位归零，
     * 进位可逐级传递到第一位（主版本号不设上限）。
     * <p>就地修改并返回同一数组，调用方拿到的一定是符合封顶规则的号位。
     */
    static int[] carrySegments(int[] v) {
        for (int i = v.length - 1; i > 0; i--) {
            if (v[i] > SEGMENT_CAP) {
                v[i] -= SEGMENT_BASE;
                v[i - 1] += 1;
            }
        }
        return v;
    }

    /**
     * 按发布类型推进一步版本号并套用进位规则。
     * <p>低位递增时高位归零的既有口径保持不变：重大更新重置第三/四段，功能新增重置第四段。
     */
    static int[] advanceVersion(int[] current, String releaseType) {
        int[] v = current.clone();
        if ("major".equals(releaseType)) {
            v[1] += 1;
            v[2] = 0;
            v[3] = 0;
        } else if ("minor".equals(releaseType)) {
            v[2] += 1;
            v[3] = 0;
        } else {
            // patch / frontend：第四位（子补丁）增长
            v[3] += 1;
        }
        return carrySegments(v);
    }

    /** 版本号展示格式：第一~三段不补零，第四段固定两位（00~99） */
    static String formatVersion(int[] v) {
        return v[0] + "." + v[1] + "." + v[2] + "." + String.format("%02d", v[3]);
    }

    /**
     * 读取 Git 提交日志（增量同步）
     * @param projectDir     项目根目录
     * @param sinceHash      上次同步到的最新 commit hash（非空时使用 hash 范围精确查询）
     * @param fallbackDate   回退日期（sinceHash 为空时使用，取该日期之前的所有提交）
     */
    private List<GitCommit> readGitLog(String projectDir, String sinceHash, LocalDate fallbackDate) {
        try {
            List<String> cmd = gitCmd("log", "--pretty=format:%H|%ad|%an|%s", "--date=short");
            if (sinceHash != null && !sinceHash.isEmpty()) {
                // 精确增量：只取 lastHash 之后的提交（不含 lastHash 本身）
                cmd.add(sinceHash + "..HEAD");
            } else if (fallbackDate != null) {
                // 回退模式：取 fallbackDate 当天及之后的提交
                cmd.add("--since=" + fallbackDate.format(DateTimeFormatter.ISO_LOCAL_DATE));
            }

            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.directory(new File(projectDir));
            pb.redirectErrorStream(true);
            Process p = pb.start();
            String output = readProcessOutput(p);
            p.waitFor();

            if (output.trim().isEmpty()) {
                return Collections.emptyList();
            }
            // git 执行失败时 stderr 会混入输出（redirectErrorStream），识别 fatal/error 行避免静默失败误报「没有新提交」
            if (output.contains("fatal:") || output.contains("error:")) {
                log.warn("git log 執行失敗（輸出前 500 字符）: {}", output.length() > 500 ? output.substring(0, 500) : output);
                return Collections.emptyList();
            }

            List<GitCommit> commits = new ArrayList<>();
            for (String line : output.split("\n")) {
                line = line.trim();
                if (line.isEmpty()) continue;
                String[] parts = line.split("\\|", 4);
                if (parts.length < 4) continue;

                String hash = parts[0];
                LocalDate date = LocalDate.parse(parts[1], DateTimeFormatter.ISO_LOCAL_DATE);
                String author = parts[2];
                String subject = parts[3];
                List<String> changedFiles = getChangedFiles(projectDir, hash);

                commits.add(new GitCommit(hash, date, author, subject, changedFiles));
            }
            return commits;
        } catch (Exception e) {
            log.error("讀取 Git 日誌失敗: {}", e.getMessage(), e);
            return Collections.emptyList();
        }
    }

    private List<String> getChangedFiles(String projectDir, String commitHash) {
        try {
            ProcessBuilder pb = new ProcessBuilder(gitCmd("diff-tree", "--no-commit-id", "--name-only", "-r", commitHash));
            pb.directory(new File(projectDir));
            pb.redirectErrorStream(true);
            Process p = pb.start();
            String output = readProcessOutput(p);
            p.waitFor();

            return Arrays.stream(output.split("\n"))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .collect(Collectors.toList());
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    private String readProcessOutput(Process p) throws Exception {
        StringBuilder sb = new StringBuilder();
        // git 输出始终为 UTF-8；Alpine 容器 JVM 默认 charset 非 UTF-8，需显式指定避免中文乱码
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
        }
        return sb.toString();
    }

    /** 构建带 safe.directory 的 git 命令（容器内 .git 归 root、运行用户为 app 时，Git 2.35.2+ 会拒绝执行） */
    private List<String> gitCmd(String... args) {
        List<String> cmd = new ArrayList<>();
        cmd.add("git");
        cmd.add("-c");
        cmd.add("safe.directory=*");
        cmd.addAll(Arrays.asList(args));
        return cmd;
    }

    /**
     * 根据提交记录计算下一个版本号（进位口径见 advanceVersion）：
     *   重大更新 → 第二位数增长  1.0.0.00 → 1.1.0.00
     *   功能新增 → 第三位数增长  1.0.0.00 → 1.0.1.00
     *   问题修复/前端优化 → 第四位数增长 1.0.0.00 → 1.0.0.01
     * 第二位及之后每一位封顶 99，满 99 向前一位进位。
     */
    private String bumpVersion(String currentVersion, List<GitCommit> commits) {
        return formatVersion(advanceVersion(parseVersion(currentVersion), determineReleaseType(commits)));
    }

    @Override
    public String suggestNextVersion(String releaseType) {
        String lastVersionNo = getLastVersionNo();
        String base = lastVersionNo != null ? lastVersionNo : "1.0.0";
        return formatVersion(advanceVersion(parseVersion(base), releaseType));
    }

    private String determineReleaseType(List<GitCommit> commits) {
        boolean hasBreaking = commits.stream()
                .anyMatch(c -> c.getSubject().contains("!") || c.getSubject().toLowerCase().contains("breaking"));
        boolean hasFeature = commits.stream()
                .anyMatch(c -> c.getSubject().startsWith("feat") || c.getSubject().startsWith("feat("));
        boolean hasFix = commits.stream()
                .anyMatch(c -> c.getSubject().startsWith("fix") || c.getSubject().startsWith("fix("));

        if (hasBreaking) return "major";
        if (hasFeature) return "minor";
        if (hasFix) return "patch";
        return "frontend";
    }

    /**
     * Git 提交记录
     */
    private static class GitCommit {
        private final String hash;
        private final LocalDate date;
        private final String author;
        private final String subject;
        private final List<String> changedFiles;

        GitCommit(String hash, LocalDate date, String author, String subject, List<String> changedFiles) {
            this.hash = hash;
            this.date = date;
            this.author = author;
            this.subject = subject;
            this.changedFiles = changedFiles;
        }

        String getHash() { return hash; }
        LocalDate getDate() { return date; }
        String getAuthor() { return author; }
        String getSubject() { return subject; }
        List<String> getChangedFiles() { return changedFiles; }

        boolean hasFrontendChanges() {
            return changedFiles.stream().anyMatch(f ->
                    f.startsWith("src/") || f.startsWith("public/") || f.endsWith(".tsx")
                            || f.endsWith(".ts") || f.endsWith(".css"));
        }

        boolean hasBackendChanges() {
            return changedFiles.stream().anyMatch(f ->
                    f.startsWith("backend/src/") || f.endsWith(".java") || f.equals("backend/pom.xml"));
        }

        boolean hasDatabaseChanges() {
            return changedFiles.stream().anyMatch(f ->
                    f.endsWith(".sql") || f.startsWith("backend/sql/"));
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String renumberAll() {
        // 按创建时间正序查询所有记录（最早的在前）；同一秒创建的多条以主键兼做次级排序，
        // 否则数据库返回顺序拖动就会得出不同的编号
        List<SysVersionHistory> all = mapper.selectList(
                new LambdaQueryWrapper<SysVersionHistory>()
                        .orderByAsc(SysVersionHistory::getCreatedAt)
                        .orderByAsc(SysVersionHistory::getId));
        if (all.isEmpty()) {
            return "沒有版本記錄需要重新編號";
        }

        // 起始号必须在置临时号之前取：置号后 record.getVersionNo() 已经是 _tmp_<id>，解不出任何形状
        String firstVersionNo = all.get(0).getVersionNo();

        // 第一步：先记住旧号，再把所有版本号置为临时号（避免与唯一键冲突）
        Map<Long, String> oldNoById = new LinkedHashMap<>();
        for (SysVersionHistory record : all) {
            oldNoById.put(record.getId(), record.getVersionNo());
            record.setVersionNo("_tmp_" + record.getId());
            mapper.updateById(record);
        }

        // 第二步：以「重排前首条记录的现有号」为起点，按创建时间正序递增，每位封顶 99 并进位
        int[] v = resolveStartVersion(firstVersionNo);
        Map<String, String> remap = new LinkedHashMap<>();
        int updated = 0;

        for (SysVersionHistory record : all) {
            if (updated > 0) {
                v = advanceVersion(v, record.getReleaseType());
            }
            String newVersion = formatVersion(v);
            record.setVersionNo(newVersion);
            mapper.updateById(record);
            String oldVersion = oldNoById.get(record.getId());
            if (oldVersion != null && !oldVersion.equals(newVersion)) {
                remap.put(oldVersion, newVersion);
            }
            updated++;
        }

        // 第三步：需求表存的是版本号的字符串快照，不同步换号会把「版本追溯」查成空
        int migrated = migrateRequirementVersionLinks(remap);

        String msg = String.format("成功重新編號 %d 條版本記錄，同步遷移 %d 條需求關聯版本號", updated, migrated);
        log.info(msg);
        return msg;
    }

    /**
     * 解析重排起始号 —— 不写死常量，而是沿用库里首条记录现有的号。
     * <p>为什么必须自适应：新装库由 {@code 98_version_history.sql} 种子写入首条 {@code 1.0.0.00}（major，初始版本），
     * 而存量库的首条是 {@code 1.0.1.00}。写死其中任何一个，另一类库点一次「重新編號」就整体错位一格
     * （存量库 Δ-1 会把「第三段 = 批次号」的约定打散，新装库 Δ+1 会把初始版本改成功能新增号）。
     * 取现有首条号作起点后，本就合规的序列重排结果与自身相等（幂等），重排只修超限段及其后的行。
     * <p>起始号自身若超限（如首条就是 1.0.117.00）也先按封顶规则归位，避免把非法原点传染给整条序列。
     */
    private int[] resolveStartVersion(String firstVersionNo) {
        if (firstVersionNo == null || !STARTABLE_VERSION.matcher(firstVersionNo).matches()) {
            log.warn("重新編號起始号无法解析（首条记录现号={}），回退到 {}", firstVersionNo, RENUMBER_FALLBACK_START);
            return carrySegments(parseVersion(RENUMBER_FALLBACK_START));
        }
        return carrySegments(parseVersion(firstVersionNo));
    }

    /**
     * 把 rdm_requirement.version_no 按旧号→新号一次性改写。
     * <p>必须用单条 CASE 批量语句：逐条 UPDATE 时，若某条的新号恰好是另一条的旧号
     * （全量重算必然整体前移，因此肯定发生），已改写的行会被后续语句二次平移。
     * <p>所有值均走参数绑定，只拼接固定的 CASE 结构，不存在注入面。
     * 参数必须按 SQL 里占位符的出现顺序装配：先全部 WHEN/THEN 对，再全部 IN 旧号。
     */
    private int migrateRequirementVersionLinks(Map<String, String> remap) {
        if (remap.isEmpty()) {
            return 0;
        }
        RemapStatement statement = buildRequirementRemapSql(remap);
        return jdbcTemplate.update(statement.sql(), statement.args());
    }

    /** 批量换号语句：SQL 文本 + 与占位符同序的参数 */
    record RemapStatement(String sql, Object[] args) {
    }

    /**
     * 拼装旧号→新号的单条 CASE 语句。
     * <p>参数必须按占位符在 SQL 里的出现顺序装配：先全部 WHEN/THEN 对，再全部 IN 旧号。
     * 顺序错位不会报错、只会静默把需求关联改到错误的版本上，因此单独抽出便于直接断言。
     */
    static RemapStatement buildRequirementRemapSql(Map<String, String> remap) {
        StringBuilder sql = new StringBuilder("UPDATE rdm_requirement SET version_no = CASE version_no ");
        List<Object> args = new ArrayList<>();
        for (Map.Entry<String, String> entry : remap.entrySet()) {
            sql.append("WHEN ? THEN ? ");
            args.add(entry.getKey());
            args.add(entry.getValue());
        }
        sql.append("END WHERE version_no IN (");
        int index = 0;
        for (String oldVersionNo : remap.keySet()) {
            sql.append(index++ == 0 ? "?" : ", ?");
            args.add(oldVersionNo);
        }
        sql.append(")");
        return new RemapStatement(sql.toString(), args.toArray());
    }
}
