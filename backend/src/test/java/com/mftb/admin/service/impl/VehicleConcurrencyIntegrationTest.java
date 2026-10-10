package com.mftb.admin.service.impl;

import com.mftb.admin.constant.VehicleConstants;
import com.mftb.admin.dto.VehicleUseDto;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.VehicleUseService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.IntFunction;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 用车并发与数据库兜底验收（真实 MySQL）。
 *
 * <p>为什么必须有这一类测试：{@code ConcurrentSecurityTest} 自己就注明
 * "数据库层面的并发安全需 @SpringBootTest + 真实数据库验证"，而 Mockito 单测里
 * Mapper 是假的——它永远无法证明 SELECT ... FOR UPDATE、生成列唯一键、
 * 版本化 UPDATE 在 MySQL 8 上真的挡住了双写。这几条正是"同一辆车同一时段不会
 * 被派给两个人"这一台账问责性的地基。
 *
 * <p>仅在注入了 DB_URL 时运行（CI 无数据库时跳过），并且测试数据用唯一标记录入、
 * 结束后物理清理：开发库是共享的，脏数据会污染别人的评审。
 *
 * <p>直接调 Service 而不是走 HTTP：本测试要验的是锁与约束，不是鉴权切面；
 * 用 SecurityContext 注入真实操作人即可，同时避开需要登录口令的环节
 * （不得为测试伪造或索取凭据）。
 */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "DB_URL", matches = ".+",
        disabledReason = "需要真实 MySQL；CI 无库时跳过，避免把网络数据库依赖塞进流水线")
class VehicleConcurrencyIntegrationTest {

    /** 一条足够靠后的有效期，保证资格校验只受"是否核验"影响，不受今天日期影响 */
    private static final LocalDate FAR_FUTURE = LocalDate.now().plusYears(2);

    @Autowired
    private VehicleUseService vehicleUseService;
    @Autowired
    private com.mftb.admin.mapper.VehicleTripMapper tripMapper;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private SysUserMapper sysUserMapper;

    private Long operatorId;
    private Long vehicleId;
    private Long deptId;
    private String plateMarker;

    @BeforeEach
    void seedFixture() {
        SysUser admin = sysUserMapper.selectById(1L);
        assertNotNull(admin, "开发库缺少 id=1 管理员，无法构造操作人");
        operatorId = admin.getId();
        deptId = admin.getDepartmentId() == null ? 5L : admin.getDepartmentId().longValue();
        plateMarker = "TP" + System.currentTimeMillis() % 100000000L;

        String deptName = jdbc.queryForObject(
                "SELECT name FROM sys_department WHERE id = ?", String.class, deptId);
        jdbc.update("INSERT INTO biz_vehicle (vehicle_code, plate_no, register_region, vehicle_type, "
                        + "seat_count, current_odometer, status, allow_direct_register, insurance_valid_until, "
                        + "inspection_valid_until, manage_dept_id, manage_dept_name, company_brand, version, "
                        + "created_by, deleted) "
                        + "VALUES (?, ?, '澳門', '廂型車', 7, 1000, ?, 1, ?, ?, ?, ?, 1, 0, 'test', 0)",
                "VC" + plateMarker, plateMarker, VehicleConstants.VEHICLE_NORMAL,
                // 两个有效期都必须给：vehicleBlockers 对“未录入”按不可派处理（fail-closed），
                // 夹具不填就会永远进不到冲突判定那一层
                FAR_FUTURE, FAR_FUTURE, deptId, deptName);
        vehicleId = jdbc.queryForObject(
                "SELECT id FROM biz_vehicle WHERE plate_no = ? AND deleted = 0", Long.class, plateMarker);
        assertNotNull(vehicleId);
        asUser();

        // 部门授权是 fail-closed：没有显式行就一律不可派，所以夹具必须自己种这一行
        jdbc.update("INSERT INTO biz_vehicle_use_department (vehicle_id, dept_id, dept_name, created_by, deleted) "
                        + "VALUES (?, ?, ?, 'test', 0)", vehicleId, deptId, deptName);
        jdbc.update("INSERT INTO biz_vehicle_manager (vehicle_id, user_id, emp_no, emp_name, level, created_by, deleted) "
                        + "VALUES (?, ?, ?, ?, 'manage', 'test', 0)",
                vehicleId, operatorId, admin.getEmpId(), admin.getName());
        jdbc.update("INSERT INTO biz_vehicle_driver_qualification (user_id, emp_no, emp_name, region, "
                        + "license_class, valid_until, result, verified_by, deleted) "
                        + "VALUES (?, ?, ?, '澳門', 'C1', ?, ?, 'test', 0)",
                operatorId, admin.getEmpId(), admin.getName(), FAR_FUTURE, VehicleConstants.QUAL_VERIFIED);
    }

