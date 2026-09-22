package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** 隔离内存库执行真实 Mapper；覆盖成本算术，不替代 MySQL 并发及方言验收。 */
class EamConsumableStockMapperTest {
    private SqlSession session;
    private EamConsumableStockMapper mapper;

    @BeforeEach
    void setUp() throws Exception {
        var dataSource = new UnpooledDataSource("org.h2.Driver",
                "jdbc:h2:mem:consumable_stock_" + UUID.randomUUID() + ";MODE=MySQL", "sa", "");
        var configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setEnvironment(new Environment("test", new JdbcTransactionFactory(), dataSource));
        configuration.addMapper(EamConsumableStockMapper.class);
        session = new MybatisSqlSessionFactoryBuilder().build(configuration).openSession(true);
        mapper = session.getMapper(EamConsumableStockMapper.class);
        try (var statement = session.getConnection().createStatement()) {
            statement.execute("""
                    CREATE TABLE biz_eam_consumable_stock (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        item_id BIGINT NOT NULL, location_id BIGINT NOT NULL, location_name VARCHAR(100),
                        qty INT NOT NULL, locked_qty INT NOT NULL DEFAULT 0, version BIGINT NOT NULL DEFAULT 0,
                        avg_cost DECIMAL(16,6) NOT NULL DEFAULT 0, total_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
                        company_brand BIGINT, purchase_company_id BIGINT, purchase_company VARCHAR(100),
                        updated_by VARCHAR(64), created_at TIMESTAMP, updated_at TIMESTAMP,
                        UNIQUE (item_id, location_id))
                    """);
        }
    }

    @AfterEach
    void tearDown() {
        if (session != null) session.close();
    }

    private void inbound(long locationId, int qty, String amount) {
        mapper.inbound(1L, locationId, "测试仓库", qty, new BigDecimal(amount), 1L, 1L, "测试公司", "测试操作人");
    }

    private void assertStock(long locationId, int qty, String avgCost, String totalCost) {
        var stock = mapper.selectForUpdate(1L, locationId);
        assertEquals(qty, stock.getQty());
        assertEquals(0, new BigDecimal(avgCost).compareTo(stock.getAvgCost()), "均价应为实际金额除以数量");
        assertEquals(0, new BigDecimal(totalCost).compareTo(stock.getTotalCost()), "库存金额应与收发存一致");
    }

    @Test
    void firstInboundStoresUnitCostRatherThanWholeAmount() {
        inbound(1L, 10, "50.00");
        assertStock(1L, 10, "5.000000", "50.00");
    }

    @Test
    void secondInboundWeightsBothReceiptsExactlyOnce() {
        inbound(1L, 10, "50.00");
        inbound(1L, 10, "100.00");
        assertStock(1L, 20, "7.500000", "150.00");
    }

    @Test
    void inboundAfterIssueUsesRemainingQuantityAndCost() {
        inbound(1L, 10, "50.00");
        assertEquals(1, mapper.lock(1L, 1L, 4));
        assertEquals(1, mapper.deductOnIssue(1L, 1L, 4, new BigDecimal("30.00"), "测试操作人"));
        inbound(1L, 4, "40.00");
        assertStock(1L, 10, "7.000000", "70.00");
    }

    @Test
    void replenishingEmptyStockResetsAverageToNewCost() {
        inbound(1L, 10, "50.00");
        mapper.lock(1L, 1L, 10);
        mapper.deductOnIssue(1L, 1L, 10, BigDecimal.ZERO, "测试操作人");
        inbound(1L, 2, "6.00");
        assertStock(1L, 2, "3.000000", "6.00");
    }

    @Test
    void costsRemainIsolatedByWarehouse() {
        inbound(1L, 3, "20.00");
        inbound(2L, 4, "20.00");
        assertStock(1L, 3, "6.666667", "20.00");
        assertStock(2L, 4, "5.000000", "20.00");
    }

    @Test
    void mysqlAssignmentOrderCalculatesAverageBeforeMutatingItsInputs() throws Exception {
        // H2 不保证复现 MySQL 从左到右赋值语义，额外约束真实 SQL 的赋值顺序，防止重复计入本次入库。
        var method = EamConsumableStockMapper.class.getMethod("inbound", long.class, long.class, String.class,
                int.class, BigDecimal.class, Long.class, Long.class, String.class, String.class);
        String sql = String.join(" ", method.getAnnotation(org.apache.ibatis.annotations.Update.class).value());
        String update = sql.substring(sql.indexOf("ON DUPLICATE KEY UPDATE"));
        assertTrue(update.indexOf("avg_cost =") < update.indexOf("qty ="));
        assertTrue(update.indexOf("avg_cost =") < update.indexOf("total_cost ="));
    }
}
