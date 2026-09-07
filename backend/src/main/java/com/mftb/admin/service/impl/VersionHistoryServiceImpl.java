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
        wrapper.orderByDesc(SysVersionHistory::getReleaseDate);

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

        // 获取最大发布日期作为同步 cutoff（release_date 取自 commit 日期，比 created_at 可靠）
        LocalDate lastReleaseDate = getLastVersionReleaseDate();

        List<GitCommit> commits = readGitLog(projectDir, lastReleaseDate);
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

            SysVersionHistory entity = new SysVersionHistory();
            entity.setVersionNo(nextVersion);
            entity.setReleaseDate(date);
            entity.setReleaseType(releaseType);
            entity.setSummary(summary);
            entity.setFrontendChanges(frontendChanges.isEmpty() ? null : frontendChanges);
            entity.setBackendChanges(backendChanges.isEmpty() ? null : backendChanges);
            entity.setDatabaseChanges(databaseChanges.isEmpty() ? null : databaseChanges);
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
            Process p = new ProcessBuilder("git", "rev-parse", "--show-toplevel")
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

    /** 获取最大发布日期，用于 Git 同步 cutoff（release_date 取自 commit 日期，不会被手动录入干扰） */
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

    private List<GitCommit> readGitLog(String projectDir, LocalDate sinceDate) {
        try {
            List<String> cmd = new ArrayList<>();
            cmd.addAll(Arrays.asList("git", "log", "--pretty=format:%H|%ad|%an|%s", "--date=short"));
            if (sinceDate != null) {
                // 使用 --after 筛选指定日期之后的提交（不含当天，当天提交已在已有版本记录中）
                cmd.add("--after=" + sinceDate.format(DateTimeFormatter.ISO_LOCAL_DATE));
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
            ProcessBuilder pb = new ProcessBuilder("git", "diff-tree", "--no-commit-id", "--name-only", "-r", commitHash);
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
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
        }
        return sb.toString();
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

        if (hasBreaking) {
            // 重大更新：第二位数增长
            return major + "." + (minor + 1) + ".0";
        } else if (hasFeature) {
            // 功能新增：第三位数增长
            return major + "." + minor + "." + (patch + 1);
        } else {
            // 问题修复：第四位(子补丁)增长
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
            return major + "." + (minor + 1) + ".0";
        } else if ("minor".equals(releaseType)) {
            // 功能新增：第三位数增长
            return major + "." + minor + "." + (patch + 1);
        } else {
            // 问题修复：第四位(子补丁)增长
            return major + "." + minor + "." + patch + "." + String.format("%02d", subPatch + 1);
        }
    }

    private String determineReleaseType(List<GitCommit> commits) {
        boolean hasBreaking = commits.stream()
                .anyMatch(c -> c.getSubject().contains("!") || c.getSubject().toLowerCase().contains("breaking"));
        boolean hasFeature = commits.stream()
                .anyMatch(c -> c.getSubject().startsWith("feat") || c.getSubject().startsWith("feat("));

        if (hasBreaking) return "major";
        if (hasFeature) return "minor";
        return "patch";
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
}