    @AfterEach
    void removeFixture() {
        // 顺序重要：先删子单据与事件，再删车辆与授权，避免留下挂空引用
        jdbc.update("DELETE FROM biz_vehicle_use_event WHERE use_id IN "
                + "(SELECT id FROM biz_vehicle_use WHERE final_vehicle_id = ?)", vehicleId);
        jdbc.update("DELETE FROM biz_vehicle_trip WHERE use_id IN "
                + "(SELECT id FROM biz_vehicle_use WHERE final_vehicle_id = ?)", vehicleId);
        jdbc.update("DELETE FROM biz_vehicle_use WHERE final_vehicle_id = ?", vehicleId);
        jdbc.update("DELETE FROM biz_vehicle_use_department WHERE vehicle_id = ?", vehicleId);
        jdbc.update("DELETE FROM biz_vehicle_manager WHERE vehicle_id = ?", vehicleId);
        jdbc.update("DELETE FROM biz_vehicle_driver_qualification WHERE user_id = ?", operatorId);
        jdbc.update("DELETE FROM biz_vehicle WHERE id = ?", vehicleId);
        SecurityContextHolder.clearContext();
    }

    /* ==================== 1. 同车同窗口并发登记：只允许一条 ==================== */

    @Test
    @DisplayName("同一辆车同一时段并发直接登记：只有一个成功，库里只留一条")
    void concurrentDirectRegisterSameWindowOnlyOneWins() throws Exception {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        LocalDateTime end = start.plusHours(3);

        List<String> results = runConcurrently(2, index -> {
            asUser();
            try {
                vehicleUseService.directRegister(directDto(start, end, "vk-conflict-" + index));
                return "OK";
            } catch (RuntimeException e) {
                return "FAIL:" + e.getMessage();
            } finally {
                SecurityContextHolder.clearContext();
            }
        });

        long ok = results.stream().filter("OK"::equals).count();
        assertEquals(1, ok, "并发同窗口登记必须只有一个成功，实际结果=" + results);
        int rows = jdbc.queryForObject(
                "SELECT COUNT(*) FROM biz_vehicle_use WHERE final_vehicle_id = ? AND deleted = 0",
                Integer.class, vehicleId);
        assertEquals(1, rows, "失败的那条不得留下半成品单据");
        assertTrue(results.stream().anyMatch(r -> r.contains("已") || r.contains("衝突") || r.contains("冲突")),
                "冲突提示要能说明原因，实际=" + results);
    }

    /* ==================== 2. 幂等键并发重放：不产生第二条事实 ==================== */

    @Test
    @DisplayName("同一 requestKey 并发重放：只建一张单，两次返回同一 ID")
    void sameRequestKeyUnderConcurrencyIsIdempotent() throws Exception {
        LocalDateTime start = LocalDateTime.now().plusDays(2).withNano(0);
        LocalDateTime end = start.plusHours(2);
        String sharedKey = "vk-idem-" + System.currentTimeMillis();

        List<String> results = runConcurrently(2, index -> {
            asUser();
            try {
                return "OK:" + vehicleUseService.directRegister(directDto(start, end, sharedKey));
            } catch (RuntimeException e) {
                return "FAIL:" + e.getMessage();
            } finally {
                SecurityContextHolder.clearContext();
            }
        });

        List<String> successes = results.stream().filter(r -> r.startsWith("OK:")).toList();
        // 两条请求可能都成功（幂等返回同一单）或一条被锁挡下重试；关键是不许长出第二张单
        assertTrue(successes.size() >= 1, "幂等重放至少要有一条成功，实际=" + results);
        long distinctIds = successes.stream().map(s -> s.substring(3)).distinct().count();
        assertEquals(1, distinctIds, "同一 requestKey 必须回到同一张单，实际=" + results);
        int rows = jdbc.queryForObject(
                "SELECT COUNT(*) FROM biz_vehicle_use WHERE final_vehicle_id = ? AND deleted = 0",
                Integer.class, vehicleId);
        assertEquals(1, rows, "重复提交不得增加台账条目，实际=" + rows);
    }

    /* ==================== 3. 并发出车：状态机 + 版本只放行一个 ==================== */

