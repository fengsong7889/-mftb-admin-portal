package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.BizSearchRelease;
import com.mftb.admin.mapper.BizSearchReleaseMapper;
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

/** 搜索配置发布服务测试：验证版本状态机（草稿→待审→批准）、版本号唯一、已批准不可删（H2 真实 Mapper）。 */
class BizSearchReleaseServiceImplTest {

    private SqlSession session;
    private BizSearchReleaseServiceImpl service;

    @BeforeEach
    void setUp() throws Exception {
        var ds = new UnpooledDataSource("org.h2.Driver",
                "jdbc:h2:mem:search_release_" + UUID.randomUUID() + ";MODE=MySQL", "sa", "");
        var cfg = new MybatisConfiguration();
        cfg.setMapUnderscoreToCamelCase(true);
        cfg.setEnvironment(new Environment("test", new JdbcTransactionFactory(), ds));
        cfg.addMapper(BizSearchReleaseMapper.class);
        session = new MybatisSqlSessionFactoryBuilder().build(cfg).openSession(true);
        try (var st = session.getConnection().createStatement()) {
            st.execute("""
                    CREATE TABLE biz_search_release (
                        id BIGINT PRIMARY KEY, version_no VARCHAR(32), change_summary VARCHAR(500), snapshot VARCHAR(2000),
                        checksum VARCHAR(64), status INT, rollback_version VARCHAR(32), approver VARCHAR(64),
                        approve_time TIMESTAMP, published_at TIMESTAMP,
                        created_by VARCHAR(64), updated_by VARCHAR(64), created_at TIMESTAMP, updated_at TIMESTAMP, deleted INT DEFAULT 0)
                    """);
        }
        OperatorResolver op = Mockito.mock(OperatorResolver.class);
        when(op.currentOperatorName()).thenReturn("測試員(001)");
        service = new BizSearchReleaseServiceImpl(session.getMapper(BizSearchReleaseMapper.class), op);
    }

    @AfterEach
    void tearDown() {
        if (session != null) session.close();
    }

    private BizSearchRelease release(String version) {
        BizSearchRelease r = new BizSearchRelease();
        r.setVersionNo(version);
        r.setChangeSummary("外賣相關性基準");
        r.setRollbackVersion("DEMO-0.9");
        return r;
    }

    @Test
    void draftSubmitApproveTransitions() {
        long id = service.createDraft(release("DEMO-1.0"));
        assertEquals(0, session.getMapper(BizSearchReleaseMapper.class).selectById(id).getStatus());
        service.submitForReview(id);
        service.approve(id, "主管(002)");
        assertEquals(2, session.getMapper(BizSearchReleaseMapper.class).selectById(id).getStatus());
    }

    @Test
    void rejectsDuplicateVersion() {
        service.createDraft(release("DEMO-1.0"));
        assertThrows(BusinessException.class, () -> service.createDraft(release("DEMO-1.0")));
    }

    @Test
    void rejectsApproveDraftDirectly() {
        long id = service.createDraft(release("DEMO-1.1"));
        assertThrows(BusinessException.class, () -> service.approve(id, "主管(002)"));
    }

    @Test
    void rejectsDeleteApproved() {
        long id = service.createDraft(release("DEMO-1.2"));
        service.submitForReview(id);
        service.approve(id, "主管(002)");
        assertThrows(BusinessException.class, () -> service.delete(id));
    }
}
