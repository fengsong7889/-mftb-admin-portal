package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.BizSearchLexicon;
import com.mftb.admin.mapper.BizSearchLexiconMapper;
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

/** 搜索词库服务测试：验证自指拒绝、实体别名须绑定实体、来源依据必填（H2 真实 Mapper）。 */
class BizSearchLexiconServiceImplTest {

    private SqlSession session;
    private BizSearchLexiconServiceImpl service;

    @BeforeEach
    void setUp() throws Exception {
        var ds = new UnpooledDataSource("org.h2.Driver",
                "jdbc:h2:mem:search_lexicon_" + UUID.randomUUID() + ";MODE=MySQL", "sa", "");
        var cfg = new MybatisConfiguration();
        cfg.setMapUnderscoreToCamelCase(true);
        cfg.setEnvironment(new Environment("test", new JdbcTransactionFactory(), ds));
        cfg.addMapper(BizSearchLexiconMapper.class);
        session = new MybatisSqlSessionFactoryBuilder().build(cfg).openSession(true);
        try (var st = session.getConnection().createStatement()) {
            st.execute("""
                    CREATE TABLE biz_search_lexicon (
                        id BIGINT PRIMARY KEY, entry_no VARCHAR(32), entry_name VARCHAR(60), word_type INT, source_term VARCHAR(64), target_term VARCHAR(64),
                        entity_id BIGINT, entity_type INT, category_id VARCHAR(32), brand VARCHAR(32), evidence VARCHAR(255), status INT,
                        created_by VARCHAR(64), updated_by VARCHAR(64), created_at TIMESTAMP, updated_at TIMESTAMP, deleted INT DEFAULT 0)
                    """);
        }
        OperatorResolver op = Mockito.mock(OperatorResolver.class);
        when(op.currentOperatorName()).thenReturn("測試員(001)");
        service = new BizSearchLexiconServiceImpl(session.getMapper(BizSearchLexiconMapper.class), op);
    }

    @AfterEach
    void tearDown() {
        if (session != null) session.close();
    }

    private BizSearchLexicon entry(int type, String src, String tgt) {
        BizSearchLexicon e = new BizSearchLexicon();
        e.setEntryName("詞條 " + src);
        e.setWordType(type);
        e.setSourceTerm(src);
        e.setTargetTerm(tgt);
        e.setEvidence("品類詞表樣例");
        return e;
    }

    @Test
    void validSynonymPersists() {
        assertTrue(service.create(entry(3, "burger", "漢堡")) > 0);
    }

    /** 名称为方案 §11.1 定版的权威业务字段：缺失必须拒绝，不得静默丢弃前端输入。 */
    @Test
    void rejectsMissingEntryName() {
        BizSearchLexicon e = entry(3, "burger", "漢堡");
        e.setEntryName("  ");
        assertThrows(BusinessException.class, () -> service.create(e));
    }

    @Test
    void rejectsSelfReference() {
        assertThrows(BusinessException.class, () -> service.create(entry(3, "漢堡", "漢堡")));
    }

    @Test
    void rejectsAliasWithoutEntity() {
        assertThrows(BusinessException.class, () -> service.create(entry(2, "星港", "示例星港漢堡集團")));
    }

    @Test
    void rejectsMissingEvidence() {
        BizSearchLexicon e = entry(3, "burger", "漢堡");
        e.setEvidence(null);
        assertThrows(BusinessException.class, () -> service.create(e));
    }
}
