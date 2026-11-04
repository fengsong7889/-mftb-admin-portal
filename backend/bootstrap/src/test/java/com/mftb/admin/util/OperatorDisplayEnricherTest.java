package com.mftb.admin.util;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.dto.AdAlgorithmVO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 「最后更新人」读侧展示签名补全测试（广告推荐系统列表/详情统一为「姓名(工号)」）。
 *
 * <p>锁死四条：
 * <ol>
 *   <li><b>唯一命中才拼</b>：重名姓名一律保持原值——挂错工号比不显示更糟，还会把
 *       组织归属指到另一个人头上；</li>
 *   <li><b>查不到就原样返回</b>：历史操作人（含已注销账号）与 {@code system} 等
 *       机器值没有工号可拼，不许回退成裸 ID 或空串；</li>
 *   <li><b>整批一次查询</b>：一页几十条只许打一次 IN，逐行回查会拖慢列表首屏；</li>
 *   <li><b>只给姓名+工号</b>：即使用户实体带着部门/职位/职级，展示值里也不许出现。</li>
 * </ol>
 */
class OperatorDisplayEnricherTest {

    @BeforeAll
    static void initTableInfo() {
        // LambdaQueryWrapper 的 select/in 需要实体的 TableInfo，纯 Mockito 环境要手动注册
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, SysUser.class);
    }

    private SysUserMapper userMapper;
    private OperatorDisplayEnricher enricher;

    @BeforeEach
    void setUp() {
        userMapper = mock(SysUserMapper.class);
        enricher = new OperatorDisplayEnricher(userMapper);
    }

    private static SysUser user(String name, String empId) {
        SysUser u = new SysUser();
        u.setName(name);
        u.setEmpId(empId);
        // 故意带上敏感列：展示值里出现任何一项都算隐私外泄
        u.setDepartment("「外賣到家」事業部");
        u.setPosition("總裁");
        u.setJobLevel("M11");
        return u;
    }

    private static AdAlgorithmVO algo(String updatedBy) {
        AdAlgorithmVO vo = new AdAlgorithmVO();
        vo.setUpdatedBy(updatedBy);
        return vo;
    }

    @Test
    @DisplayName("唯一命中的姓名补成「姓名(工号)」，且不夹带部门/职位/职级")
    void appendsEmpIdForUniqueName() {
        when(userMapper.selectList(any())).thenReturn(List.of(user("冯松", "MF00002")));

        List<AdAlgorithmVO> records = List.of(algo("冯松"));
        enricher.enrich(records, AdAlgorithmVO::getUpdatedBy, AdAlgorithmVO::setUpdatedBy);

        assertEquals("冯松(MF00002)", records.get(0).getUpdatedBy());
        String display = records.get(0).getUpdatedBy();
        assertTrue(display.indexOf("事業部") < 0, "展示值不得含部门: " + display);
        assertTrue(display.indexOf("總裁") < 0, "展示值不得含职位: " + display);
        assertTrue(display.indexOf("M11") < 0, "展示值不得含职级: " + display);
    }

    @Test
    @DisplayName("重名姓名保持原值：宁可不显示工号，也不把别人的工号挂上去")
    void keepsBareNameWhenDuplicated() {
        when(userMapper.selectList(any())).thenReturn(List.of(
                user("张伟", "MF00010"), user("张伟", "MF00088")));

        List<AdAlgorithmVO> records = List.of(algo("张伟"));
        enricher.enrich(records, AdAlgorithmVO::getUpdatedBy, AdAlgorithmVO::setUpdatedBy);

        assertEquals("张伟", records.get(0).getUpdatedBy());
    }

    @Test
    @DisplayName("库里查不到的历史操作人原样返回，不回退成裸 ID 也不清空")
    void keepsUnknownOperator() {
        when(userMapper.selectList(any())).thenReturn(List.of());

        List<AdAlgorithmVO> records = List.of(algo("离职同事"), algo("system"));
        enricher.enrich(records, AdAlgorithmVO::getUpdatedBy, AdAlgorithmVO::setUpdatedBy);

        assertEquals("离职同事", records.get(0).getUpdatedBy());
        assertEquals("system", records.get(1).getUpdatedBy());
    }

    @Test
    @DisplayName("整批只查一次库，空值行不受影响")
    void queriesOncePerBatch() {
        when(userMapper.selectList(any())).thenReturn(List.of(user("冯松", "MF00002")));

        List<AdAlgorithmVO> records = List.of(algo("冯松"), algo("冯松"), algo(null), algo(""));
        enricher.enrich(records, AdAlgorithmVO::getUpdatedBy, AdAlgorithmVO::setUpdatedBy);

        verify(userMapper, times(1)).selectList(any());
        assertEquals("冯松(MF00002)", records.get(1).getUpdatedBy());
        assertNull(records.get(2).getUpdatedBy());
        assertEquals("", records.get(3).getUpdatedBy());
    }

    @Test
    @DisplayName("全为空值时不查库")
    void emptyNamesSkipQuery() {
        enricher.enrich(List.of(algo(null), algo("")), AdAlgorithmVO::getUpdatedBy, AdAlgorithmVO::setUpdatedBy);

        verify(userMapper, never()).selectList(any());
    }

    @Test
    @DisplayName("「系統」哨兵值必须原值保留：前端拿它过滤系统预置算法，拼了就等于漏数据")
    void keepsSentinelSystemOperator() {
        // 即使库里真有一个叫「系統」的账号，也不得拼工号
        when(userMapper.selectList(any())).thenReturn(List.of(user("系統", "MF00099")));

        List<AdAlgorithmVO> records = List.of(algo("系統"), algo("system"));
        enricher.enrich(records, AdAlgorithmVO::getUpdatedBy, AdAlgorithmVO::setUpdatedBy);

        assertEquals("系統", records.get(0).getUpdatedBy());
        assertEquals("system", records.get(1).getUpdatedBy());
        verify(userMapper, never()).selectList(any());
    }
}
