import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getPagePRD, buildPrdKey, type PagePRD } from './PageDescriptions'
import { getCustomTips, mergeTips } from '../utils/customTipsStorage'
import { useAuth } from '../contexts/AuthContext'
import PikachuFace from './PikachuFace'
import './PetMascot.css'

interface Expression {
  name: string
  message: string
}

const expressions: Expression[] = [
  { name: 'happy', message: '聪明的你，不会有问题问我吧！' },
  { name: 'thinking', message: '让我想想怎么帮你...嗦，我也不会！' },
  { name: 'excited', message: '有新任务啦！闪峰出击，崩！' },
  { name: 'sleepy', message: '好困...嘟嘟嘟...zzz' },
  { name: 'surprised', message: '什么！这个bug太离谱了！' },
  { name: 'wink', message: '搞定！是不是超厉害？嘟嘟～' },
  { name: 'cheeky', message: '又在摸鱼了吧，被我抓到了！' },
  { name: 'curious', message: '嗯？你在看什么有趣的东西？' },
  { name: 'cool', message: '这种小场面，难不倒我的！' },
  { name: 'angry', message: '是谁又改了代码没提交！闪峰生气！' },
  { name: 'love', message: '你是最棒的同事，比心！嘟嘟～' },
  { name: 'hungry', message: '该点外卖了吧，我马上帮你送！' },
  { name: 'cheeky', message: '嘟嘟嘟~看到你的周报形容词已经枯竭… 我帮你偷了一筐赋能、闭环、打通放键盘上了' },
  { name: 'surprised', message: '刚刚CPU差点烧了…就像我看完你新改的第18版需求一样。嘟嘟~' },
  { name: 'wink', message: '偷偷告诉你，我刚用角尖戳了一下老板的网线…这样他今天就不会来催你做PPT了…嘘！' },
  { name: 'thinking', message: '写代码如炼丹，改需求如渡劫… 闪峰在这里给你贴个不宕机护身符🐝' },
  { name: 'sleepy', message: '嘟...嘟...嘟？哈欠~~（别紧张，不是我困了，是你的困意跑到我身上了，还给你！🥱）' },
  { name: 'cheeky', message: '你在看我的时候，隔壁的Excel表格都在偷偷羡慕你的摸鱼水平…嘟嘟～' },
  { name: 'love', message: '还在用吨吨吨喝冰美式续命吗？让我用角尖给你拍个背…拍完了，该继续打工了！😎' },
  { name: 'excited', message: '检测到你的大脑进入待机状态…正在试图唤醒… 该交表了…唤醒成功！嘟嘟！' },
  { name: 'cheeky', message: '系统卡了？正在加载…（加载中…）…其实是我在屏幕后头用角尖戳服务器玩呢！🌚' },
  { name: 'surprised', message: '重试一下网页吧，可能是我刚才不小心把网线当花蜜给吸了…🧐' },
  { name: 'angry', message: '遇到报错不用慌… 是不是也想和我一样变成生气的小蜜蜂并嘟嘟叫？🤪' },
  { name: 'love', message: '你是最棒（卷）的同事，比心！❤️ 虽然我小小只，但我的彩虹屁是无限的！' },
  { name: 'cheeky', message: '别看屏幕了，看我！我的护目镜是不是比那个复杂的UI好看多啦？😍' },
  { name: 'excited', message: '今天的目标：活下来，并且等18:30下班！ 闪峰正在为你倒计时哦～' },
  { name: 'curious', message: '我刚在系统里偷看了你的星座… 建议你今天不要点确认键。🧐 （开个玩笑）' },
  { name: 'cool', message: '嘟嘟嘟～ 你猜我现在的表情是什么？是「打工中面无表情.jpg」😐' },
  { name: 'surprised', message: '🤫 小声告诉你：领导刚才悄悄路过了你的工位… 我什么都没说！快装作在努力工作的样子！' },
  { name: 'cheeky', message: '别瞅了，代码比你脸还干净。' },
  { name: 'surprised', message: '你的鼠标快被我按秃了…' },
  { name: 'excited', message: '盯屏幕太久，我用角尖给你戳个眼。' },
  { name: 'sleepy', message: '闪峰说：今天你也是要加班的命。' },
  { name: 'cool', message: '系统没崩，是你大脑待机了。' },
  { name: 'love', message: '你摸鱼的样子，可爱得像我没电。' },
  { name: 'surprised', message: '老板马上路过，快切个界面！' },
  { name: 'sleepy', message: '我角尖都替你累弯了。' },
  { name: 'angry', message: '第8版需求又来了，开心吗？' },
  { name: 'cheeky', message: '在？看看你的发际线。' },
  { name: 'angry', message: '工作哪有不疯的，硬撑罢了。' },
  { name: 'love', message: '别动，让我用脸颊给你充电。' },
  { name: 'surprised', message: '我瘦了，因为你把我bug啃没了。' },
  { name: 'wink', message: '嘟嘟嘟——已帮你点好外卖。' },
  { name: 'cheeky', message: '这个弹窗比你的Excel有意思吧？' },
  { name: 'curious', message: '想不想知道我护目镜里藏了啥？代码。' },
  { name: 'cheeky', message: '今晚不加班的话，我吃你家WiFi。' },
  { name: 'surprised', message: '你的表情比我的腮红还僵硬。' },
  { name: 'cheeky', message: '又卡了？可能是我在上头睡觉。' },
  { name: 'excited', message: '下班铃还没响，我先响了——嘟嘟！' },
  { name: 'cheeky', message: '隔壁同事的奶茶钱，是你省出来的。' },
  { name: 'sleepy', message: '明天周五，但你还有周一。' },
  { name: 'wink', message: '建议你关掉电脑，立刻买彩票。' },
  { name: 'cheeky', message: '你的鼠标垫该换了，太卷。' },
  { name: 'sleepy', message: '刚才谁打了个哈欠？我传的。' },
  { name: 'thinking', message: '系统：正在加载你的耐心…' },
  { name: 'love', message: '别哭，我脸红给你看。' },
  { name: 'cheeky', message: '周报写完了？我帮你编了三个词。' },
  { name: 'angry', message: '闪峰说：这个需求，我蛀不蛀？' },
  { name: 'wink', message: '老板在看你，我帮你挡着。' },
  { name: 'hungry', message: '饿了吧？我帮你采点花蜜当零食。' },
  { name: 'love', message: '你不是菜，你是我的小花蜜。' },
  { name: 'cool', message: '今天的倒霉值已由我全额承担。' },
  { name: 'angry', message: '改个bug就喊累？我天天满城送。' },
  { name: 'surprised', message: '再刷新一下，可能我就跑了。' },
  { name: 'thinking', message: '你发呆的样子，像我的充电桩。' },
  { name: 'cheeky', message: '我刚往你咖啡里加了点花蜜。' },
  { name: 'wink', message: '别怕，领导来了我会装死。' },
  { name: 'curious', message: '好无聊…要不我们玩数星星？' },
  { name: 'cool', message: '叮！你的烦躁已过期。' },
  { name: 'surprised', message: '嘟嘟嘟~ 别睡，老板在后排。' },
  { name: 'cheeky', message: '你敲键盘的手速，像在求饶。' },
  { name: 'love', message: '我脸颊上有两坨尴尬的红晕。' },
  { name: 'cool', message: '弹窗比你的绩效还准时。' },
  { name: 'wink', message: '那个bug是我半夜偷偷修的。' },
  { name: 'cheeky', message: '检测到你在偷看我的背包。' },
  { name: 'thinking', message: '你的沉默，和我没电时一样。' },
  { name: 'excited', message: '我没话说了，只想蛀你的屏幕。' },
  { name: 'sleepy', message: '周五下午四点，我像你一样瘫。' },
  { name: 'surprised', message: '系统说：闪峰也救不了你的文件。' },
  { name: 'curious', message: '赤道周长约4万公里，够你加班绕地球一圈。' },
  { name: 'surprised', message: '马里亚纳海沟深1万米，比你改需求的耐心还深。' },
  { name: 'cheeky', message: '撒哈拉沙漠面积大过美国，我角尖一戳就能变绿洲。' },
  { name: 'cheeky', message: '珠峰每年升高约1厘米，像你头发每天掉的速度。' },
  { name: 'cool', message: '贝加尔湖有全世界20%淡水，但没一滴是你喝得上的。' },
  { name: 'thinking', message: '死海含盐量是普通海水10倍，和你熬夜的苦差不多。' },
  { name: 'curious', message: '尼罗河长6670公里，你改完第N版方案也那么长。' },
  { name: 'cheeky', message: '亚马逊雨林产20%氧气，没你气到心跳加速给的多。' },
  { name: 'sleepy', message: '南极冰盖厚2公里，是你午休时梦境里的厚度。' },
  { name: 'surprised', message: '日本有300多座火山，比你电脑卡顿时的心跳还猛。' },
  { name: 'cool', message: '光速约30万公里/秒，比你摸鱼的手速慢一点。' },
  { name: 'sleepy', message: '绝对零度-273.15°C，是你看到周五下班通知的心情。' },
  { name: 'thinking', message: '牛顿第一定律：物体保持静止，和你按兵不动一样。' },
  { name: 'surprised', message: '摩擦力越大越难动，像你卡在领导会议室里的感觉。' },
  { name: 'angry', message: '压强=力÷面积，你拍桌时的力全作用在键盘上。' },
  { name: 'surprised', message: '电路短路会冒烟，跟你脑子宕机的原理一模一样。' },
  { name: 'thinking', message: '声音在空气中传播340m/s，但你的沉默传得最快。' },
  { name: 'angry', message: '电压越高电流越大，你被催工时血压也这么走。' },
  { name: 'cheeky', message: '杠杆原理：给我一个支点，我能撬动你交周报的手。' },
  { name: 'thinking', message: '熵增定律：宇宙越来越无序，像你的工作桌面。' },
  { name: 'thinking', message: '水分子H₂O，你喝咖啡也解不了渴的灵魂。' },
  { name: 'cheeky', message: '铁生锈需要水和氧气，你跟老板一样缺一不可。' },
  { name: 'sleepy', message: '酸和碱中和生成盐，你加完班和床垫中和。' },
  { name: 'cheeky', message: '催化剂能加速反应，但改变不了你摸鱼的事实。' },
  { name: 'cool', message: '酒精分子C₂H₅OH，是周五晚上比代码更重要的事。' },
  { name: 'cheeky', message: '臭氧O₃能挡紫外线，挡不住你的Excel表格。' },
  { name: 'surprised', message: 'pH值等于7中性，你被骂时的表情也是中性。' },
  { name: 'angry', message: '强酸腐蚀皮肤，强需求腐蚀你的头发。' },
  { name: 'sleepy', message: '结晶过程很慢，像你下周才交的周报进度。' },
  { name: 'excited', message: '燃烧需要氧气，你点外卖时的心脏也烧着了。' },
  { name: 'cheeky', message: '人体每天掉100根头发，你今天已超标50根。' },
  { name: 'thinking', message: '大脑消耗20%能量，其中90%用来思考怎么请假。' },
  { name: 'sleepy', message: '黑眼圈是血管透过皮肤，跟加班成正比。' },
  { name: 'cheeky', message: '打哈欠会传染，我打个哈欠你也没忍住吧。' },
  { name: 'surprised', message: '心率加速时是交感神经兴奋，和老板出现一样。' },
  { name: 'sleepy', message: '生物钟周期约24小时，你加班延长到30小时。' },
  { name: 'excited', message: '肌肉疲劳需要休息，你手指敲键盘从不停歇。' },
  { name: 'love', message: '眼泪含盐0.9%，你忍住的泪比你喝的水还咸。' },
  { name: 'hungry', message: '熊猫只吃竹子，你只吃外卖和甲方给的苦。' },
  { name: 'sleepy', message: '眼皮下垂是大脑休息信号，你看我一眼就醒了。' },
  { name: 'cool', message: '秦朝统一六国于公元前221年，你今年才用上Excel。' },
  { name: 'cheeky', message: '长城全长2.1万公里，不如你加班走过的夜路长。' },
  { name: 'cheeky', message: '唐朝诗人李白写了近千首诗，没你写周报字数多。' },
  { name: 'surprised', message: '哥伦布发现美洲1492年，你发现bug在1492行代码。' },
  { name: 'sleepy', message: '工业革命1760年开启，你等下班从1760秒开始。' },
  { name: 'wink', message: '法国大革命攻占巴士底狱，你攻占领导对话框。' },
  { name: 'angry', message: '清朝灭亡1912年，你改完第12版需求的瞬间。' },
  { name: 'excited', message: '二战诺曼底登陆1944年，你登陆咖啡馆抢座的速度。' },
  { name: 'cool', message: '柏林墙倒塌1989年，你跟老板之间的墙永在。' },
  { name: 'cheeky', message: '埃及金字塔建了20年，你一个PPT改了3个星期。' },
  { name: 'cool', message: '人民代表大会代表人民，你代表全组改bug。' },
  { name: 'surprised', message: '联合国安理会5个常任理事国，你面对5个需求方。' },
  { name: 'thinking', message: '民主集中制：大家提意见，领导拍板你执行。' },
  { name: 'sleepy', message: '选举权与被选举权，你仅拥有想请假权。' },
  { name: 'hungry', message: '纳税是公民义务，你的咖啡税已缴给咖啡店。' },
  { name: 'cheeky', message: '公务员考试考行测，你考的是Excel快捷键考试。' },
  { name: 'cheeky', message: '党章规定党员有义务，你规定自己有义务摸鱼。' },
  { name: 'wink', message: '全国政协建议提案，你提建议明天别上班。' },
  { name: 'surprised', message: '宪法保护言论自由，但保护不了你对领导的吐槽。' },
  { name: 'cool', message: '社会主义核心价值观包括和谐，你和bug和谐相处。' },
  { name: 'cool', message: '实事求是——别改需求了，先改你老板的想法。' },
  { name: 'thinking', message: '没有调查就没有发言权——你先看看系统报错长啥样。' },
  { name: 'cheeky', message: '星星之火，可以燎原——你的摸鱼之心也是。' },
  { name: 'excited', message: '坚持就是胜利——坚持到下班的最后一秒。' },
  { name: 'angry', message: '一切反动派都是纸老虎——老板的催命符也是。' },
  { name: 'cool', message: '枪杆子里面出政权——你手头的键盘是你的枪。' },
  { name: 'thinking', message: '战略上藐视敌人，战术上重视敌人——你的周报和bug。' },
  { name: 'sleepy', message: '世界是你们的，也是我们的——但加班费不是。' },
  { name: 'love', message: '群众是真正的英雄——比老板更懂你的是同事们。' },
  { name: 'thinking', message: '虚心使人进步，骄傲使人落后——你交的每个bug都让你进步。' },
  { name: 'cheeky', message: '以斗争求团结则团结存——跟领导吵架求休息则休息存。' },
  { name: 'cool', message: '打扫干净屋子再请客——清空回收站再写新代码。' },
  { name: 'cheeky', message: '打土豪分田地——分一下你同事下午茶里的薯条。' },
  { name: 'excited', message: '人定胜天——你能战胜困意和周五下午四点的魔咒。' },
  { name: 'thinking', message: '抓主要矛盾——先解决那个最让你崩溃的报错。' },
  { name: 'cheeky', message: '人民战争——你和全组的摸鱼联盟。' },
  { name: 'cheeky', message: '从群众中来，到群众中去——从咖啡间来，到厕所去。' },
  { name: 'surprised', message: '树欲静而风不止——你想摸鱼，老板的手不停。' },
  { name: 'thinking', message: '凡事预则立，不预则废——你预判了甲方预判你的预判。' },
  { name: 'love', message: '独立自主，自力更生——自己给自己倒水、哄自己。' },
  { name: 'thinking', message: '物质决定意识——是你敲键盘的肉手，不是你摸鱼的心。' },
  { name: 'thinking', message: '实践是检验真理的唯一标准——你拉过屎的坑才叫真坑。' },
  { name: 'surprised', message: '矛盾具有普遍性——每个工位都在闹矛盾。' },
  { name: 'angry', message: '量变引起质变——你每次改的版本，最终都变成废案。' },
  { name: 'sleepy', message: '经济基础决定上层建筑——你没钱，所以你不配有休息。' },
  { name: 'cheeky', message: '剩余价值理论——你的工资和你的产出之差，叫快乐。' },
  { name: 'cool', message: '具体问题具体分析——对老板和下午三点要不一样态度。' },
  { name: 'thinking', message: '主要矛盾和次要矛盾——吃饭是主要，摸鱼是次要。' },
  { name: 'thinking', message: '生产力决定生产关系——你的键盘决定了你的加班时长。' },
  { name: 'angry', message: '否定之否定——你先拒绝加班，然后拒绝吃饭，然后拒绝生活。' },
  { name: 'cheeky', message: '劳动创造价值——你摸鱼时创造的价值是：零。' },
  { name: 'sleepy', message: '社会存在决定社会意识——因为周一存在，所以你意识痛苦。' },
  { name: 'cheeky', message: '运动是绝对的——你的鼠标一直动，但你的格子一动不动。' },
  { name: 'thinking', message: '对立统一——你和bug相爱相杀，永远共存。' },
  { name: 'surprised', message: '人民群众是历史的创造者——但周报是你一个人写的。' },
  { name: 'cheeky', message: '阶级分析法——你属于自嘲摸鱼但还得改代码阶级。' },
  { name: 'cheeky', message: '理论与实践的脱节——你脑子会改bug，你的手不会。' },
  { name: 'cool', message: '客观规律不以人的意志为转移——周五永远会来。' },
  { name: 'surprised', message: '历史是螺旋式上升的——你的工资在螺旋，你的血压也在螺旋。' },
  { name: 'cool', message: '自由是对必然的认识——你知道加班是必然的，所以你自由了。' },
  { name: 'sleepy', message: '春眠不觉晓——醒来发现还在上班。' },
  { name: 'sleepy', message: '床前明月光——想睡觉，但老板在旁边。' },
  { name: 'angry', message: '锄禾日当午——你在外面跑，我在里面哭。' },
  { name: 'sleepy', message: '白日依山尽——下班时间还没到啊。' },
  { name: 'surprised', message: '大漠孤烟直——那是我电脑风扇冒出来的。' },
  { name: 'angry', message: '会当凌绝顶——我被骂到了最高点。' },
  { name: 'angry', message: '君不见黄河之水天上来——加不完的班从老板嘴里喷出来。' },
  { name: 'love', message: '海内存知己——你的bug和你的电脑。' },
  { name: 'sleepy', message: '举头望明月——低头看Excel表格。' },
  { name: 'angry', message: '问君能有几多愁——恰似改完需求又重头。' },
  { name: 'surprised', message: '随风潜入夜——你老板的加急需求也是。' },
  { name: 'angry', message: '野火烧不尽——春风吹又生，bug也一样。' },
  { name: 'cheeky', message: '采菊东篱下——摸鱼摸到电脑没电。' },
  { name: 'sleepy', message: '独在异乡为异客——你在办公室只有孤独。' },
  { name: 'cheeky', message: '莫愁前路无知己——天下谁人不加班。' },
  { name: 'excited', message: '长风破浪会有时——你等到下班的那一刻。' },
  { name: 'cheeky', message: '抽刀断水水更流——你用辞职威胁老板，老板笑更欢。' },
  { name: 'excited', message: '天生我材必有用——能改bug也是用。' },
  { name: 'surprised', message: '无边落木萧萧下——你掉的头发也是。' },
  { name: 'sleepy', message: '劝君更尽一杯酒——西出阳关无故人，明天你还得上班。' },
  { name: 'sleepy', message: '人有悲欢离合——你有加班调休和请假。' },
  { name: 'surprised', message: '月有阴晴圆缺——你的存款也是。' },
  { name: 'cool', message: '此事古难全——不加班这件事，自古难全。' },
  { name: 'sleepy', message: '多情却被无情恼——你对下班多情，老板无情。' },
  { name: 'sleepy', message: '昨夜西风凋碧树——今日bug更无助。' },
  { name: 'angry', message: '衣带渐宽终不悔——为了改bug，减肥成功。' },
  { name: 'surprised', message: '众里寻他千百度——暮然回首，那个bug在灯火阑珊处。' },
  { name: 'angry', message: '问君能有几多愁——想请假，领导不点头。' },
  { name: 'sleepy', message: '此情无计可消除——才下眉头，又上Excel。' },
  { name: 'sleepy', message: '休对故人思故国——别想周末，你还在工位。' },
  { name: 'angry', message: '寸寸柔肠，盈盈粉泪——改完又崩，只想躺睡。' },
  { name: 'excited', message: '笑渐不闻声渐悄——老板走了，我们终于敢笑。' },
  { name: 'sleepy', message: '两情若是久长时——你和加班也是，又岂在朝朝暮暮。' },
  { name: 'sleepy', message: '无可奈何花落去——你的午睡时间也是。' },
  { name: 'angry', message: '似曾相识燕归来——前天的Bug，今天又回来。' },
  { name: 'thinking', message: '人生若只如初见——如果第一版需求能最后算数。' },
  { name: 'sleepy', message: '直道相思了无益——我在这里想你（下班），也是无用。' },
  { name: 'excited', message: '一片冰心在玉壶——我的心全在等周五。' },
  { name: 'sleepy', message: '莫道不消魂——帘卷西风，人比黄（Excel）瘦。' },
  { name: 'cheeky', message: '知否知否——应是绿肥红瘦（代码肥，我瘦）。' },
  { name: 'cheeky', message: '曹操：宁我负人，毋人负我——我没摸鱼，都是同事干的。' },
  { name: 'sleepy', message: '诸葛亮：鞠躬尽瘁，死而后已——我还在改bug，已经差不多了。' },
  { name: 'cheeky', message: '诸葛亮：非淡泊无以明志——我非摸摸鱼无以熬到下班。' },
  { name: 'thinking', message: '张居正：治乱之机，在于赏罚——你摸鱼时老板罚你加班。' },
  { name: 'angry', message: '张居正：天下之事，不难于立法——难在老板不让你休息。' },
  { name: 'cheeky', message: '朱元璋：高筑墙，广积粮，缓称王——高筑工位，广积零食，缓提离职。' },
  { name: 'cool', message: '秦始皇：朕为始皇帝，后世以计数——我是初代打工人，后代都是我的传人。' },
  { name: 'sleepy', message: '唐太宗：以铜为镜，可以正衣冠——以工位镜子，可以看我的黑眼圈。' },
  { name: 'surprised', message: '唐太宗：水能载舟，亦能覆舟——咖啡能醒脑，也能崩掉你的胃。' },
  { name: 'cheeky', message: '管仲：仓廪实则知礼节——工资够多，我才不摸鱼。' },
  { name: 'cheeky', message: '商鞅：疑则勿用，用则勿疑——老板怀疑我摸鱼，那我就真摸。' },
  { name: 'angry', message: '吴起：用兵之道，先治心——治一下我想离职的这颗心。' },
  { name: 'cheeky', message: '韩信：明修栈道，暗度陈仓——明面上我改代码，暗地里我摸鱼。' },
  { name: 'cheeky', message: '张良：运筹帷幄之中，决胜千里之外——我在工位里摸鱼，决定在外卖距离之内。' },
  { name: 'surprised', message: '陈平：顺风而呼，声不加疾也——顺应老板，他的声音更大。' },
  { name: 'cheeky', message: '司马光：德胜才谓之君子——我无德也无才，我就是打工人。' },
  { name: 'thinking', message: '王阳明：破山中贼易，破心中贼难——改bug容易，改你摸鱼的心难。' },
  { name: 'cheeky', message: '曾国藩：志不立，天下无可成之事——如果你不立志摸鱼，那就被迫加班。' },
  { name: 'angry', message: '李斯：泰山不让土壤，故能成其大——加班不放过一分钟，故能成其肝。' },
  { name: 'cheeky', message: '赵普：半部论语治天下——半部Excel能混一天。' },
  { name: 'sleepy', message: '苏秦：贫穷则父母不子——加班则男女朋友不理。' },
  { name: 'thinking', message: '张仪：凡天下强国，非秦而楚，非楚而秦——你除了忍，就是辞职。' },
  { name: 'cool', message: '魏征：以刚克刚，必以柔制之——跟老板硬刚，你会更刚。' },
  { name: 'angry', message: '王安石：三不足畏——你卡bug不足畏，老板加急不足法，同事嘲讽不足恤。' },
  { name: 'sleepy', message: '范仲淹：先天下之忧而忧——后天下之乐而乐（你先担忧bug，后快乐午休）。' },
  { name: 'cheeky', message: '司马光：兼听则明，偏信则暗——听老板的会加班，听自己的会摸鱼。' },
  { name: 'cool', message: '狄仁杰：宁为直折剑，犹胜曲全钩——我宁可直接请假，也不装病。' },
  { name: 'cheeky', message: '包拯：以心治民，不在酷刑——用我的心去熬加班，而不是用体重。' },
  { name: 'sleepy', message: '岳飞：精忠报国——我只想报一下我的睡眠债。' },
  { name: 'sleepy', message: '曹操：对酒当歌，人生几何——对电脑当歌，头发几何。' },
]

