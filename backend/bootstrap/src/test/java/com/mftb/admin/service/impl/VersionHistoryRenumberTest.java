/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.VersionHistoryVO;
import com.mftb.admin.entity.SysVersionHistory;
import com.mftb.admin.mapper.SysVersionHistoryMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 版本号段位封顶 99 的进位口径：重新编号、自动建议、新增/编辑校验，以及需求关联版本号的同步迁移。
 */
@ExtendWith(MockitoExtension.class)
class VersionHistoryRenumberTest {

    @Mock
    SysVersionHistoryMapper mapper;

    @Mock
    JdbcTemplate jdbcTemplate;

    @InjectMocks
    VersionHistoryServiceImpl service;

    private static String advance(int[] current, String releaseType) {
        return VersionHistoryServiceImpl.formatVersion(VersionHistoryServiceImpl.advanceVersion(current, releaseType));
    }

    private SysVersionHistory record(long id, String versionNo, String releaseType) {
        SysVersionHistory record = new SysVersionHistory();
        record.setId(id);
        record.setVersionNo(versionNo);
        record.setReleaseType(releaseType);
        record.setCreatedAt(LocalDateTime.of(2026, 11, 1, 0, 0, 0).plusSeconds(id));
        return record;
    }

    @Test
    @DisplayName("第四位满 99 再 +1 时向第三位进位，本位归零")
    void subSegmentCarriesIntoThirdSegment() {
        assertEquals("1.0.1.00", advance(new int[]{1, 0, 0, 99}, "patch"));
        assertEquals("1.0.1.00", advance(new int[]{1, 0, 0, 99}, "frontend"));
    }

    @Test
    @DisplayName("第三位满 99 再 +1 时向第二位进位")
    void thirdSegmentCarriesIntoMinor() {
        assertEquals("1.1.0.00", advance(new int[]{1, 0, 99, 0}, "minor"));
    }

    @Test
    @DisplayName("第二位满 99 逐级进位到主版本号")
    void minorSegmentCarriesIntoMajorAndCascades() {
        assertEquals("2.0.0.00", advance(new int[]{1, 99, 99, 0}, "minor"));
        assertEquals("2.0.0.00", advance(new int[]{1, 99, 0, 0}, "major"));
    }

    @Test
    @DisplayName("重大更新递增第二位并重置低位")
    void majorReleaseResetsLowerSegments() {
        assertEquals("1.6.0.00", advance(new int[]{1, 5, 7, 8}, "major"));
    }

