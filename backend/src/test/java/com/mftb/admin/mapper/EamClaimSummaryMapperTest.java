package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 领用员工汇总查询的真实执行测试。
 *
 * <p>为什么必须单独写这个测试：汇总口径原先靠「全表拉到 Java 里分组」实现，改成一条
 * GROUP BY 聚合 SQL 后，条件求和（尤其 claimed 与 proxy_pending 的交叠）、软删排除、
 * 员工姓名为空时回退账号名这些规则全部落在动态 SQL 字符串里。
 * Mockito 单测会 mock 掉 Mapper、增量编译也只验证语法，三者都验证不了口径是否算错，
 * 而口径算错正是这次改造要解决的问题本身。
 *
 * <p>用 H2(MySQL 模式) 跑真实 Mapper，覆盖聚合与筛选语义；不替代 MySQL 方言与索引验收。
 */
class EamClaimSummaryMapperTest {

    private SqlSession session;
    private EamClaimMapper mapper;

    @BeforeEach
    void setUp() throws Exception {
        var dataSource = new UnpooledDataSource("org.h2.Driver",
                "jdbc:h2:mem:claim_summary_" + UUID.randomUUID() + ";MODE=MySQL", "sa", "");
        var configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setEnvironment(new Environment("test", new JdbcTransactionFactory(), dataSource));
        // 分页拦截器必须注册，否则 IPage 入参不会生效、total 恒为 0
        var interceptor = new MybatisPlusInterceptor();
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.H2));
        configuration.addInterceptor(interceptor);
        configuration.addMapper(EamClaimMapper.class);
        session = new MybatisSqlSessionFactoryBuilder().build(configuration).openSession(true);
        mapper = session.getMapper(EamClaimMapper.class);
        try (var statement = session.getConnection().createStatement()) {
            statement.execute("""
                    CREATE TABLE sys_user (
                        id BIGINT PRIMARY KEY, emp_id VARCHAR(32), name VARCHAR(64), username VARCHAR(64),
                        department_id BIGINT, department VARCHAR(64), deleted TINYINT NOT NULL DEFAULT 0)
                    """);
            statement.execute("""
                    CREATE TABLE biz_eam_claim (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY, claim_no VARCHAR(32) NOT NULL,
                        employee_id BIGINT NOT NULL, operator_name VARCHAR(64),
                        status VARCHAR(20) NOT NULL, signature_status VARCHAR(20) NOT NULL,
                        claim_date DATE, deleted TINYINT NOT NULL DEFAULT 0)
                    """);
            insertUser(1L, "MF00002", "冯松", "fengsong", 10L, "外卖到家事业部");
            // 姓名为空：验证回退到 username
            insertUser(2L, "MF00006", "", "guyue", 20L, "TB技术中心");
            // 软删员工：其领用记录不得出现在汇总里
            insertUser(3L, "MF00009", "已离职", "leaved", 10L, "外卖到家事业部", 1);
            // 1 号员工：在用 2（其中 1 条代办未签）、已归还 1、待签 1、软删 1
            insertClaim("LY001", 1L, "经办甲", "claimed", "signed", "2026-09-01");
            insertClaim("LY002", 1L, "经办甲", "claimed", "proxy_pending", "2026-09-22");
            insertClaim("LY003", 1L, "经办甲", "returned", "signed", "2026-08-05");
            insertClaim("LY004", 1L, "经办甲", "pending_signature", "pending", "2026-09-10");
            insertClaim("LY005", 1L, "经办甲", "claimed", "signed", "2026-09-30", 1);
            // 2 号员工：在用 1
            insertClaim("LY006", 2L, "经办乙", "claimed", "signed", "2026-09-21");
            // 3 号（软删员工）：在用 1 —— 必须被 join 排除
            insertClaim("LY007", 3L, "经办丙", "claimed", "signed", "2026-09-25");
        }
    }

    @AfterEach
    void tearDown() {
        if (session != null) session.close();
    }

    private void insertUser(long id, String empNo, String name, String username,
                            long deptId, String dept) throws Exception {
        insertUser(id, empNo, name, username, deptId, dept, 0);
    }

    private void insertUser(long id, String empNo, String name, String username,
                            long deptId, String dept, int deleted) throws Exception {
        try (var ps = session.getConnection().prepareStatement(
                "INSERT INTO sys_user (id, emp_id, name, username, department_id, department, deleted) "
                        + "VALUES (?,?,?,?,?,?,?)")) {
            ps.setLong(1, id);
            ps.setString(2, empNo);
            ps.setString(3, name);
            ps.setString(4, username);
            ps.setLong(5, deptId);
            ps.setString(6, dept);
            ps.setInt(7, deleted);
            ps.executeUpdate();
        }
    }

    private void insertClaim(String claimNo, long employeeId, String operatorName, String status,
                             String signatureStatus, String claimDate) throws Exception {
        insertClaim(claimNo, employeeId, operatorName, status, signatureStatus, claimDate, 0);
    }

    private void insertClaim(String claimNo, long employeeId, String operatorName, String status,
                             String signatureStatus, String claimDate, int deleted) throws Exception {
        try (var ps = session.getConnection().prepareStatement(
                "INSERT INTO biz_eam_claim (claim_no, employee_id, operator_name, status, "
                        + "signature_status, claim_date, deleted) VALUES (?,?,?,?,?,?,?)")) {
            ps.setString(1, claimNo);
            ps.setLong(2, employeeId);
            ps.setString(3, operatorName);
            ps.setString(4, status);
            ps.setString(5, signatureStatus);
            ps.setDate(6, java.sql.Date.valueOf(claimDate));
            ps.setInt(7, deleted);
            ps.executeUpdate();
        }
    }

    @Test
    void 汇总按员工聚合且区分代办未签与软删() {
        var result = mapper.selectEmployeeSummaryPage(page(1, 10), null, null);
        var rows = result.getRecords();

        // 软删员工(3号)的记录被 join 排除，只剩 2 名员工
        assertEquals(2, rows.size(), "软删员工的领用不得计入汇总");
        assertEquals(2L, result.getTotal(), "分页 total 应为员工数而非领用记录数");

        var feng = rows.stream().filter(r -> r.getEmployeeId() == 1L).findFirst().orElseThrow();
        assertEquals("MF00002", feng.getEmpNo());
        assertEquals("冯松", feng.getEmpName());
        // claimed 共 2 条（LY001 已签 + LY002 代办未签），软删的 LY005 不计
        assertEquals(2L, feng.getClaimedCount().longValue(), "在用数含代办未签，与原 Java 口径一致");
        assertEquals(1L, feng.getReturnedCount().longValue());
        assertEquals(1L, feng.getPendingCount().longValue());
        assertEquals(1L, feng.getProxyPendingCount().longValue(), "代办未签单独计数，且同时计入在用");
        assertEquals("2026-09-22", feng.getLastClaimDate(), "最近领用日期取 MAX 且排除软删记录");

        var gu = rows.stream().filter(r -> r.getEmployeeId() == 2L).findFirst().orElseThrow();
        assertEquals("guyue", gu.getEmpName(), "姓名为空时必须回退到账号名，不能显示空白");
    }

    @Test
    void 部门筛选由服务层传入员工集合后生效() {
        // 服务层把「部门含子部门」解析成员工 id 集合再传进来
        var rows = mapper.selectEmployeeSummaryPage(page(1, 10), null, List.of(1L)).getRecords();
        assertEquals(1, rows.size());
        assertEquals(1L, rows.get(0).getEmployeeId().longValue());
    }

    @Test
    void 关键字命中姓名工号部门单号与经办人() {
        assertEquals(1L, mapper.selectEmployeeSummaryPage(page(1, 10), "冯松", null).getTotal(), "命中姓名");
        assertEquals(1L, mapper.selectEmployeeSummaryPage(page(1, 10), "MF00006", null).getTotal(), "命中工号");
        assertEquals(1L, mapper.selectEmployeeSummaryPage(page(1, 10), "TB技术", null).getTotal(), "命中部门");
        assertEquals(1L, mapper.selectEmployeeSummaryPage(page(1, 10), "LY006", null).getTotal(), "命中领用单号");
        assertEquals(1L, mapper.selectEmployeeSummaryPage(page(1, 10), "经办乙", null).getTotal(), "命中经办人");
        assertEquals(0L, mapper.selectEmployeeSummaryPage(page(1, 10), "不存在的关键词", null).getTotal());
    }

    @Test
    void 分页只返回一页且total为全量员工数() {
        var first = mapper.selectEmployeeSummaryPage(page(1, 1), null, null);
        assertEquals(1, first.getRecords().size(), "每页条数必须真正下推到 SQL");
        assertEquals(2L, first.getTotal(), "total 是员工总数，不受 pageSize 影响");
        assertNotNull(first.getRecords().get(0).getEmployeeId());
    }

    @Test
    void 排序按最近领用日期倒序() {
        var rows = mapper.selectEmployeeSummaryPage(page(1, 10), null, null).getRecords();
        // 1 号员工最近领用 2026-09-22，2 号 2026-09-21
        assertEquals(1L, rows.get(0).getEmployeeId().longValue(), "按 MAX(claim_date) 倒序");
        assertEquals(2L, rows.get(1).getEmployeeId().longValue());
        assertTrue(rows.get(0).getLastClaimDate().compareTo(rows.get(1).getLastClaimDate()) > 0);
    }

    private com.baomidou.mybatisplus.extension.plugins.pagination.Page<
            com.mftb.admin.dto.EamClaimEmployeeSummaryVO> page(long current, long size) {
        return new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(current, size);
    }
}
