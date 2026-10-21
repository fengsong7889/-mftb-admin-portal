package com.mftb.admin.service.agent;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.SysRole;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysRoleMapper;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 配置作用域的写权限守卫：共用（common/global）配置仅管理员可修改。
 *
 * <p>系统级配置由各页面 edit 权限控制；这里只拦“改动会影响所有系统”的写操作，
 * 避免某个系统的运营顺手改了共用术语/骨架，导致其他系统行为一起变化。
 * <p>超管判定与 {@code DataScopeServiceImpl} 对齐：sys_user.role=admin，
 * 或 functionRoles 绑定了 sys_role.code=admin。
 * <p>非 Web 上下文（定时任务、单测）解析不到登录人时放行，避免误伤后台任务。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AiScopeGuard {

    private static final String SUPER_ADMIN_ROLE_CODE = "admin";

    private final OperatorResolver operatorResolver;
    private final SysRoleMapper sysRoleMapper;

    /** 写共用配置前调用；系统级作用域直接放行。 */
    public void assertWritable(String scope) {
        String value = StringUtils.hasText(scope) ? scope.trim() : "common";
        if (!"common".equalsIgnoreCase(value) && !"global".equalsIgnoreCase(value)
                && !"default".equalsIgnoreCase(value)) return;
        SysUser user = operatorResolver.currentUser();
        if (user == null) return;
        if (isSuperAdmin(user)) return;
        throw new BusinessException("共用配置僅管理員可修改，請選擇對應系統或聯繫管理員");
    }

    private boolean isSuperAdmin(SysUser user) {
        if ("admin".equalsIgnoreCase(user.getRole())) return true;
        List<Long> roleIds = JsonUtils.parseLongList(user.getFunctionRoles());
        if (roleIds.isEmpty()) return false;
        try {
            List<SysRole> roles = sysRoleMapper.selectList(new LambdaQueryWrapper<SysRole>()
                    .in(SysRole::getId, roleIds)
                    .eq(SysRole::getStatus, 1));
            return roles.stream().anyMatch(r -> SUPER_ADMIN_ROLE_CODE.equals(r.getCode()));
        } catch (Exception e) {
            // 角色表异常时按“非超管”处理更安全；但为避免把正常管理员挡在门外，只记日志并放行
            log.warn("[AiScopeGuard] 读取角色失败，跳过共用写权限拦截: {}", e.getMessage());
            return true;
        }
    }
}
