package com.mftb.admin.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.config.AttendanceMenuInitializer;
import com.mftb.admin.constant.AttendanceConstants;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.AttendanceExceptionService;
import com.mftb.admin.service.AttendanceGroupService;
import com.mftb.admin.service.AttendanceHolidayService;
import com.mftb.admin.service.AttendancePunchService;
import com.mftb.admin.service.AttendanceScheduleService;
import com.mftb.admin.service.AttendanceSettingService;
import com.mftb.admin.service.AttendanceShiftService;
import com.mftb.admin.service.AttendanceSummaryService;
import com.mftb.admin.service.AttendanceSyncService;
import com.mftb.admin.service.AttendanceWorkbenchService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 考勤假勤接口映射与权限注解守卫测试。
 *
 * <p>三件事各自解决一类静默故障：
 * <ol>
 *   <li>用 standalone MockMvc 打真实路径：路径写错或方法没映射时 HTTP 层直接 404，
 *       而不是等前端联调才发现。未登录探针证明不了这件事——JWT 过滤器在 MVC 之前
 *       就统一返回 401，存在与不存在的路径看起来一样（本模块实测过）。</li>
 *   <li>字面路径必须优先于 {@code /{id}} 模板：{@code /shifts/stats} 一旦被 {@code /shifts/{id}}
 *       吞掉，Long 转换失败会变成 400，统计卡直接空白。</li>
 *   <li>反射断言每个 handler 都带 {@code @RequirePermission}，**且 action 落在该菜单已登记的
 *       动作集内**：忘记加注解的后果是"该接口对任何登录用户敞开"；action 没登记进
 *       {@code sys_menu.actions} 的后果是"授权中心勾不到，普通角色永久 403"
 *       （2B-2b 的日报重算就踩过，超管走代码直通看不出来）。</li>
 * </ol>
 */
class AttendanceControllerMappingTest {

    private static final List<String> HANDLER_ANNOTATIONS = List.of(
            "org.springframework.web.bind.annotation.GetMapping",
            "org.springframework.web.bind.annotation.PostMapping",
            "org.springframework.web.bind.annotation.PutMapping",
            "org.springframework.web.bind.annotation.DeleteMapping");

    /** 本域全部菜单 key：注解里出现域外菜单说明复制粘贴串了域 */
    private static final Set<String> DOMAIN_MENUS = Set.of(
            AttendanceConstants.MENU_WORKBENCH, AttendanceConstants.MENU_GROUP, AttendanceConstants.MENU_SHIFT,
            AttendanceConstants.MENU_HOLIDAY, AttendanceConstants.MENU_SCHEDULE, AttendanceConstants.MENU_PUNCH,
            AttendanceConstants.MENU_EXCEPTION, AttendanceConstants.MENU_DAILY, AttendanceConstants.MENU_MONTHLY,
            AttendanceConstants.MENU_SETTING);

    private static final List<Class<?>> CONTROLLERS = List.of(
            AttendanceGroupController.class, AttendanceShiftController.class, AttendanceHolidayController.class,
            AttendanceScheduleController.class, AttendancePunchController.class, AttendanceExceptionController.class,
            AttendanceSummaryController.class, AttendanceWorkbenchController.class, AttendanceSettingController.class);

    @Test
    @DisplayName("主数据路由可映射，且 /stats 不被 /{id} 模板吞掉")
    void masterDataRoutesResolve() throws Exception {
        AttendanceShiftService shiftService = mock(AttendanceShiftService.class);
        when(shiftService.list(anyLong(), anyLong(), any(), any(), any())).thenReturn(new PageResult<>(List.of(), 0L));
        when(shiftService.stats(any(), any(), any())).thenReturn(Map.of("total", 0));
        when(shiftService.options()).thenReturn(List.of());
        MockMvc shiftMvc = MockMvcBuilders.standaloneSetup(new AttendanceShiftController(shiftService)).build();

        shiftMvc.perform(get("/api/attendance/shifts")).andExpect(status().isOk());
        // 字面路径优先于模板：被 /{id} 吞掉时会因 Long 转换失败变成 400
        shiftMvc.perform(get("/api/attendance/shifts/stats")).andExpect(status().isOk());
        shiftMvc.perform(get("/api/attendance/shifts/options")).andExpect(status().isOk());
        shiftMvc.perform(get("/api/attendance/shifts/2")).andExpect(status().isOk());

        AttendanceHolidayService holidayService = mock(AttendanceHolidayService.class);
        when(holidayService.list(anyLong(), anyLong(), any(), any(), any(), any())).thenReturn(new PageResult<>(List.of(), 0L));
        when(holidayService.stats(any(), any(), any(), any())).thenReturn(Map.of("total", 0));
        when(holidayService.listByYear(any())).thenReturn(List.of());
        MockMvc holidayMvc = MockMvcBuilders.standaloneSetup(new AttendanceHolidayController(holidayService)).build();

        holidayMvc.perform(get("/api/attendance/holidays")).andExpect(status().isOk());
        holidayMvc.perform(get("/api/attendance/holidays/stats")).andExpect(status().isOk());
        holidayMvc.perform(get("/api/attendance/holidays/year/2026")).andExpect(status().isOk());
        holidayMvc.perform(get("/api/attendance/holidays/3")).andExpect(status().isOk());

        AttendanceGroupService groupService = mock(AttendanceGroupService.class);
        when(groupService.list(anyLong(), anyLong(), any(), any(), any())).thenReturn(new PageResult<>(List.of(), 0L));
        when(groupService.stats(any(), any(), any())).thenReturn(Map.of("total", 0));
        MockMvc groupMvc = MockMvcBuilders.standaloneSetup(new AttendanceGroupController(groupService)).build();

        groupMvc.perform(get("/api/attendance/groups")).andExpect(status().isOk());
        groupMvc.perform(get("/api/attendance/groups/stats")).andExpect(status().isOk());
        groupMvc.perform(get("/api/attendance/groups/7")).andExpect(status().isOk());
        groupMvc.perform(get("/api/attendance/groups/7/members")).andExpect(status().isOk());
    }

