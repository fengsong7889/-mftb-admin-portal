package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.BizSearchScenario;
import com.mftb.admin.mapper.BizSearchScenarioMapper;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

/** 搜索场景策略服务测试：验证权重合计/相关性下限/店内禁广告/首页上限（H2 真实 Mapper）。 */
class BizSearchScenarioServiceImplTest {

    private SqlSession session;
    private BizSearchScenarioServiceImpl service;

    @BeforeEach
    void setUp() throws Exception {
        var ds = new UnpooledDataSource("org.h2.Driver",
                "jdbc:h2:mem:search_scenario_" + UUID.randomUUID() + ";MODE=MySQL", "sa", "");
        var cfg = new MybatisConfiguration();
        cfg.setMapUnderscoreToCamelCase(true);
        cfg.setEnvironment(new Environment("test", new JdbcTransactionFactory(), ds));
        cfg.addMapper(BizSearchScenarioMapper.class);
        session = new MybatisSqlSessionFactoryBuilder().build(cfg).openSession(true);
        try (var st = session.getConnection().createStatement()) {
            st.execute("""
                    CREATE TABLE biz_search_scenario (
                        id BIGINT PRIMARY KEY, scenario_no VARCHAR(32), scenario_name VARCHAR(60), surface INT, biz_channel INT, object_type INT,
                        weight_relevance INT, weight_quality INT, weight_distance INT, weight_heat INT,
                        candidate_window INT, ad_limit_per_page INT, filter_rule VARCHAR(255), status INT,
                        created_by VARCHAR(64), updated_by VARCHAR(64), created_at TIMESTAMP, updated_at TIMESTAMP, deleted INT DEFAULT 0)
                    """);
        }
        OperatorResolver op = Mockito.mock(OperatorResolver.class);
        when(op.currentOperatorName()).thenReturn("測試員(001)");
        service = new BizSearchScenarioServiceImpl(session.getMapper(BizSearchScenarioMapper.class), op);
    }

    @AfterEach
    void tearDown() {
        if (session != null) session.close();
    }

    private BizSearchScenario base(int surface, int r, int q, int d, int h, int ad) {
        BizSearchScenario s = new BizSearchScenario();
        s.setScenarioName("場景基準策略");
        s.setSurface(surface);
        s.setWeightRelevance(r);
        s.setWeightQuality(q);
        s.setWeightDistance(d);
        s.setWeightHeat(h);
        s.setCandidateWindow(200);
        s.setAdLimitPerPage(ad);
        return s;
    }

    @Test
    void validChannelScenarioPersists() {
        long id = service.create(base(2, 65, 15, 15, 5, 4));
        assertTrue(id > 0);
    }

    @Test
    void rejectsWeightSumNot100() {
        assertThrows(BusinessException.class, () -> service.create(base(2, 60, 15, 15, 5, 4)));
    }

    @Test
    void rejectsRelevanceBelow60() {
        assertThrows(BusinessException.class, () -> service.create(base(2, 50, 30, 10, 10, 4)));
    }

    @Test
    void rejectsStoreAdLimitNonZero() {
        assertThrows(BusinessException.class, () -> service.create(base(3, 90, 0, 0, 10, 1)));
    }

    @Test
    void rejectsHomeAdLimitAbove2() {
        assertThrows(BusinessException.class, () -> service.create(base(1, 65, 15, 15, 5, 3)));
    }
}