    @Test
    @DisplayName("同一单据并发出车：只有一个成功，且只有一条行程")
    void concurrentDepartOnlyOneWins() throws Exception {
        LocalDateTime start = LocalDateTime.now().plusDays(3).withNano(0);
        long useId = vehicleUseService.directRegister(directDto(start, start.plusHours(2), "vk-depart-" + start));

        List<String> results = runConcurrently(2, index -> {
            asUser();
            try {
                VehicleUseDto.Depart depart = new VehicleUseDto.Depart();
                depart.setUseId(useId);
                depart.setDepartAt(start);
                depart.setStartOdometer(new java.math.BigDecimal("1000"));
                depart.setKeyReceived(true);
                depart.setConditionOk(true);
                depart.setRequestKey("vk-depart-act-" + index);
                vehicleUseService.depart(depart);
                return "OK";
            } catch (RuntimeException e) {
                return "FAIL:" + e.getMessage();
            } finally {
                SecurityContextHolder.clearContext();
            }
        });

        assertEquals(1, results.stream().filter("OK"::equals).count(),
                "并发出车必须只有一个成功，实际=" + results);
        int trips = jdbc.queryForObject(
                "SELECT COUNT(*) FROM biz_vehicle_trip WHERE use_id = ?", Integer.class, useId);
        assertEquals(1, trips, "一次出车只能有一条行程事实");
        String status = jdbc.queryForObject(
                "SELECT status FROM biz_vehicle_use WHERE id = ?", String.class, useId);
        assertEquals(VehicleConstants.STATUS_IN_USE, status, "胜出者应把单据推进到行車中");
    }

    /* ==================== 4. 数据库兜底：不依赖应用层检查 ==================== */

    /**
     * 绕过服务层，直接复制已有单据插入第二条完全相同窗口的活动预约。
     *
     * <p>这一步是整套防护里最值得单独证明的：如果只有 Java 里的窗口重叠判断，
     * 那么任何绕过应用的写入（脚本修数据、将来新增的导入功能、代码 bug）都会
     * 静默造出"同一辆车同一时段两个有效预约"。生成列唯一键是最后一道墙，
     * 而"墙存在"和"墙有效"是两件事，必须实测。
     */
    @Test
    @DisplayName("生成列唯一键兜底：绕过应用层也插不进重复活动预约")
    void generatedColumnUniqueKeyRejectsDuplicateReservation() {
        LocalDateTime start = LocalDateTime.now().plusDays(4).withNano(0);
        long useId = vehicleUseService.directRegister(directDto(start, start.plusHours(2), "vk-ddl-" + start));

        // MySQL 8 的普通列在 information_schema.columns 里 GENERATION_EXPRESSION 是**空串而不是 NULL**
        // （实测 43 列：IS NULL 命中 0，= '' 命中 41），所以必须两个分条件都写，否则这里会拿到空清单。
        List<String> cols = jdbc.queryForList(
                "SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() "
                        + "AND table_name = 'biz_vehicle_use' "
                        + "AND (generation_expression IS NULL OR generation_expression = '') "
                        + "AND column_name <> 'id' ORDER BY ordinal_position", String.class);
        assertTrue(cols.size() > 10, "列清单异常，疑似 information_schema 查询未命中");

        String columns = cols.stream().map(c -> "`" + c + "`").collect(Collectors.joining(", "));
        String values = cols.stream()
                .map(c -> switch (c) {
                    // 单号必须换新值，否则先撞 uk_vehicle_use_no，测不到目标唯一键
                    case "use_no" -> "'DUP" + System.currentTimeMillis() + "'";
                    // 幂等键也要换，否则先撞 applicant_id + request_key
                    case "request_key" -> "'vk-ddl-copy-" + System.currentTimeMillis() + "'";
                    default -> "`" + c + "`";
                })
                .collect(Collectors.joining(", "));

        DataAccessException ex = assertThrows(DataAccessException.class, () -> jdbc.update(
                "INSERT INTO biz_vehicle_use (" + columns + ") SELECT " + values
                        + " FROM biz_vehicle_use WHERE id = ?", useId));
        String chain = throwableChain(ex);
        assertTrue(chain.contains("uk_vehicle_use_reservation") || chain.contains("Duplicate entry"),
                "应被活动预约唯一键拒绝，实际=" + chain);
    }

    /* ==================== 5. 台账统计口径（补录不得混入有效行車次數） ==================== */

