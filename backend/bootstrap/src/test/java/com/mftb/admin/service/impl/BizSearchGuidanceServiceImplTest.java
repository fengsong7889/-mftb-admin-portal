package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.BizSearchGuidance;
import com.mftb.admin.mapper.BizSearchGuidanceMapper;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

/**
 * 搜索引导配置服务测试：H2(MODE=MySQL) + 真实 Mapper，验证后端安全校验边界与逻辑删除，
 * 不连接业务数据库（方案 §14.3 后端测试；§ security 后端重验前端字段）。
 */
class BizSearchGuidanceServiceImplTest {

    private SqlSession session;
    private BizSearchGuidanceServiceImpl service;

    @BeforeEach
    void setUp() throws Exception {
        var dataSource = new UnpooledDataSource("org.h2.Driver",
                "jdbc:h2:mem:search_guidance_" + UUID.randomUUID() + ";MODE=MySQL", "sa", "");
        var configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setEnvironment(new Environment("test", new JdbcTransactionFactory(), dataSource));
        configuration.addMapper(BizSearchGuidanceMapper.class);
        session = new MybatisSqlSessionFactoryBuilder().build(configuration).openSession(true);
        try (var statement = session.getConnection().createStatement()) {
            statement.execute("""
                    CREATE TABLE biz_search_guidance (
                        id BIGINT PRIMARY KEY, config_no VARCHAR(32), config_name VARCHAR(60), word_type INT, display_text VARCHAR(64),
                        target_query VARCHAR(64), brand VARCHAR(32), surface INT, biz_channel INT,
                        region_code VARCHAR(32), priority INT, source INT, start_date DATE, end_date DATE,
                        approval_status INT, status INT, remark VARCHAR(255), created_by VARCHAR(64),
                        updated_by VARCHAR(64), created_at TIMESTAMP, updated_at TIMESTAMP, deleted INT DEFAULT 0)
                    """);
        }
        OperatorResolver operatorResolver = Mockito.mock(OperatorResolver.class);
        when(operatorResolver.currentOperatorName()).thenReturn("測試員(001)");
        service = new BizSearchGuidanceServiceImpl(session.getMapper(BizSearchGuidanceMapper.class), operatorResolver);
    }

    @AfterEach
    void tearDown() {
        if (session != null) session.close();
    }

    private BizSearchGuidance valid() {
        BizSearchGuidance g = new BizSearchGuidance();
        g.setConfigName("午餐底紋詞示例");
        g.setWordType(1);
        g.setDisplayText("午餐想吃什麼");
        g.setTargetQuery("午餐");
        g.setBrand("flashBee");
        g.setSurface(2);
        g.setBizChannel(1);
        g.setPriority(1);
        g.setSource(1);
        g.setStartDate(LocalDate.of(2026, 11, 1));
        g.setEndDate(LocalDate.of(2026, 11, 7));
        return g;
    }

    @Test
    void createValidPersistsAndAutoGeneratesConfigNo() {
        long id = service.create(valid());
        assertTrue(id > 0);
        BizSearchGuidance saved = session.getMapper(BizSearchGuidanceMapper.class).selectById(id);
        assertNotNull(saved);
        assertNotNull(saved.getConfigNo());
        assertTrue(saved.getConfigNo().startsWith("SG"));
        assertEquals("測試員(001)", saved.getCreatedBy());
        assertEquals(1, saved.getStatus());
        assertEquals(1, saved.getApprovalStatus());
    }

    @Test
    void rejectsInvalidInputs() {
        BizSearchGuidance blank = valid();
        blank.setDisplayText("  ");
        assertThrows(BusinessException.class, () -> service.create(blank));

        BizSearchGuidance badType = valid();
        badType.setWordType(9);
        assertThrows(BusinessException.class, () -> service.create(badType));

        BizSearchGuidance badPriority = valid();
        badPriority.setPriority(21);
        assertThrows(BusinessException.class, () -> service.create(badPriority));

        BizSearchGuidance badDates = valid();
        badDates.setEndDate(LocalDate.of(2026, 10, 1)); // 早于 start
        assertThrows(BusinessException.class, () -> service.create(badDates));

        BizSearchGuidance hotAd = valid();
        hotAd.setWordType(4);
        hotAd.setSource(3);
        assertThrows(BusinessException.class, () -> service.create(hotAd));
    }

    @Test
    void updateStatusRejectsIllegalValue() {
        long id = service.create(valid());
        assertThrows(BusinessException.class, () -> service.updateStatus(id, 7));
        service.updateStatus(id, 2);
        assertEquals(2, session.getMapper(BizSearchGuidanceMapper.class).selectById(id).getStatus());
    }

    @Test
    void logicalDeleteExcludesFromList() {
        long id = service.create(valid());
        assertEquals(1, service.list(1, "flashBee", 2, 1).size());
        service.delete(id);
        List<BizSearchGuidance> after = service.list(1, "flashBee", 2, 1);
        assertTrue(after.stream().noneMatch(g -> g.getId().equals(id)), "逻辑删除后列表不应含该记录");
    }
}
