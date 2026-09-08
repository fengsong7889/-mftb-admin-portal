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
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 版本发布历史记录服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class VersionHistoryServiceImpl implements VersionHistoryService {

    private final SysVersionHistoryMapper mapper;

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
        wrapper.orderByDesc(SysVersionHistory::getCreatedAt);

        long total = mapper.selectCount(wrapper);
        List<SysVersionHistory> records = mapper.selectList(
                wrapper.last("LIMIT " + (page - 1) * size + "," + size));

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
        copyFromVO(entity, vo);
        entity.setUpdatedBy(operator);
        mapper.updateById(entity);
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
        String[] candidates = {"/Users/yangjingjing/Desktop/SRAS", "."};
        for (String dir : candidates) {
            File f = new File(dir, ".git");
            if (f.exists()) {
                return new File(dir).getAbsolutePath();
            }
        }
        return null;
    }

    /** 获取最新同步的 commit hash（优先按 createdAt 倒序取有 commitHash 的记录） */
    private String getLastSyncedCommitHash() {
        LambdaQueryWrapper<SysVersionHistory> wrapper = new LambdaQueryWrapper<>();
        wrapper.isNotNull(SysVersionHistory::getCommitHash);
        wrapper.ne(SysVersionHistory::getCommitHash, "");
        wrapper.orderByDesc(SysVersionHistory::getCreatedAt);
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
            // git 执行失败时 stderr 会混入输出（redirectErrorStream），识别 fatal/error 行避免静默失败误报「沒有新提交」
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
        // git 輸出始終為 UTF-8；Alpine 容器 JVM 默認 charset 非 UTF-8，需顯式指定避免中文亂碼
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
        }
        return sb.toString();
    }

    /** 構建帶 safe.directory 的 git 命令（容器内 .git 歸 root、運行用戶為 app 時，Git 2.35.2+ 會拒絕執行） */
    private List<String> gitCmd(String... args) {
        List<String> cmd = new ArrayList<>();
        cmd.add("git");
        cmd.add("-c");
        cmd.add("safe.directory=*");
        cmd.addAll(Arrays.asList(args));
        return cmd;
    }

    /**
     * 根据提交记录计算下一个版本号
     * 版本规则：
     *   重大更新 → 第二位数增长  1.0.0 → 1.1.0
     *   功能新增 → 第三位数增长  1.0.0 → 1.0.1
     *   问题修复 → 第四位(子补丁) 1.0.0 → 1.0.01
     */
    private String bumpVersion(String currentVersion, List<GitCommit> commits) {
        int[] v = parseVersion(currentVersion);
        int major = v[0], minor = v[1], patch = v[2], subPatch = v[3];

        boolean hasBreaking = commits.stream()
                .anyMatch(c -> c.getSubject().contains("!") || c.getSubject().toLowerCase().contains("breaking"));
        boolean hasFeature = commits.stream()
                .anyMatch(c -> c.getSubject().startsWith("feat") || c.getSubject().startsWith("feat("));
        boolean hasFix = commits.stream()
                .anyMatch(c -> c.getSubject().startsWith("fix") || c.getSubject().startsWith("fix("));

        if (hasBreaking) {
            // 重大更新：第二位数增长
            return major + "." + (minor + 1) + ".0.00";
        } else if (hasFeature) {
            // 功能新增：第三位数增长
            return major + "." + minor + "." + (patch + 1) + ".00";
        } else if (hasFix) {
            // bug修復：第四位(子补丁)增长
            return major + "." + minor + "." + patch + "." + String.format("%02d", subPatch + 1);
        } else {
            // 前端交互優化：第四位(子补丁)增长
            return major + "." + minor + "." + patch + "." + String.format("%02d", subPatch + 1);
        }
    }

    @Override
    public String suggestNextVersion(String releaseType) {
        String lastVersionNo = getLastVersionNo();
        String base = lastVersionNo != null ? lastVersionNo : "1.0.0";

        int[] v = parseVersion(base);
        int major = v[0], minor = v[1], patch = v[2], subPatch = v[3];

        if ("major".equals(releaseType)) {
            // 重大更新：第二位数增长
            return major + "." + (minor + 1) + ".0.00";
        } else if ("minor".equals(releaseType)) {
            // 功能新增：第三位数增长
            return major + "." + minor + "." + (patch + 1) + ".00";
        } else {
            // bug修復 / 前端交互優化：第四位(子补丁)增长
            return major + "." + minor + "." + patch + "." + String.format("%02d", subPatch + 1);
        }
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
     * Git 提交記錄
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
    public String renumberAll() {
        // 按创建时间正序查询所有记录（最早的在前）
        List<SysVersionHistory> all = mapper.selectList(
                new LambdaQueryWrapper<SysVersionHistory>().orderByAsc(SysVersionHistory::getCreatedAt));
        if (all.isEmpty()) {
            return "沒有版本記錄需要重新編號";
        }

        // 第一步：先将所有版本号清空（避免唯一键冲突）
        for (SysVersionHistory record : all) {
            record.setVersionNo("_tmp_" + record.getId());
            mapper.updateById(record);
        }

        // 第二步：从起始版本 1.0.0.00 开始，按创建时间正序递增
        int major = 1, minor = 0, patch = 0, subPatch = 0;
        int updated = 0;

        for (SysVersionHistory record : all) {
            String releaseType = record.getReleaseType();

            if (updated > 0) {
                // 从第二条开始递增
                if ("major".equals(releaseType)) {
                    minor++;
                    patch = 0;
                    subPatch = 0;
                } else if ("minor".equals(releaseType)) {
                    patch++;
                    subPatch = 0;
                } else {
                    // patch / frontend：第四位递增
                    subPatch++;
                }
            }

            String newVersion = major + "." + minor + "." + patch + "." + String.format("%02d", subPatch);
            record.setVersionNo(newVersion);
            mapper.updateById(record);
            updated++;
        }

        return String.format("成功重新編號 %d 條版本記錄", updated);
    }
}
