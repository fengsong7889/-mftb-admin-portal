package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.mapper.SysDepartmentMapper;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** 使用独立内存库验证真实 Mapper 查询，确保逻辑删除过滤生效，不连接业务数据库。 */
class DepartmentServiceImplTest {
    private SqlSession session;
    private DepartmentServiceImpl service;

    @BeforeEach
    void setUp() throws Exception {
        var dataSource = new UnpooledDataSource("org.h2.Driver",
                "jdbc:h2:mem:department_" + UUID.randomUUID() + ";MODE=MySQL", "sa", "");
        var configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setEnvironment(new Environment("test", new JdbcTransactionFactory(), dataSource));
        configuration.addMapper(SysDepartmentMapper.class);
        session = new MybatisSqlSessionFactoryBuilder().build(configuration).openSession(true);
        try (var statement = session.getConnection().createStatement()) {
            statement.execute("""
                    CREATE TABLE sys_department (
                        id BIGINT PRIMARY KEY, code VARCHAR(50), name VARCHAR(100), name_en VARCHAR(100),
                        parent_id BIGINT, leader VARCHAR(100), permissions VARCHAR(100), status INT,
                        sort INT, updated_by VARCHAR(100), deleted INT DEFAULT 0,
                        created_at TIMESTAMP, updated_at TIMESTAMP)
                    """);
            statement.execute("""
                    INSERT INTO sys_department (id, name, status, deleted) VALUES
                    (1, '用戶運營部', 1, 0), (2, '停用部門', 0, 0), (3, '已刪除部門', 1, 1),
                    (4, '同名部門', 1, 0), (5, '同名部門', 1, 0),
                    (6, '用戶運營部', 1, 1), (7, '狀態缺失部門', NULL, 0)
                    """);
        }
        service = new DepartmentServiceImpl(session.getMapper(SysDepartmentMapper.class),
                null, null, null, null, null, null, null, null);
    }

    @AfterEach
    void tearDown() {
        if (session != null) session.close();
    }

    @Test
    void acceptsEnabledDepartmentAndTrimsInput() {
        assertEquals("用戶運營部", service.requireEnabledDepartmentName("  用戶運營部  "));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" \t "})
    void rejectsBlankName(String name) {
        assertEquals("部門名稱不能為空", assertThrows(BusinessException.class,
                () -> service.requireEnabledDepartmentName(name)).getMessage());
    }

    @ParameterizedTest
    @ValueSource(strings = {"不存在部門", "已刪除部門", "用戶運營", "%' OR 1=1 --"})
    void rejectsMissingDeletedPartialOrInjectedName(String name) {
        assertTrue(assertThrows(BusinessException.class,
                () -> service.requireEnabledDepartmentName(name)).getMessage().contains("不存在或已刪除"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"停用部門", "狀態缺失部門"})
    void rejectsDisabledDepartment(String name) {
        assertTrue(assertThrows(BusinessException.class,
                () -> service.requireEnabledDepartmentName(name)).getMessage().contains("已停用"));
    }

    @Test
    void rejectsAmbiguousEnabledName() {
        assertTrue(assertThrows(BusinessException.class,
                () -> service.requireEnabledDepartmentName("同名部門")).getMessage().contains("同名部門"));
    }

    /**
     * 同名部门按名称只能拒歧义，但用户既然在树上点定了具体节点，ID 路径就必须能走通；
     * 否则资产归还等写入源对 4/5 号同名部门永远办不成。
     */
    @Test
    void idPathAcceptsDepartmentThatNamePathRejectsAsAmbiguous() {
        assertEquals("同名部門", service.requireEnabledDepartmentNameById(5L));
    }

    @Test
    void idPathReturnsCanonicalNameOfEnabledDepartment() {
        assertEquals("用戶運營部", service.requireEnabledDepartmentNameById(1L));
    }

    @Test
    void idPathRejectsMissingOrLogicallyDeletedDepartment() {
        assertTrue(assertThrows(BusinessException.class,
                () -> service.requireEnabledDepartmentNameById(999L)).getMessage().contains("部門不存在"));
        // 3 号为逻辑删除行：MyBatis-Plus @TableLogic 应把它过滤掉，不能当成可用部门
        assertTrue(assertThrows(BusinessException.class,
                () -> service.requireEnabledDepartmentNameById(3L)).getMessage().contains("部門不存在"));
    }

    @ParameterizedTest
    @ValueSource(longs = {2L, 7L})
    void idPathRejectsDisabledDepartment(Long id) {
        assertTrue(assertThrows(BusinessException.class,
                () -> service.requireEnabledDepartmentNameById(id)).getMessage().contains("已停用"));
    }

    @Test
    void idPathRejectsNullId() {
        assertThrows(BusinessException.class, () -> service.requireEnabledDepartmentNameById(null));
    }
}
