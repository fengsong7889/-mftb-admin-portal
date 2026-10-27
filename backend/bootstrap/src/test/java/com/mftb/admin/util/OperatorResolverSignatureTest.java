package com.mftb.admin.util;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysRoleMapper;
import com.mftb.admin.mapper.SysUserMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 人员展示签名批量解析测试（提测批次详情「執行人員」由裸 ID 改为姓名的取数口径）。
 *
 * <p>锁死三条：
 * <ol>
 *   <li><b>顺序与去重</b>：签名顺序跟随入参，重复/null 不产生重复项——详情页执行人
 *       要按指派顺序展示，顺序漂了会被当成换了人；</li>
 *   <li><b>宁缺不裸</b>：库里查不到的 id 直接剔除，绝不回退成 ID 字符串上界面；</li>
 *   <li><b>只给姓名+工号</b>：即使用户实体带着部门/职位/职级，签名里也不许出现。</li>
 * </ol>
 */
class OperatorResolverSignatureTest {

    @BeforeAll
    static void initTableInfo() {
        // LambdaQueryWrapper 的 select/in 需要实体的 TableInfo，纯 Mockito 环境要手动注册
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, SysUser.class);
    }

    private SysUserMapper userMapper;
    private OperatorResolver resolver;

    @BeforeEach
    void setUp() {
        userMapper = mock(SysUserMapper.class);
        resolver = new OperatorResolver(userMapper, mock(SysRoleMapper.class));
    }

    private static SysUser user(long id, String name, String empId) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setUsername(name);
        u.setName(name);
        u.setEmpId(empId);
        // 故意带上敏感列：签名里出现任何一项都算隐私外泄
        u.setDepartment("「外賣到家」事業部");
        u.setPosition("經理/主管");
        u.setJobLevel("M4");
        return u;
    }

    @Test
    @DisplayName("按入参顺序输出去重后的「姓名(工号)」，且不夹带部门/职位/职级")
    void resolvesSignaturesInInputOrder() {
        when(userMapper.selectList(any())).thenReturn(List.of(
                user(21L, "张三", "MF00021"), user(22L, "橘子同学", "MF00022")));

        // 用 Arrays.asList 而不是 List.of：后者拒 null 元素，本例就是要验证入参含 null 不炸
        List<String> names = resolver.signaturesByIds(Arrays.asList(22L, 21L, 21L, null));

        assertEquals(List.of("橘子同学(MF00022)", "张三(MF00021)"), names);
        for (String name : names) {
            assertTrue(name.indexOf("事業部") < 0, "签名不得含部门: " + name);
            assertTrue(name.indexOf("經理") < 0, "签名不得含职位: " + name);
            assertTrue(name.indexOf("M4") < 0, "签名不得含职级: " + name);
        }
    }

    @Test
    @DisplayName("库里查不到的 id 被剔除，绝不把裸 ID 交给界面")
    void skipsUnknownUserIds() {
        when(userMapper.selectList(any())).thenReturn(List.of(user(21L, "张三", "MF00021")));

        List<String> names = resolver.signaturesByIds(List.of(21L, 9_999L));

        assertEquals(List.of("张三(MF00021)"), names);
    }

    @Test
    @DisplayName("空入参不查库")
    void emptyIdsSkipsQuery() {
        assertTrue(resolver.signaturesByIds(List.of()).isEmpty());
        assertTrue(resolver.signaturesByIds(null).isEmpty());

        verify(userMapper, never()).selectList(any());
    }
}
