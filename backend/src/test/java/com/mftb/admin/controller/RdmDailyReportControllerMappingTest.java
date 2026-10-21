package com.mftb.admin.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.config.RdmMenuInitializer;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmDailyReportVO;
import com.mftb.admin.service.RdmDailyReportService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
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
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * RDM 每日日报接口的映射与权限注解守卫测试（方案 §五「契约」档）。
 *
 * <p>三件事各自解决一类静默故障（沿用 {@code AttendanceControllerMappingTest} 的口径）：
 * <ol>
 *   <li><b>真实路径可映射</b>：用 standalone MockMvc 打完整路径，路径写错或方法没映射时 HTTP 层
 *       直接 404，而不是等前端联调才发现。未登录探针证明不了这件事——JWT 过滤器在 MVC 之前
 *       就统一返回 401，存在与不存在的路径看起来一样。</li>
 *   <li><b>字面路径不被模板吞掉</b>：{@code /template/{id}} 与 {@code /template/{key}/apply}
 *       同前缀共存，一旦被吞会因类型转换失败变成 400，配置页整块操作失效。</li>
 *   <li><b>每个 handler 都带 {@code @RequirePermission}，且 action 已在菜单动作集里登记</b>：
 *       忘加注解 = 该接口对所有登录用户敞开；action 没登记进 {@code sys_menu.actions} =
 *       授权中心勾不到，普通角色永久 403（超管走代码直通看不出来）。本控制器的 {@code trigger}
 *       是新增的专用动作，最容易漏登记，因此必须反射断言。</li>
 * </ol>
 */
class RdmDailyReportControllerMappingTest {

    private static final String BASE = "/api/rdm/daily-report";

    private static final List<String> HANDLER_ANNOTATIONS = List.of(
            "org.springframework.web.bind.annotation.GetMapping",
            "org.springframework.web.bind.annotation.PostMapping",
            "org.springframework.web.bind.annotation.PutMapping",
            "org.springframework.web.bind.annotation.DeleteMapping");

    /**
     * 本控制器允许出现的菜单：四个二级页（规则/模板/记录/触发）+ 快照只读放行的各 RDM 承载菜单。
     * <p>全部属「進度日報」一级分组下的二级菜单或 RDM 域既有菜单，出现分组 key 或域外 key 都算串了。
     */
    private static final Set<String> ALLOWED_MENUS = Set.of(
            RdmConstants.MENU_DAILY_REPORT_RULE,
            RdmConstants.MENU_DAILY_REPORT_TEMPLATE,
            RdmConstants.MENU_DAILY_REPORT_RECORD,
            RdmConstants.MENU_DAILY_REPORT_TRIGGER,
            RdmConstants.MENU_DASHBOARD_BOARD,
            RdmConstants.MENU_WORKBENCH,
            RdmConstants.MENU_REQUIREMENT,
            RdmConstants.MENU_DELIVERY_BOARD);
    
    private MockMvc mvc() {
        RdmDailyReportService service = mock(RdmDailyReportService.class);
        when(service.getSnapshot(any(), anyString(), any(), any(), any())).thenReturn(null);
        when(service.listRecords(any())).thenReturn(List.of());
        when(service.listRules()).thenReturn(List.of());
        when(service.saveRule(any(), any())).thenReturn(new RdmDailyReportVO.Rule());
        when(service.loadConfig()).thenReturn(new RdmDailyReportVO.Config());
        when(service.saveConfig(any(), any())).thenReturn(new RdmDailyReportVO.Config());
        when(service.listTemplates(any())).thenReturn(List.of());
        when(service.saveTemplate(any(), any())).thenReturn(new RdmDailyReportVO.Template());
        when(service.preview(any())).thenReturn(new RdmDailyReportVO.PreviewResult());
        when(service.triggerManual(anyString(), anyList(), any(), any(), anyBoolean()))
                .thenReturn(new RdmDailyReportVO.TriggerResult());
        OperatorResolver operator = mock(OperatorResolver.class);
        when(operator.currentOperatorName()).thenReturn("測試管理員");
        return MockMvcBuilders.standaloneSetup(new RdmDailyReportController(service, operator)).build();
    }