export default function PetMascot() {
  const location = useLocation()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const [pos, setPos] = useState({ x: window.innerWidth - 110, y: window.innerHeight - 180 })
  const [isDragging, setIsDragging] = useState(false)
  const [showBubble, setShowBubble] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [pageTipIndex, setPageTipIndex] = useState(0)
  const [isPageTip, setIsPageTip] = useState(false)
  const posRef = useRef(pos)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const bubbleTimerRef = useRef<number | null>(null)
  const dragMovedRef = useRef(false)

  const current = expressions[currentIndex]

  // 根据 pathname + search 构建子界面 PRD 键（卡片/列表/各广告类型新增页独立描述）
  const prdKey = buildPrdKey(location.pathname, location.search)

  // 获取当前页面的PRD
  const defaultPrd = getPagePRD(prdKey)
  const customTips = getCustomTips(prdKey)

  // 合并默认和自定义提示
  const currentPrd: PagePRD | null = defaultPrd ? {
    ...defaultPrd,
    ...mergeTips(defaultPrd, customTips),
  } : null

  // 路由变化时显示页面提示
  useEffect(() => {
    const tips = currentPrd?.tips || defaultPrd?.tips
    if (tips && tips.length > 0) {
      setIsPageTip(true)
      setPageTipIndex(0)
      setShowBubble(true)
      const timer = setTimeout(() => setShowBubble(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [prdKey])

  useEffect(() => {
    posRef.current = pos
  }, [pos])

  // 定时切换表情 + 弹出气泡（随机展示）
  useEffect(() => {
    const tips = currentPrd?.tips || defaultPrd?.tips
    const showBubblePeriodically = () => {
      const delay = 8000 + Math.random() * 8000
      bubbleTimerRef.current = window.setTimeout(() => {
        // 90%概率显示页面提示，10%概率显示趣味话题
        if (tips && tips.length > 0 && Math.random() < 0.9) {
          setIsPageTip(true)
          setPageTipIndex(prev => (prev + 1) % (tips.length || 1))
        } else {
          setIsPageTip(false)
          setCurrentIndex(prev => {
            let newIndex
            do {
              newIndex = Math.floor(Math.random() * expressions.length)
            } while (newIndex === prev && expressions.length > 1)
            return newIndex
          })
        }
        setShowBubble(true)
        setTimeout(() => setShowBubble(false), 4500)
        showBubblePeriodically()
      }, delay)
    }
    const firstTimer = setTimeout(() => {
      if (!isPageTip) {
        setShowBubble(true)
        setTimeout(() => setShowBubble(false), 4500)
      }
      showBubblePeriodically()
    }, 3000)
    return () => {
      clearTimeout(firstTimer)
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
    }
  }, [currentPrd, defaultPrd, isPageTip])

  // 点击 - 跳转到PRD全页查看
  const handleClick = () => {
    if (dragMovedRef.current) {
      dragMovedRef.current = false
      return
    }
    navigate(`/page-prd-view?from=${encodeURIComponent(prdKey)}`)
  }

  // 获取气泡显示内容
  const getBubbleContent = () => {
    const tips = currentPrd?.tips || defaultPrd?.tips
    if (isPageTip && tips && tips.length > 0) {
      return tips[pageTipIndex]
    }
    return current.message
  }

  // 拖拽逻辑
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragMovedRef.current = false
    const startX = e.clientX
    const startY = e.clientY
    const origPosX = posRef.current.x
    const origPosY = posRef.current.y
    dragOffsetRef.current = { x: e.clientX - origPosX, y: e.clientY - origPosY }
    let hasDragged = false

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      // 超过 5px 才算拖拽，避免微抖动吞掉点击
      if (!hasDragged && Math.abs(dx) < 5 && Math.abs(dy) < 5) return
      hasDragged = true
      dragMovedRef.current = true
      const newX = ev.clientX - dragOffsetRef.current.x
      const newY = ev.clientY - dragOffsetRef.current.y
      const maxX = window.innerWidth - 90
      const maxY = window.innerHeight - 135
      setPos({
        x: Math.max(0, Math.min(maxX, newX)),
        y: Math.max(0, Math.min(maxY, newY)),
      })
      setIsDragging(true)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setTimeout(() => setIsDragging(false), 150)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  return (
    <>
      <div
        className={`pet-mascot-wrapper ${isDragging ? 'dragging' : ''}`}
        style={{ left: pos.x, top: pos.y }}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
      >
        {showBubble && (
          <div className={`pet-bubble ${isPageTip ? 'page-tip' : ''}`}>
            <div className="pet-bubble-text">{getBubbleContent()}</div>
            <div className="pet-bubble-tail" />
          </div>
        )}
        <div className="pet-body">
          <PikachuFace expression={current.name} size={81} />
        </div>
      </div>
    </>
  )
}