    @Test
    @DisplayName("重新编号以库里首条现有号为起点，只修超限段及其后的行，并同步迁移需求关联版本号")
    void renumberAllStartsFromExistingFirstNumberAndMigratesRequirementLinks() {
        // 118 条功能新增，旧号直接累加到 1.0.118.00（进位规则上线前的真实形态）；
        // 起点取首条 1.0.1.00，因此前 99 条重排结果与自身相等，只有溢出段及其后被修正
        List<SysVersionHistory> all = new ArrayList<>();
        for (int i = 1; i <= 118; i++) {
            all.add(record(i, "1.0." + i + ".00", "minor"));
        }
        when(mapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(all);
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(4);

        String msg = service.renumberAll();

        assertEquals("1.0.1.00", all.get(0).getVersionNo());
        assertEquals("1.0.99.00", all.get(98).getVersionNo());
        // 第三段满 99 后的下一条必须进位到第二位，而不是写出 1.0.100.00
        assertEquals("1.1.0.00", all.get(99).getVersionNo());
        assertEquals("1.1.18.00", all.get(117).getVersionNo());
        assertTrue(msg.contains("成功重新編號 118 條"), msg);
        assertTrue(msg.contains("同步遷移 4 條需求關聯版本號"), msg);

        // 需求关联必须被改写：单条 CASE 批量语句（逐条 UPDATE 会把新号恰好等于后续旧号的行二次平移）
        verify(jdbcTemplate, times(1)).update(anyString(), any(Object[].class));
    }

    @Test
    @DisplayName("新装库种子形态（首条 1.0.0.00）重排后与自身相等，不动需求表")
    void renumberOnSeededShapeStartsAtInitialVersionAndKeepsIt() {
        // 98_version_history.sql 写入的首条是 1.0.0.00（major 初始版本），起点必须跟着它，
        // 否则会把「初始版本」改成功能新增号（Δ+1）
        List<SysVersionHistory> all = List.of(
                record(1, "1.0.0.00", "major"),
                record(2, "1.0.1.00", "minor"));
        when(mapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(all);

        service.renumberAll();

        assertEquals("1.0.0.00", all.get(0).getVersionNo());
        assertEquals("1.0.1.00", all.get(1).getVersionNo());
        verifyNoInteractions(jdbcTemplate);
    }

    @Test
    @DisplayName("首条现号解不出形状时回退到 1.0.0.00，不拿脏值当起点")
    void renumberFallsBackWhenFirstNumberUnparsable() {
        // 历史脏数据（带字母前缀）会让 parseVersion 静默解出全 0，写进序列就等于把 0.0.0.00 当版本号
        List<SysVersionHistory> all = List.of(
                record(1, "v1.0.0", "minor"),
                record(2, "1.0.1.00", "minor"));
        when(mapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(all);
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(2);

        service.renumberAll();

        assertEquals("1.0.0.00", all.get(0).getVersionNo());
        assertEquals("1.0.1.00", all.get(1).getVersionNo());
    }

    @Test
    @DisplayName("批量换号语句的参数与占位符同序：先全部 WHEN/THEN 对，再全部 IN 旧号")
    void remapSqlBindsArgumentsInPlaceholderOrder() {
        Map<String, String> remap = new LinkedHashMap<>();
        remap.put("1.0.101.00", "1.0.0.00");
        remap.put("1.0.102.00", "1.0.1.00");

        VersionHistoryServiceImpl.RemapStatement statement = VersionHistoryServiceImpl.buildRequirementRemapSql(remap);

        assertTrue(statement.sql().startsWith(
                "UPDATE rdm_requirement SET version_no = CASE version_no WHEN ? THEN ? WHEN ? THEN ? "), statement.sql());
        assertTrue(statement.sql().endsWith("END WHERE version_no IN (?, ?)"), statement.sql());
        // 参数个数必须等于占位符个数，否则绑定会错位把需求改到别的版本上
        assertEquals(countOccurrences(statement.sql(), "?"), statement.args().length, statement.sql());
        assertArrayEquals(new Object[]{"1.0.101.00", "1.0.0.00", "1.0.102.00", "1.0.1.00", "1.0.101.00", "1.0.102.00"},
                statement.args());
    }

    private static int countOccurrences(String text, String needle) {
        int count = 0;
        for (int i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + needle.length())) {
            count++;
        }
        return count;
    }

    @Test
    @DisplayName("重新编号结果与存量完全一致时不动需求表")
    void renumberAllSkipsMigrationWhenNothingChanged() {
        when(mapper.selectList(any(LambdaQueryWrapper.class)))
                .thenReturn(List.of(record(1, "1.0.0.00", "minor")));

        assertEquals("成功重新編號 1 條版本記錄，同步遷移 0 條需求關聯版本號", service.renumberAll());

        verifyNoInteractions(jdbcTemplate);
    }

    @Test
    @DisplayName("自动建议版本号在满 99 时进位，而不是继续累加出三位数")
    void suggestNextVersionAppliesCarry() {
        when(mapper.selectList(any(LambdaQueryWrapper.class)))
                .thenReturn(List.of(record(1, "1.0.99.00", "minor")));

        assertEquals("1.1.0.00", service.suggestNextVersion("minor"));
    }

    @Test
    @DisplayName("新增时拒绝超过 99 的段位，不落库")
    void createRejectsSegmentAboveCap() {
        VersionHistoryVO vo = new VersionHistoryVO();
        vo.setVersionNo("1.0.117.00");

        assertThrows(BusinessException.class, () -> service.create(vo, "admin"));
        verify(mapper, never()).insert(any(SysVersionHistory.class));
    }

    @Test
    @DisplayName("新增时重复版本号给出业务错误，而不是撞唯一键变 500")
    void createRejectsDuplicatedVersionNo() {
        VersionHistoryVO vo = new VersionHistoryVO();
        vo.setVersionNo("1.0.1.00");
        when(mapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(1L);

        assertThrows(BusinessException.class, () -> service.create(vo, "admin"));
        verify(mapper, never()).insert(any(SysVersionHistory.class));
    }

    @Test
    @DisplayName("编辑存量超标号但未改号时放行，只改概要等其他字段不受进位规则卡死")
    void updateKeepsLegacyOverCapNumberWhenUnchanged() {
        SysVersionHistory entity = record(1, "1.0.117.00", "minor");
        when(mapper.selectById(1L)).thenReturn(entity);
        VersionHistoryVO vo = new VersionHistoryVO();
        vo.setVersionNo("1.0.117.00");
        vo.setSummary("补充概要");

        service.update(1L, vo, "admin");

        assertEquals("补充概要", entity.getSummary());
        verify(mapper).updateById(entity);
        verify(mapper, never()).selectCount(any(LambdaQueryWrapper.class));
    }

    @Test
    @DisplayName("编辑时真的改号必须按新规则裁决")
    void updateValidatesWhenVersionNoChanged() {
        when(mapper.selectById(1L)).thenReturn(record(1, "1.0.117.00", "minor"));
        VersionHistoryVO vo = new VersionHistoryVO();
        vo.setVersionNo("1.0.200.00");

        assertThrows(BusinessException.class, () -> service.update(1L, vo, "admin"));
        verify(mapper, never()).updateById(any(SysVersionHistory.class));
    }
}