    @Test
    @DisplayName("汇总、异常、排班、打卡、工作台、设置路由全部可映射")
    void remainingRoutesResolve() throws Exception {
        AttendanceSummaryService summaryService = mock(AttendanceSummaryService.class);
        when(summaryService.dailyPage(anyLong(), anyLong(), any(), any(), any(), any())).thenReturn(new PageResult<>(List.of(), 0L));
        when(summaryService.monthlyPage(anyLong(), anyLong(), any(), any(), any(), any(), any())).thenReturn(new PageResult<>(List.of(), 0L));
        when(summaryService.isMonthFrozen(any())).thenReturn(false);
        MockMvc summaryMvc = MockMvcBuilders.standaloneSetup(new AttendanceSummaryController(summaryService)).build();
        summaryMvc.perform(get("/api/attendance/summaries/daily")).andExpect(status().isOk());
        summaryMvc.perform(get("/api/attendance/summaries/daily/stats")).andExpect(status().isOk());
        summaryMvc.perform(get("/api/attendance/summaries/monthly")).andExpect(status().isOk());
        summaryMvc.perform(get("/api/attendance/summaries/monthly/stats")).andExpect(status().isOk());
        summaryMvc.perform(get("/api/attendance/summaries/monthly/frozen").param("month", "2026-09"))
                .andExpect(status().isOk());

        AttendanceExceptionService exceptionService = mock(AttendanceExceptionService.class);
        when(exceptionService.page(anyLong(), anyLong(), any(), any(), any(), any(), any(), any()))
                .thenReturn(new PageResult<>(List.of(), 0L));
        when(exceptionService.pendingCount(any(), any())).thenReturn(0L);
        when(exceptionService.stats(any(), any(), any(), any(), any(), any())).thenReturn(Map.of());
        when(exceptionService.leaveCandidates(any())).thenReturn(List.of());
        when(exceptionService.confirm(any(), any())).thenReturn(Map.of("affected", 1));
        MockMvc exceptionMvc = MockMvcBuilders.standaloneSetup(new AttendanceExceptionController(exceptionService)).build();
        exceptionMvc.perform(get("/api/attendance/exceptions")).andExpect(status().isOk());
        exceptionMvc.perform(get("/api/attendance/exceptions/stats")).andExpect(status().isOk());
        exceptionMvc.perform(get("/api/attendance/exceptions/pending-count")).andExpect(status().isOk());
        exceptionMvc.perform(get("/api/attendance/exceptions/5")).andExpect(status().isOk());
        exceptionMvc.perform(get("/api/attendance/exceptions/5/leave-candidates")).andExpect(status().isOk());
        // 写端点：多一段路径，一旦与 /{id} 模板冲突会在构建阶段就报错
        exceptionMvc.perform(post("/api/attendance/exceptions/confirm")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"ids\":[5],\"remark\":\"外勤\"}"))
                .andExpect(status().isOk());
        exceptionMvc.perform(post("/api/attendance/exceptions/5/reissue")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"onTime\":\"2026-10-08 09:00:00\",\"reason\":\"忘打卡\"}"))
                .andExpect(status().isOk());
        exceptionMvc.perform(post("/api/attendance/exceptions/5/deduct-leave")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"leaveId\":88}"))
                .andExpect(status().isOk());

        AttendanceScheduleService scheduleService = mock(AttendanceScheduleService.class);
        when(scheduleService.stats(any(), any())).thenReturn(Map.of());
        MockMvc scheduleMvc = MockMvcBuilders.standaloneSetup(new AttendanceScheduleController(scheduleService)).build();
        scheduleMvc.perform(get("/api/attendance/schedules/stats").param("groupId", "7")).andExpect(status().isOk());

        AttendancePunchService punchService = mock(AttendancePunchService.class);
        when(punchService.page(anyLong(), anyLong(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(new PageResult<>(List.of(), 0L));
        MockMvc punchMvc = MockMvcBuilders
                .standaloneSetup(new AttendancePunchController(punchService, mock(AttendanceSyncService.class))).build();
        punchMvc.perform(get("/api/attendance/punches")).andExpect(status().isOk());
        punchMvc.perform(get("/api/attendance/punches/stats")).andExpect(status().isOk());

        AttendanceWorkbenchService workbenchService = mock(AttendanceWorkbenchService.class);
        when(workbenchService.overview(any(), any(), any())).thenReturn(Map.of());
        MockMvc workbenchMvc = MockMvcBuilders
                .standaloneSetup(new AttendanceWorkbenchController(workbenchService)).build();
        workbenchMvc.perform(get("/api/attendance/workbench/overview")).andExpect(status().isOk());

        AttendanceSettingService settingService = mock(AttendanceSettingService.class);
        when(settingService.list()).thenReturn(List.of());
        MockMvc settingMvc = MockMvcBuilders.standaloneSetup(new AttendanceSettingController(settingService)).build();
        settingMvc.perform(get("/api/attendance/settings")).andExpect(status().isOk());
    }

    @Test
    @DisplayName("每个考勤接口都必须声明 @RequirePermission，菜单属于考勤域，动作已在 sys_menu 登记")
    void everyHandlerIsPermissionAnnotatedWithRegisteredAction() throws Exception {
        Map<String, Set<String>> declaredActions = declaredActionsByMenu();
        int checked = 0;
        for (Class<?> controller : CONTROLLERS) {
            int handlers = 0;
            for (Method method : controller.getDeclaredMethods()) {
                boolean isHandler = Arrays.stream(method.getAnnotations())
                        .anyMatch(a -> HANDLER_ANNOTATIONS.contains(a.annotationType().getName()));
                if (!isHandler) {
                    continue;
                }
                RequirePermission permission = method.getAnnotation(RequirePermission.class);
                String where = controller.getSimpleName() + "#" + method.getName();
                assertNotNull(permission, where + " 缺少 @RequirePermission，会对所有登录用户敞开");
                assertTrue(DOMAIN_MENUS.contains(permission.menu()), where + " 的主菜单不属于考勤域: " + permission.menu());
                Arrays.stream(permission.anyOf()).forEach(menu ->
                        assertTrue(DOMAIN_MENUS.contains(menu), where + " 的 anyOf 菜单不属于考勤域: " + menu));
                // 动作必须已被菜单登记，否则授权中心勾不到 → 普通角色永久 403（超管直通看不出来）
                Set<String> allowed = declaredActions.get(permission.menu());
                assertNotNull(allowed, where + " 的菜单未在 AttendanceMenuInitializer 声明: " + permission.menu());
                assertTrue(allowed.contains(permission.action()),
                        where + " 使用了未登记的动作 " + permission.action() + "，菜单 " + permission.menu()
                                + " 只登记了 " + allowed + "；普通角色将永久 403");
                checked++;
                handlers++;
            }
            // 逐个控制器卡下限：只卡总数时，某个 Controller 整体没扫到 handler 也能靠其它类凑数通过
            assertTrue(handlers >= 1, controller.getSimpleName() + " 没扫到任何 handler，反射守卫失效");
        }
        assertTrue(checked >= 30, "考勤接口数量异常偏少，疑似反射未扫到 handler: " + checked);
    }

    /**
     * 从菜单初始化器的声明里取「菜单 → 已登记动作集」。
     * <p>直接读真值来源而不是在测试里再抄一份动作表：抄一份就会两边各自漂移，
     * 而这个测试要守的正是"接口用的动作 = 菜单登记的动作"这一条等式。
     */
    private Map<String, Set<String>> declaredActionsByMenu() throws Exception {
        String[][] menus = (String[][]) ReflectionTestUtils.getField(AttendanceMenuInitializer.class, "MENUS");
        assertNotNull(menus, "AttendanceMenuInitializer.MENUS 声明不可读");
        ObjectMapper mapper = new ObjectMapper();
        Map<String, Set<String>> result = new HashMap<>();
        for (String[] menu : menus) {
            List<String> actions = mapper.readValue(menu[7], mapper.getTypeFactory()
                    .constructCollectionType(List.class, String.class));
            result.put(menu[0], new HashSet<>(actions));
        }
        return result;
    }
}
