package com.mftb.admin.service.doc;

import com.mftb.admin.dto.DocNativeDTO.Grant;
import com.mftb.admin.entity.SysUser;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import java.util.List;

/** 独立认证类型让服务层可无条件拒绝机器批准，不能把集成令牌当普通 JWT。 */
public final class DocIntegrationAuthentication extends UsernamePasswordAuthenticationToken {
    private final Grant grant;
    public DocIntegrationAuthentication(SysUser user, Grant grant) {
        super(user.getUsername(), null, List.of(new SimpleGrantedAuthority("ROLE_USER")));
        this.grant = grant;
        setDetails(user);
    }
    public Grant grant() { return grant; }
}
