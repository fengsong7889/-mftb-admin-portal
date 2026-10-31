package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.BizSearchIntervention;
import com.mftb.admin.mapper.BizSearchInterventionMapper;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

/** 搜索商家干预服务测试：验证乘数区间、有效期上限、原因必填与审批（H2 真实 Mapper）。 */
class BizSearchInterventionServiceImplTest {

    private SqlSession session;
    private BizSearchInterventionServiceImpl service;

    @BeforeEach
    void setUp() throws Exception {
        var ds = new UnpooledDataSource("org.h2.Driver",
                "jdbc:h2:mem:search_intervention_" + UUID.randomUUID() + ";MODE=MySQL", "sa", "");
        var cfg = new MybatisConfiguration();
        cfg.setMapUnderscoreToCamelCase(true);
        cfg.setEnvironment(new Environment("test", new JdbcTransactionFactory(), ds));
        cfg.addMapper(BizSearchInterventionMapper.class);
        session = new MybatisSqlSessionFactoryBuilder().build(cfg).openSession(true);
        try (var st = session.getConnection().createStatement()) {
            st.execute("""
                    CREATE TABLE biz_search_intervention (
                        id BIGINT PRIMARY KEY, rule_no VARCHAR(32), rule_name VARCHAR(60), target_type INT, target_id VARCHAR(64), target_name VARCHAR(128),
                        action_type INT, scope_terms VARCHAR(255), exact_terms VARCHAR(255), multiplier DECIMAL(5,2),
                        region_code VARCHAR(32), surface INT, biz_channel INT, reason VARCHAR(255), start_date DATE, end_date DATE,
                        approval_status INT, approver VARCHAR(64), status INT,
                        created_by VARCHAR(64), updated_by VARCHAR(64), created_at TIMESTAMP, updated_at TIMESTAMP, deleted INT DEFAULT 0)
                    """);
        }
        OperatorResolver op = Mockito.mock(OperatorResolver.class);
        when(op.currentOperatorName()).thenReturn("測試員(001)");
        service = new BizSearchInterventionServiceImpl(session.getMapper(BizSearchInterventionMapper.class), op);
    }

    @AfterEach
    void tearDown() {
        if (session != null) session.close();
    }

    private BizSearchIntervention rule(int action, BigDecimal multiplier, int days) {
        BizSearchIntervention r = new BizSearchIntervention();
        r.setRuleName("示例干预规则");
        r.setTargetType(1);
        r.setTargetId("M10001");
        r.setActionType(action);
        r.setMultiplier(multiplier);
        r.setReason("流量集中度觀察實驗");
        r.setStartDate(LocalDate.of(2026, 11, 1));
        r.setEndDate(LocalDate.of(2026, 11, 1).plusDays(days - 1));
        return r;
    }

    @Test
    void validDemotePersists() {
        assertTrue(service.create(rule(1, new BigDecimal("0.80"), 7)) > 0);
    }

    @Test
    void rejectsDemoteMultiplierAboveOne() {
        assertThrows(BusinessException.class, () -> service.create(rule(1, new BigDecimal("1.10"), 7)));
    }

    @Test
    void rejectsDemoteLongerThan7Days() {
        assertThrows(BusinessException.class, () -> service.create(rule(1, new BigDecimal("0.80"), 10)));
    }

    @Test
    void rejectsExactAdmissionWithMultiplier() {
        assertThrows(BusinessException.class, () -> service.create(rule(2, new BigDecimal("0.90"), 14)));
    }

    @Test
    void rejectsMissingReason() {
        BizSearchIntervention r = rule(1, new BigDecimal("0.80"), 7);
        r.setReason("  ");
        assertThrows(BusinessException.class, () -> service.create(r));
    }

    @Test
    void approveTransitionsState() {
        long id = service.create(rule(1, new BigDecimal("0.80"), 7));
        service.approve(id, true, "主管(002)");
        assertEquals(2, session.getMapper(BizSearchInterventionMapper.class).selectById(id).getApprovalStatus());
    }
}