    @Test
    @DisplayName("日报接口全部可映射：快照/记录/配置/模板/预览/触发")
    void allRoutesResolve() throws Exception {
        MockMvc mvc = mvc();

        // 只读：快照必须带 date（严格校验 yyyy-MM-dd），type 缺省 morning
        mvc.perform(get(BASE).param("date", "2026-10-19").param("type", "morning"))
                .andExpect(status().isOk());
        // 手动补发的快照行 report_type=manual，详情页按 ?type=manual 取数，同样必须可映射
        mvc.perform(get(BASE).param("date", "2026-10-19").param("type", "manual"))
                .andExpect(status().isOk());
        mvc.perform(get(BASE + "/records").param("limit", "30")).andExpect(status().isOk());

        // 规则 CRUD：列表/保存/删除
        mvc.perform(get(BASE + "/rules")).andExpect(status().isOk());
        mvc.perform(post(BASE + "/rule").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"A產品-B1迭代\",\"projectId\":3,\"iterationCode\":\"SP202610001\","
                                + "\"pushTime\":\"09:00\",\"contentType\":\"morning\",\"enabled\":true}"))
                .andExpect(status().isOk());
        mvc.perform(delete(BASE + "/rule/9")).andExpect(status().isOk());

        mvc.perform(get(BASE + "/config")).andExpect(status().isOk());
        mvc.perform(put(BASE + "/config").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":true,\"morningTime\":\"09:00\",\"eveningTime\":\"18:00\","
                                + "\"groupEnabled\":true,\"personalEnabled\":true,\"receiverScope\":\"all_projects\"}"))
                .andExpect(status().isOk());

        // 字面路径 /templates 与 /template 前缀相同但不同段，不能被彼此吞掉
        mvc.perform(get(BASE + "/templates")).andExpect(status().isOk());
        mvc.perform(get(BASE + "/templates").param("channel", "group")).andExpect(status().isOk());
        mvc.perform(post(BASE + "/template").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"測試模板\",\"channel\":\"group\",\"reportType\":\"morning\","
                                + "\"titleTpl\":\"t\",\"contentTpl\":\"c\"}"))
                .andExpect(status().isOk());
        // /template/{id} 与 /template/{key}/apply 同前缀共存：路径深度与方法不同，冲突会在构建期报错
        mvc.perform(delete(BASE + "/template/7")).andExpect(status().isOk());
        mvc.perform(post(BASE + "/template/group_morning_overview/apply")).andExpect(status().isOk());

        mvc.perform(post(BASE + "/preview").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reportType\":\"morning\",\"channel\":\"group\"}"))
                .andExpect(status().isOk());
        mvc.perform(post(BASE + "/trigger").param("type", "morning").param("projectId", "3"))
                .andExpect(status().isOk());
        // 手动触发可选指定迭代：项目 3 下的 B1 迭代
        mvc.perform(post(BASE + "/trigger").param("type", "evening").param("projectId", "3")
                        .param("iterationCode", "SP202610001").param("dryRun", "true"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("非法日期被拒（不兜底成今天，避免用户以为看的是另一天）")
    void rejectsInvalidDate() throws Exception {
        MockMvc mvc = mvc();
        // standaloneSetup 不带全局异常处理器，BusinessException 会冒泡成 ServletException；
        // 因此这里只断言「不会当成合法请求返回 200」，具体错误码由 GlobalExceptionHandler 在集成环境定。
        for (String bad : List.of("2026/10/19", "not-a-date", "", "2026-13-45")) {
            int status;
            try {
                status = mvc.perform(get(BASE).param("date", bad)).andReturn().getResponse().getStatus();
            } catch (Exception e) {
                // 异常冒泡本身就证明被拒了（没被当成合法日期静默兜底）
                continue;
            }
            assertTrue(status != 200, "非法日期不得返回 200: date=" + bad + ", status=" + status);
        }
    }

    @Test
    @DisplayName("每个日报接口都声明 @RequirePermission，菜单属 RDM 域，动作已在菜单种子登记")
    void everyHandlerIsPermissionAnnotatedWithRegisteredAction() throws Exception {
        Map<String, Set<String>> declared = declaredActionsByMenu();
        int checked = 0;
        for (Method method : RdmDailyReportController.class.getDeclaredMethods()) {
            boolean isHandler = Arrays.stream(method.getAnnotations())
                    .anyMatch(a -> HANDLER_ANNOTATIONS.contains(a.annotationType().getName()));
            if (!isHandler) {
                continue;
            }
            RequirePermission permission = method.getAnnotation(RequirePermission.class);
            String where = "RdmDailyReportController#" + method.getName();
            assertNotNull(permission, where + " 缺少 @RequirePermission，会对所有登录用户敞开");
            assertTrue(ALLOWED_MENUS.contains(permission.menu()), where + " 的主菜单不属于日报可读范围: " + permission.menu());
            Arrays.stream(permission.anyOf()).forEach(menu ->
                    assertTrue(ALLOWED_MENUS.contains(menu), where + " 的 anyOf 菜单不在允许集合: " + menu));

            // 动作必须在菜单种子里登记，否则授权中心勾不到 → 普通角色永久 403（超管直通看不出来）
            Set<String> allowed = declared.get(permission.menu());
            assertNotNull(allowed, where + " 的菜单未在 RdmMenuInitializer 声明: " + permission.menu());
            assertTrue(allowed.contains(permission.action()),
                    where + " 使用了未登记的动作 " + permission.action() + "，菜单 " + permission.menu()
                            + " 只登记了 " + allowed + "；普通角色将永久 403");
            checked++;
        }
        // 卡下限：反射没扫到 handler 时 checked=0 也能"全通过"，那等于守卫失效
        assertTrue(checked >= 13, "日报接口数量异常偏少，疑似反射未扫到 handler: " + checked);
    }

    @Test
    @DisplayName("手动触发用独立的 trigger 动作，与配置读写 edit 分开授权")
    void triggerUsesDedicatedAction() throws Exception {
        Method trigger = Arrays.stream(RdmDailyReportController.class.getDeclaredMethods())
                .filter(m -> m.getName().equals("trigger")).findFirst().orElse(null);
        assertNotNull(trigger, "找不到 trigger handler");
        RequirePermission permission = trigger.getAnnotation(RequirePermission.class);
        assertNotNull(permission);
        assertTrue("trigger".equals(permission.action()),
                "手动触发必须用独立的 trigger 动作（能改配置不等于能向全公司群发），实际: " + permission.action());

        // 反向确认：写规则/配置/模板的接口用 edit，不得借用 trigger
        for (String name : List.of("saveRule", "deleteRule", "saveConfig", "saveTemplate", "deleteTemplate", "applyTemplate")) {
            Method m = Arrays.stream(RdmDailyReportController.class.getDeclaredMethods())
                    .filter(x -> x.getName().equals(name)).findFirst().orElse(null);
            assertNotNull(m, "找不到 " + name + " handler");
            RequirePermission p = m.getAnnotation(RequirePermission.class);
            assertNotNull(p, name + " 缺少 @RequirePermission");
            assertTrue("edit".equals(p.action()), name + " 应挂 edit 动作，实际: " + p.action());
        }
    }

    /**
     * 从菜单初始化器的声明里取「菜单 → 已登记动作集」。
     * <p>直接读真值来源而不是在测试里再抄一份动作表：抄一份就会两边各自漂移，
     * 而这个测试要守的正是「接口用的动作 = 菜单登记的动作」这一条等式。
     * <p>注意 RDM 的 MENUS 行有 10 列，动作集在下标 9（考勤域是 8 列、下标 7，不可照抄）。
     */
    private Map<String, Set<String>> declaredActionsByMenu() throws Exception {
        String[][] menus = (String[][]) ReflectionTestUtils.getField(RdmMenuInitializer.class, "MENUS");
        assertNotNull(menus, "RdmMenuInitializer.MENUS 声明不可读");
        ObjectMapper mapper = new ObjectMapper();
        Map<String, Set<String>> result = new HashMap<>();
        for (String[] menu : menus) {
            List<String> actions = mapper.readValue(menu[9], mapper.getTypeFactory()
                    .constructCollectionType(List.class, String.class));
            result.put(menu[0], new HashSet<>(actions));
        }
        return result;
    }
}