    /**
     * 端到端测试发现 ledgerStats 的 WHERE 少了 status 过滤，导致“待核對”行程被算进
     * 「有效行車次數/累計里程」，而页面却写着“未計入”——注释与前端提示都对，SQL 不对。
     *
     * <p>这类口径缺陷 Mockito 测不到（SQL 是被 mock 的），只能在真实 MySQL 上验证，
     * 所以放在本集成测试里把它钉住。
     */
    @Test
    @DisplayName("台账统计只算已确认行程，待核对单列 pendingCount")
    void ledgerStatsCountsOnlyConfirmedTrips() {
        LocalDateTime dayA = LocalDateTime.now().plusDays(6).withNano(0);
        long confirmedId = vehicleUseService.directRegister(directDto(dayA, dayA.plusHours(2), "vk-stat-a"));
        depart(confirmedId, dayA, "1000");
        vehicleUseService.ret(returnDto(confirmedId, dayA.plusHours(2), "1350"));
        VehicleUseDto.Confirm confirm = new VehicleUseDto.Confirm();
        confirm.setUseId(confirmedId);
        confirm.setReason("無誤");
        confirm.setRequestKey("vk-stat-a-confirm");
        asUser();
        vehicleUseService.confirm(confirm);

        // 第二张只走到待出车：它的行程永远不是 confirmed，不得混进有效统计
        LocalDateTime dayB = dayA.plusDays(1);
        vehicleUseService.directRegister(directDto(dayB, dayB.plusHours(2), "vk-stat-b"));

        java.util.Map<String, Object> stats = tripMapper.ledgerStats(
                null, null, vehicleId, null, null, null, null);
        org.assertj.core.api.Assertions.assertThat(((Number) stats.get("tripCount")).longValue())
                .as("只有已确认行程可计入有效行車次數，实际 stats=" + stats).isEqualTo(1L);
        org.assertj.core.api.Assertions.assertThat(((Number) stats.get("pendingCount")).longValue())
                .as("待核對/争议单单独计数，不影响 tripCount").isZero();
        org.assertj.core.api.Assertions.assertThat(new java.math.BigDecimal(stats.get("totalMileage").toString()))
                .as("累计里程只累已确认行程（1350-1000=350），实际=" + stats.get("totalMileage"))
                .isEqualByComparingTo("350");
    }

    private void depart(long useId, LocalDateTime at, String odometer) {
        asUser();
        VehicleUseDto.Depart d = new VehicleUseDto.Depart();
        d.setUseId(useId);
        d.setDepartAt(at);
        d.setStartOdometer(new java.math.BigDecimal(odometer));
        d.setKeyReceived(true);
        d.setConditionOk(true);
        d.setRequestKey("vk-stat-depart-" + useId);
        vehicleUseService.depart(d);
    }

    private VehicleUseDto.Return returnDto(long useId, LocalDateTime at, String odometer) {
        VehicleUseDto.Return r = new VehicleUseDto.Return();
        r.setUseId(useId);
        r.setReturnAt(at);
        r.setEndOdometer(new java.math.BigDecimal(odometer));
        r.setReturnPlace("公司車位");
        r.setKeyReturned(true);
        r.setVehicleCondition("normal");
        r.setRequestKey("vk-stat-return-" + useId);
        return r;
    }

    /* ==================== 辅助 ==================== */

    private VehicleUseDto.DirectRegister directDto(LocalDateTime start, LocalDateTime end, String requestKey) {
        SysUser admin = sysUserMapper.selectById(operatorId);
        VehicleUseDto.DirectRegister dto = new VehicleUseDto.DirectRegister();
        dto.setVehicleId(vehicleId);
        dto.setDriverId(operatorId);
        dto.setDepartmentId(deptId);
        dto.setActualUserName(admin.getName());
        dto.setPurpose("並發驗收");
        dto.setOrigin("公司");
        dto.setDestination("客戶端");
        dto.setPlannedStart(start);
        dto.setPlannedEnd(end);
        dto.setPassengerCount(2);
        dto.setDirectReason("並發驗收測試數據");
        dto.setStartOdometer(new java.math.BigDecimal("1000"));
        dto.setRequestKey(requestKey);
        return dto;
    }

    /** 与 VehicleAccessGuard.currentUser() 的取值方式一致：details 里放 SysUser */
    private void asUser() {
        SysUser admin = sysUserMapper.selectById(operatorId);
        assertNotNull(admin, "开发库缺少操作人记录");
        var auth = new UsernamePasswordAuthenticationToken(
                admin.getUsername(), null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        auth.setDetails(admin);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    /**
     * 尽量让 N 个任务同时起跑（栅栏对齐），否则"并发"会退化成顺序执行而测不出锁。
     */
    private List<String> runConcurrently(int n, IntFunction<String> task) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(n);
        CountDownLatch ready = new CountDownLatch(n);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<String>> futures = new ArrayList<>();
        try {
            for (int i = 0; i < n; i++) {
                final int index = i;
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    go.await(30, TimeUnit.SECONDS);
                    return task.apply(index);
                }));
            }
            ready.await(30, TimeUnit.SECONDS);
            go.countDown();
            List<String> out = new ArrayList<>();
            for (Future<String> f : futures) {
                out.add(f.get(60, TimeUnit.SECONDS));
            }
            return out;
        } finally {
            pool.shutdownNow();
        }
    }

    private static String throwableChain(Throwable e) {
        StringBuilder sb = new StringBuilder();
        for (Throwable t = e; t != null; t = t.getCause()) {
            sb.append(t.getClass().getSimpleName()).append(": ").append(t.getMessage()).append(' ');
        }
        return sb.toString();
    }
}
