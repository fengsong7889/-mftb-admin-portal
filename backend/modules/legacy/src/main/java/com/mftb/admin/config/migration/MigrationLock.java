package com.mftb.admin.config.migration;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

/**
 * 迁移命名锁：基于 MySQL {@code GET_LOCK}/{@code RELEASE_LOCK}，在独占连接上持有，
 * 保证多副本同时启动时初始化/自愈 DDL 串行执行，避免并发建表/补列相互踩踏。
 * <p>
 * 关键约束：加锁与释放必须在<b>同一连接</b>上完成（GET_LOCK 是连接级），
 * 因此这里显式从 DataSource 借出一条物理连接贯穿整个临界区，禁止走连接池随机连接。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MigrationLock {

    private final DataSource dataSource;

    /**
     * 在持有命名锁的前提下执行 task。获取锁超时或执行中连接异常均抛出，交由上层阻断。
     *
     * @param lockName       锁名（建议按库隔离，如 mftb:migration:{schema}）
     * @param timeoutSeconds 获取锁的等待秒数
     * @param task           临界区逻辑
     */
    public void runExclusive(String lockName, int timeoutSeconds, Runnable task) {
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(true);
            if (!acquire(conn, lockName, timeoutSeconds)) {
                throw new IllegalStateException("获取迁移命名锁超时: " + lockName
                        + "（可能有其它实例正在执行迁移）");
            }
            try {
                task.run();
            } finally {
                release(conn, lockName);
            }
        } catch (SQLException e) {
            throw new RuntimeException("迁移命名锁处理失败: " + lockName + " — " + e.getMessage(), e);
        }
    }

    private boolean acquire(Connection conn, String lockName, int timeoutSeconds) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("SELECT GET_LOCK(?, ?)")) {
            ps.setString(1, lockName);
            ps.setInt(2, timeoutSeconds);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getInt(1) == 1;
            }
        }
    }

    private void release(Connection conn, String lockName) {
        try (PreparedStatement ps = conn.prepareStatement("SELECT RELEASE_LOCK(?)")) {
            ps.setString(1, lockName);
            ps.executeQuery();
        } catch (SQLException e) {
            // 连接即将关闭，锁随连接释放，这里仅告警不抛出，避免掩盖业务异常
            log.warn("释放迁移命名锁失败（将随连接关闭自动释放）: {} — {}", lockName, e.getMessage());
        }
    }
}
