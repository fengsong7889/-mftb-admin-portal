package com.mftb.admin.service.minutes;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 负责人确定性匹配：模型只给原文称呼/临时 mention，真实 userId 一律由服务端回查。
 *
 * <p>匹配优先级（越靠前越可信）：
 * <ol>
 *   <li>用户用 @员工选择器选中并经服务端验证的 mention → 直接绑定；</li>
 *   <li>原文唯一工号 → 精确匹配在职员工；</li>
 *   <li>仅人名且本场参会人唯一命中 → 预填（仍展示来源）；</li>
 *   <li>仅在职员工全局唯一命中 → 作为候选让用户确认；</li>
 *   <li>重名/外部人员/查无/指代不清 → 不绑定，标待确认。</li>
 * </ol>
 *
 * <p>绝不因为「AI 说是某人」就伪造身份：最终仍由纪要保存服务按 userId 回查姓名工号快照。
 */
@Component
@RequiredArgsConstructor
public class MinutesOwnerMatcher {

    public enum Status { RESOLVED, CANDIDATES, UNRESOLVED }

    public record Match(Status status, SysUser resolved, List<SysUser> candidates, String reasonCode) {
        static Match resolved(SysUser user) {
            return new Match(Status.RESOLVED, user, List.of(), null);
        }

        static Match candidates(List<SysUser> users, String reason) {
            return new Match(Status.CANDIDATES, null, users, reason);
        }

        static Match unresolved(String reason) {
            return new Match(Status.UNRESOLVED, null, List.of(), reason);
        }
    }

    private final SysUserMapper userMapper;

    /**
     * @param mentionUserId 经服务端验证的 @选择结果（可空）
     * @param ownerText     模型给出的原文称呼（人名或工号，可空）
     * @param attendees     本场参会人（按 userId 索引，可空/空表）
     */
    public Match match(Long mentionUserId, String ownerText, Map<Long, SysUser> attendees) {
        if (mentionUserId != null && mentionUserId > 0) {
            SysUser byMention = userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                    .eq(SysUser::getId, mentionUserId).eq(SysUser::getStatus, 1))
                    .stream().findFirst().orElse(null);
            if (byMention == null) {
                return Match.unresolved("mention_user_invalid");
            }
            return Match.resolved(byMention);
        }
        if (!StringUtils.hasText(ownerText)) {
            return Match.unresolved("no_owner");
        }
        String text = ownerText.trim();

        // 工号精确匹配（在职）
        List<SysUser> byEmpNo = userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getEmpId, text).eq(SysUser::getStatus, 1));
        if (byEmpNo.size() == 1) {
            return Match.resolved(byEmpNo.get(0));
        }

        List<SysUser> byName = userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getName, text).eq(SysUser::getStatus, 1));
        if (byName.isEmpty()) {
            return Match.unresolved("no_match");
        }
        // 优先本场参会人里的唯一命中
        List<SysUser> inMeeting = new ArrayList<>();
        for (SysUser user : byName) {
            if (attendees != null && attendees.containsKey(user.getId())) {
                inMeeting.add(user);
            }
        }
        if (inMeeting.size() == 1) {
            return Match.resolved(inMeeting.get(0));
        }
        if (inMeeting.size() > 1) {
            return Match.candidates(inMeeting, "ambiguous_in_meeting");
        }
        // 会议外：唯一命中也只作候选，需用户确认；重名同样作候选
        long distinct = byName.stream().map(SysUser::getId).filter(Objects::nonNull).distinct().count();
        if (distinct == 1) {
            return Match.candidates(byName, "outside_meeting_needs_confirm");
        }
        return Match.candidates(byName, "duplicate_name");
    }
}
