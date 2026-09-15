/**
 * 全国省市区三级联动数据
 *
 * 用于仓库维护等需要选择省-市-区/县的场景
 * 数据来源：国家统计局行政区划（简化版，覆盖主要省市）
 */

export interface DistrictItem {
  name: string
}

export interface CityItem {
  name: string
  children?: DistrictItem[]
}

export interface ProvinceItem {
  name: string
  children?: CityItem[]
}

/** 获取所有省份列表 */
export function getProvinces(data: ProvinceItem[]): string[] {
  return data.map(p => p.name)
}

/** 根据省份获取城市列表 */
export function getCities(data: ProvinceItem[], province: string): string[] {
  const p = data.find(item => item.name === province)
  return (p?.children ?? []).map(c => c.name)
}

/** 根据省份+城市获取区县列表 */
export function getDistricts(data: ProvinceItem[], province: string, city: string): string[] {
  const p = data.find(item => item.name === province)
  const c = p?.children?.find(item => item.name === city)
  return (c?.children ?? []).map(d => d.name)
}

export const regionData: ProvinceItem[] = [
  {
    name: '北京市', children: [
      { name: '北京市', children: [{ name: '东城区' }, { name: '西城区' }, { name: '朝阳区' }, { name: '丰台区' }, { name: '石景山区' }, { name: '海淀区' }, { name: '门头沟区' }, { name: '房山区' }, { name: '通州区' }, { name: '顺义区' }, { name: '昌平区' }, { name: '大兴区' }, { name: '怀柔区' }, { name: '平谷区' }, { name: '密云区' }, { name: '延庆区' }] },
    ],
  },
  {
    name: '天津市', children: [
      { name: '天津市', children: [{ name: '和平区' }, { name: '河东区' }, { name: '河西区' }, { name: '南开区' }, { name: '河北区' }, { name: '红桥区' }, { name: '东丽区' }, { name: '西青区' }, { name: '津南区' }, { name: '北辰区' }, { name: '武清区' }, { name: '宝坻区' }, { name: '滨海新区' }] },
    ],
  },
  {
    name: '上海市', children: [
      { name: '上海市', children: [{ name: '黄浦区' }, { name: '徐汇区' }, { name: '长宁区' }, { name: '静安区' }, { name: '普陀区' }, { name: '虹口区' }, { name: '杨浦区' }, { name: '闵行区' }, { name: '宝山区' }, { name: '嘉定区' }, { name: '浦东新区' }, { name: '金山区' }, { name: '松江区' }, { name: '青浦区' }, { name: '奉贤区' }, { name: '崇明区' }] },
    ],
  },
  {
    name: '重庆市', children: [
      { name: '重庆市', children: [{ name: '万州区' }, { name: '涪陵区' }, { name: '渝中区' }, { name: '大渡口区' }, { name: '江北区' }, { name: '沙坪坝区' }, { name: '九龙坡区' }, { name: '南岸区' }, { name: '北碚区' }, { name: '渝北区' }, { name: '巴南区' }, { name: '长寿区' }, { name: '江津区' }, { name: '合川区' }, { name: '永川区' }] },
    ],
  },
  {
    name: '广东省', children: [
      { name: '广州市', children: [{ name: '荔湾区' }, { name: '越秀区' }, { name: '海珠区' }, { name: '天河区' }, { name: '白云区' }, { name: '黄埔区' }, { name: '番禺区' }, { name: '花都区' }, { name: '南沙区' }, { name: '从化区' }, { name: '增城区' }] },
      { name: '深圳市', children: [{ name: '罗湖区' }, { name: '福田区' }, { name: '南山区' }, { name: '宝安区' }, { name: '龙岗区' }, { name: '盐田区' }, { name: '龙华区' }, { name: '坪山区' }, { name: '光明区' }] },
      { name: '珠海市', children: [{ name: '香洲区' }, { name: '斗门区' }, { name: '金湾区' }] },
      { name: '汕头市', children: [{ name: '金平区' }, { name: '龙湖区' }, { name: '澄海区' }, { name: '濠江区' }, { name: '潮阳区' }, { name: '潮南区' }, { name: '南澳县' }] },
      { name: '佛山市', children: [{ name: '禅城区' }, { name: '南海区' }, { name: '顺德区' }, { name: '三水区' }, { name: '高明区' }] },
      { name: '韶关市', children: [{ name: '武江区' }, { name: '浈江区' }, { name: '曲江区' }, { name: '始兴县' }, { name: '仁化县' }, { name: '翁源县' }, { name: '乳源县' }, { name: '新丰县' }, { name: '乐昌市' }, { name: '南雄市' }] },
      { name: '湛江市', children: [{ name: '赤坎区' }, { name: '霞山区' }, { name: '坡头区' }, { name: '麻章区' }, { name: '遂溪县' }, { name: '徐闻县' }, { name: '廉江市' }, { name: '雷州市' }, { name: '吴川市' }] },
      { name: '肇庆市', children: [{ name: '端州区' }, { name: '鼎湖区' }, { name: '高要区' }, { name: '广宁县' }, { name: '怀集县' }, { name: '封开县' }, { name: '德庆县' }, { name: '四会市' }] },
      { name: '江门市', children: [{ name: '蓬江区' }, { name: '江海区' }, { name: '新会区' }, { name: '台山市' }, { name: '开平市' }, { name: '鹤山市' }, { name: '恩平市' }] },
      { name: '茂名市', children: [{ name: '茂南区' }, { name: '电白区' }, { name: '高州市' }, { name: '化州市' }, { name: '信宜市' }] },
      { name: '惠州市', children: [{ name: '惠城区' }, { name: '惠阳区' }, { name: '博罗县' }, { name: '惠东县' }, { name: '龙门县' }] },
      { name: '梅州市', children: [{ name: '梅江区' }, { name: '梅县区' }, { name: '大埔县' }, { name: '丰顺县' }, { name: '五华县' }, { name: '平远县' }, { name: '蕉岭县' }, { name: '兴宁市' }] },
      { name: '汕尾市', children: [{ name: '城区' }, { name: '海丰县' }, { name: '陆河县' }, { name: '陆丰市' }] },
      { name: '河源市', children: [{ name: '源城区' }, { name: '紫金县' }, { name: '龙川县' }, { name: '连平县' }, { name: '和平县' }, { name: '东源县' }] },
      { name: '阳江市', children: [{ name: '江城区' }, { name: '阳东区' }, { name: '阳西县' }, { name: '阳春市' }] },
      { name: '清远市', children: [{ name: '清城区' }, { name: '清新区' }, { name: '佛冈县' }, { name: '阳山县' }, { name: '连山县' }, { name: '连南县' }, { name: '英德市' }, { name: '连州市' }] },
      { name: '东莞市', children: [{ name: '莞城街道' }, { name: '南城街道' }, { name: '东城街道' }, { name: '万江街道' }, { name: '石碣镇' }, { name: '长安镇' }, { name: '虎门镇' }, { name: '厚街镇' }] },
      { name: '中山市', children: [{ name: '石岐街道' }, { name: '东区街道' }, { name: '西区街道' }, { name: '南区街道' }, { name: '五桂山街道' }, { name: '小榄镇' }, { name: '古镇镇' }] },
      { name: '潮州市', children: [{ name: '湘桥区' }, { name: '潮安区' }, { name: '饶平县' }] },
      { name: '揭阳市', children: [{ name: '榕城区' }, { name: '揭东区' }, { name: '揭西县' }, { name: '惠来县' }, { name: '普宁市' }] },
      { name: '云浮市', children: [{ name: '云城区' }, { name: '云安区' }, { name: '新兴县' }, { name: '郁南县' }, { name: '罗定市' }] },
    ],
  },
  {
    name: '浙江省', children: [
      { name: '杭州市', children: [{ name: '上城区' }, { name: '拱墅区' }, { name: '西湖区' }, { name: '滨江区' }, { name: '萧山区' }, { name: '余杭区' }, { name: '临平区' }, { name: '钱塘区' }, { name: '富阳区' }, { name: '临安区' }, { name: '桐庐县' }, { name: '淳安县' }, { name: '建德市' }] },
      { name: '宁波市', children: [{ name: '海曙区' }, { name: '江北区' }, { name: '北仑区' }, { name: '镇海区' }, { name: '鄞州区' }, { name: '奉化区' }, { name: '象山县' }, { name: '宁海县' }, { name: '余姚市' }, { name: '慈溪市' }] },
      { name: '温州市', children: [{ name: '鹿城区' }, { name: '龙湾区' }, { name: '瓯海区' }, { name: '洞头区' }, { name: '瑞安市' }, { name: '乐清市' }] },
      { name: '嘉兴市', children: [{ name: '南湖区' }, { name: '秀洲区' }, { name: '海宁市' }, { name: '平湖市' }, { name: '桐乡市' }] },
      { name: '湖州市', children: [{ name: '吴兴区' }, { name: '南浔区' }, { name: '德清县' }, { name: '长兴县' }, { name: '安吉县' }] },
      { name: '绍兴市', children: [{ name: '越城区' }, { name: '柯桥区' }, { name: '上虞区' }, { name: '新昌县' }, { name: '嵊州市' }] },
      { name: '金华市', children: [{ name: '婺城区' }, { name: '金东区' }, { name: '义乌市' }, { name: '东阳市' }, { name: '永康市' }] },
      { name: '衢州市', children: [{ name: '柯城区' }, { name: '衢江区' }, { name: '江山市' }] },
      { name: '舟山市', children: [{ name: '定海区' }, { name: '普陀区' }, { name: '岱山县' }, { name: '嵊泗县' }] },
      { name: '台州市', children: [{ name: '椒江区' }, { name: '黄岩区' }, { name: '路桥区' }, { name: '临海市' }, { name: '温岭市' }] },
      { name: '丽水市', children: [{ name: '莲都区' }, { name: '龙泉市' }] },
    ],
  },
  {
    name: '江苏省', children: [
      { name: '南京市', children: [{ name: '玄武区' }, { name: '秦淮区' }, { name: '建邺区' }, { name: '鼓楼区' }, { name: '浦口区' }, { name: '栖霞区' }, { name: '雨花台区' }, { name: '江宁区' }, { name: '六合区' }, { name: '溧水区' }, { name: '高淳区' }] },
      { name: '苏州市', children: [{ name: '虎丘区' }, { name: '吴中区' }, { name: '相城区' }, { name: '姑苏区' }, { name: '吴江区' }, { name: '昆山市' }, { name: '太仓市' }, { name: '常熟市' }, { name: '张家港市' }] },
      { name: '无锡市', children: [{ name: '锡山区' }, { name: '惠山区' }, { name: '滨湖区' }, { name: '梁溪区' }, { name: '新吴区' }, { name: '江阴市' }, { name: '宜兴市' }] },
      { name: '常州市', children: [{ name: '天宁区' }, { name: '钟楼区' }, { name: '新北区' }, { name: '武进区' }, { name: '金坛区' }, { name: '溧阳市' }] },
      { name: '南通市', children: [{ name: '崇川区' }, { name: '通州区' }, { name: '海门区' }, { name: '如皋市' }, { name: '启东市' }] },
      { name: '徐州市', children: [{ name: '鼓楼区' }, { name: '云龙区' }, { name: '贾汪区' }, { name: '泉山区' }, { name: '铜山区' }] },
      { name: '扬州市', children: [{ name: '广陵区' }, { name: '邗江区' }, { name: '江都区' }] },
      { name: '盐城市', children: [{ name: '亭湖区' }, { name: '盐都区' }, { name: '大丰区' }] },
      { name: '淮安市', children: [{ name: '淮安区' }, { name: '淮阴区' }, { name: '清江浦区' }, { name: '洪泽区' }] },
      { name: '连云港市', children: [{ name: '连云区' }, { name: '海州区' }, { name: '赣榆区' }] },
      { name: '泰州市', children: [{ name: '海陵区' }, { name: '高港区' }, { name: '姜堰区' }] },
      { name: '宿迁市', children: [{ name: '宿城区' }, { name: '宿豫区' }] },
      { name: '镇江市', children: [{ name: '京口区' }, { name: '润州区' }, { name: '丹徒区' }] },
    ],
  },
  {
    name: '四川省', children: [
      { name: '成都市', children: [{ name: '锦江区' }, { name: '青羊区' }, { name: '金牛区' }, { name: '武侯区' }, { name: '成华区' }, { name: '龙泉驿区' }, { name: '青白江区' }, { name: '新都区' }, { name: '温江区' }, { name: '双流区' }, { name: '郫都区' }, { name: '新津区' }] },
      { name: '绵阳市', children: [{ name: '涪城区' }, { name: '游仙区' }, { name: '安州区' }] },
      { name: '德阳市', children: [{ name: '旌阳区' }, { name: '罗江区' }] },
      { name: '宜宾市', children: [{ name: '翠屏区' }, { name: '南溪区' }, { name: '叙州区' }] },
      { name: '南充市', children: [{ name: '顺庆区' }, { name: '高坪区' }, { name: '嘉陵区' }] },
      { name: '泸州市', children: [{ name: '江阳区' }, { name: '纳溪区' }, { name: '龙马潭区' }] },
      { name: '达州市', children: [{ name: '通川区' }, { name: '达川区' }] },
      { name: '乐山市', children: [{ name: '市中区' }, { name: '沙湾区' }, { name: '五通桥区' }] },
      { name: '自贡市', children: [{ name: '自流井区' }, { name: '贡井区' }, { name: '大安区' }, { name: '沿滩区' }] },
      { name: '内江市', children: [{ name: '市中区' }, { name: '东兴区' }] },
      { name: '遂宁市', children: [{ name: '船山区' }, { name: '安居区' }] },
      { name: '广元市', children: [{ name: '利州区' }, { name: '昭化区' }, { name: '朝天区' }] },
    ],
  },
  {
    name: '湖北省', children: [
      { name: '武汉市', children: [{ name: '江岸区' }, { name: '江汉区' }, { name: '硚口区' }, { name: '汉阳区' }, { name: '武昌区' }, { name: '青山区' }, { name: '洪山区' }, { name: '东西湖区' }, { name: '汉南区' }, { name: '蔡甸区' }, { name: '江夏区' }, { name: '黄陂区' }, { name: '新洲区' }] },
      { name: '宜昌市', children: [{ name: '西陵区' }, { name: '伍家岗区' }, { name: '点军区' }, { name: '猇亭区' }, { name: '夷陵区' }] },
      { name: '襄阳市', children: [{ name: '襄城区' }, { name: '樊城区' }, { name: '襄州区' }] },
      { name: '黄石市', children: [{ name: '黄石港区' }, { name: '西塞山区' }, { name: '下陆区' }, { name: '铁山区' }] },
      { name: '荆州市', children: [{ name: '沙市区' }, { name: '荆州区' }] },
      { name: '荆门市', children: [{ name: '东宝区' }, { name: '掇刀区' }] },
      { name: '鄂州市', children: [{ name: '鄂城区' }, { name: '华容区' }, { name: '梁子湖区' }] },
      { name: '孝感市', children: [{ name: '孝南区' }] },
      { name: '黄冈市', children: [{ name: '黄州区' }] },
      { name: '咸宁市', children: [{ name: '咸安区' }] },
      { name: '随州市', children: [{ name: '曾都区' }] },
    ],
  },
  {
    name: '湖南省', children: [
      { name: '长沙市', children: [{ name: '芙蓉区' }, { name: '天心区' }, { name: '岳麓区' }, { name: '开福区' }, { name: '雨花区' }, { name: '望城区' }, { name: '长沙县' }, { name: '浏阳市' }, { name: '宁乡市' }] },
      { name: '株洲市', children: [{ name: '天元区' }, { name: '芦淞区' }, { name: '荷塘区' }, { name: '石峰区' }, { name: '渌口区' }] },
      { name: '湘潭市', children: [{ name: '雨湖区' }, { name: '岳塘区' }, { name: '湘潭县' }] },
      { name: '衡阳市', children: [{ name: '珠晖区' }, { name: '雁峰区' }, { name: '石鼓区' }, { name: '蒸湘区' }, { name: '南岳区' }] },
      { name: '岳阳市', children: [{ name: '岳阳楼区' }, { name: '云溪区' }, { name: '君山区' }] },
      { name: '常德市', children: [{ name: '武陵区' }, { name: '鼎城区' }] },
      { name: '邵阳市', children: [{ name: '双清区' }, { name: '大祥区' }, { name: '北塔区' }] },
      { name: '益阳市', children: [{ name: '资阳区' }, { name: '赫山区' }] },
      { name: '永州市', children: [{ name: '零陵区' }, { name: '冷水滩区' }] },
      { name: '郴州市', children: [{ name: '北湖区' }, { name: '苏仙区' }] },
      { name: '怀化市', children: [{ name: '鹤城区' }] },
      { name: '娄底市', children: [{ name: '娄星区' }] },
    ],
  },
  {
    name: '河北省', children: [
      { name: '石家庄市', children: [{ name: '长安区' }, { name: '桥西区' }, { name: '新华区' }, { name: '井陉矿区' }, { name: '裕华区' }, { name: '藁城区' }, { name: '鹿泉区' }, { name: '栾城区' }] },
      { name: '唐山市', children: [{ name: '路南区' }, { name: '路北区' }, { name: '古冶区' }, { name: '开平区' }, { name: '丰南区' }, { name: '丰润区' }, { name: '曹妃甸区' }] },
      { name: '秦皇岛市', children: [{ name: '海港区' }, { name: '山海关区' }, { name: '北戴河区' }, { name: '抚宁区' }] },
      { name: '邯郸市', children: [{ name: '邯山区' }, { name: '丛台区' }, { name: '复兴区' }, { name: '峰峰矿区' }, { name: '肥乡区' }, { name: '永年区' }] },
      { name: '邢台市', children: [{ name: '襄都区' }, { name: '信都区' }, { name: '任泽区' }, { name: '南和区' }] },
      { name: '保定市', children: [{ name: '竞秀区' }, { name: '莲池区' }, { name: '满城区' }, { name: '清苑区' }, { name: '徐水区' }] },
      { name: '张家口市', children: [{ name: '桥东区' }, { name: '桥西区' }, { name: '宣化区' }, { name: '下花园区' }] },
      { name: '承德市', children: [{ name: '双桥区' }, { name: '双滦区' }, { name: '鹰手营子矿区' }] },
      { name: '沧州市', children: [{ name: '运河区' }, { name: '新华区' }] },
      { name: '廊坊市', children: [{ name: '安次区' }, { name: '广阳区' }] },
      { name: '衡水市', children: [{ name: '桃城区' }, { name: '冀州区' }] },
    ],
  },
  {
    name: '山东省', children: [
      { name: '济南市', children: [{ name: '历下区' }, { name: '市中区' }, { name: '槐荫区' }, { name: '天桥区' }, { name: '历城区' }, { name: '长清区' }, { name: '章丘区' }, { name: '济阳区' }, { name: '莱芜区' }, { name: '钢城区' }] },
      { name: '青岛市', children: [{ name: '市南区' }, { name: '市北区' }, { name: '黄岛区' }, { name: '崂山区' }, { name: '李沧区' }, { name: '城阳区' }, { name: '即墨区' }] },
      { name: '烟台市', children: [{ name: '芝罘区' }, { name: '福山区' }, { name: '牟平区' }, { name: '莱山区' }, { name: '蓬莱区' }] },
      { name: '潍坊市', children: [{ name: '潍城区' }, { name: '寒亭区' }, { name: '坊子区' }, { name: '奎文区' }] },
      { name: '淄博市', children: [{ name: '淄川区' }, { name: '张店区' }, { name: '博山区' }, { name: '临淄区' }, { name: '周村区' }] },
      { name: '威海市', children: [{ name: '环翠区' }, { name: '文登区' }] },
      { name: '济宁市', children: [{ name: '任城区' }, { name: '兖州区' }] },
      { name: '泰安市', children: [{ name: '泰山区' }, { name: '岱岳区' }] },
      { name: '临沂市', children: [{ name: '兰山区' }, { name: '罗庄区' }, { name: '河东区' }] },
      { name: '德州市', children: [{ name: '德城区' }, { name: '陵城区' }] },
      { name: '聊城市', children: [{ name: '东昌府区' }, { name: '茌平区' }] },
      { name: '滨州市', children: [{ name: '滨城区' }, { name: '沾化区' }] },
      { name: '菏泽市', children: [{ name: '牡丹区' }, { name: '定陶区' }] },
      { name: '枣庄市', children: [{ name: '市中区' }, { name: '薛城区' }, { name: '峄城区' }, { name: '台儿庄区' }, { name: '山亭区' }] },
      { name: '东营市', children: [{ name: '东营区' }, { name: '河口区' }, { name: '垦利区' }] },
      { name: '日照市', children: [{ name: '东港区' }, { name: '岚山区' }] },
    ],
  },
  {
    name: '福建省', children: [
      { name: '福州市', children: [{ name: '鼓楼区' }, { name: '台江区' }, { name: '仓山区' }, { name: '马尾区' }, { name: '晋安区' }, { name: '长乐区' }, { name: '闽侯县' }] },
      { name: '厦门市', children: [{ name: '思明区' }, { name: '湖里区' }, { name: '集美区' }, { name: '海沧区' }, { name: '同安区' }, { name: '翔安区' }] },
      { name: '泉州市', children: [{ name: '鲤城区' }, { name: '丰泽区' }, { name: '洛江区' }, { name: '泉港区' }] },
      { name: '漳州市', children: [{ name: '芗城区' }, { name: '龙文区' }, { name: '龙海区' }, { name: '长泰区' }] },
      { name: '莆田市', children: [{ name: '城厢区' }, { name: '涵江区' }, { name: '荔城区' }, { name: '秀屿区' }] },
      { name: '三明市', children: [{ name: '三元区' }, { name: '沙县区' }] },
      { name: '南平市', children: [{ name: '延平区' }, { name: '建阳区' }] },
      { name: '龙岩市', children: [{ name: '新罗区' }, { name: '永定区' }] },
      { name: '宁德市', children: [{ name: '蕉城区' }] },
    ],
  },
  {
    name: '河南省', children: [
      { name: '郑州市', children: [{ name: '中原区' }, { name: '二七区' }, { name: '管城区' }, { name: '金水区' }, { name: '上街区' }, { name: '惠济区' }, { name: '中牟县' }, { name: '巩义市' }, { name: '荥阳市' }, { name: '新密市' }, { name: '新郑市' }, { name: '登封市' }] },
      { name: '洛阳市', children: [{ name: '老城区' }, { name: '西工区' }, { name: '瀍河区' }, { name: '涧西区' }, { name: '洛龙区' }, { name: '偃师区' }, { name: '孟津区' }] },
      { name: '开封市', children: [{ name: '龙亭区' }, { name: '顺河区' }, { name: '鼓楼区' }, { name: '禹王台区' }, { name: '祥符区' }] },
      { name: '南阳市', children: [{ name: '宛城区' }, { name: '卧龙区' }] },
      { name: '安阳市', children: [{ name: '文峰区' }, { name: '北关区' }, { name: '殷都区' }, { name: '龙安区' }] },
      { name: '新乡市', children: [{ name: '红旗区' }, { name: '卫滨区' }, { name: '凤泉区' }, { name: '牧野区' }] },
      { name: '许昌市', children: [{ name: '魏都区' }, { name: '建安区' }] },
      { name: '平顶山市', children: [{ name: '新华区' }, { name: '卫东区' }, { name: '石龙区' }, { name: '湛河区' }] },
      { name: '信阳市', children: [{ name: '浉河区' }, { name: '平桥区' }] },
      { name: '焦作市', children: [{ name: '解放区' }, { name: '中站区' }, { name: '马村区' }, { name: '山阳区' }] },
      { name: '商丘市', children: [{ name: '梁园区' }, { name: '睢阳区' }] },
      { name: '驻马店市', children: [{ name: '驿城区' }] },
      { name: '周口市', children: [{ name: '川汇区' }, { name: '淮阳区' }] },
    ],
  },
  {
    name: '辽宁省', children: [
      { name: '沈阳市', children: [{ name: '和平区' }, { name: '沈河区' }, { name: '大东区' }, { name: '皇姑区' }, { name: '铁西区' }, { name: '苏家屯区' }, { name: '浑南区' }, { name: '沈北新区' }, { name: '于洪区' }] },
      { name: '大连市', children: [{ name: '中山区' }, { name: '西岗区' }, { name: '沙河口区' }, { name: '甘井子区' }, { name: '旅顺口区' }, { name: '金州区' }, { name: '普兰店区' }] },
      { name: '鞍山市', children: [{ name: '铁东区' }, { name: '铁西区' }, { name: '立山区' }, { name: '千山区' }] },
      { name: '抚顺市', children: [{ name: '新抚区' }, { name: '东洲区' }, { name: '望花区' }, { name: '顺城区' }] },
      { name: '本溪市', children: [{ name: '平山区' }, { name: '溪湖区' }, { name: '明山区' }, { name: '南芬区' }] },
      { name: '丹东市', children: [{ name: '元宝区' }, { name: '振兴区' }, { name: '振安区' }] },
      { name: '锦州市', children: [{ name: '古塔区' }, { name: '凌河区' }, { name: '太和区' }] },
      { name: '营口市', children: [{ name: '站前区' }, { name: '西市区' }, { name: '鲅鱼圈区' }, { name: '老边区' }] },
      { name: '阜新市', children: [{ name: '海州区' }, { name: '新邱区' }, { name: '太平区' }, { name: '清河门区' }, { name: '细河区' }] },
      { name: '辽阳市', children: [{ name: '白塔区' }, { name: '文圣区' }, { name: '宏伟区' }, { name: '弓长岭区' }, { name: '太子河区' }] },
      { name: '盘锦市', children: [{ name: '双台子区' }, { name: '兴隆台区' }, { name: '大洼区' }] },
      { name: '铁岭市', children: [{ name: '银州区' }, { name: '清河区' }] },
      { name: '朝阳市', children: [{ name: '双塔区' }, { name: '龙城区' }] },
      { name: '葫芦岛市', children: [{ name: '连山区' }, { name: '龙港区' }, { name: '南票区' }] },
    ],
  },
  {
    name: '陕西省', children: [
      { name: '西安市', children: [{ name: '新城区' }, { name: '碑林区' }, { name: '莲湖区' }, { name: '灞桥区' }, { name: '未央区' }, { name: '雁塔区' }, { name: '阎良区' }, { name: '临潼区' }, { name: '长安区' }, { name: '高陵区' }, { name: '鄠邑区' }] },
      { name: '宝鸡市', children: [{ name: '渭滨区' }, { name: '金台区' }, { name: '陈仓区' }] },
      { name: '咸阳市', children: [{ name: '秦都区' }, { name: '杨陵区' }, { name: '渭城区' }] },
      { name: '铜川市', children: [{ name: '王益区' }, { name: '印台区' }, { name: '耀州区' }] },
      { name: '渭南市', children: [{ name: '临渭区' }, { name: '华州区' }] },
      { name: '延安市', children: [{ name: '宝塔区' }, { name: '安塞区' }] },
      { name: '榆林市', children: [{ name: '榆阳区' }, { name: '横山区' }] },
      { name: '汉中市', children: [{ name: '汉台区' }, { name: '南郑区' }] },
      { name: '安康市', children: [{ name: '汉滨区' }] },
      { name: '商洛市', children: [{ name: '商州区' }] },
    ],
  },
  {
    name: '江西省', children: [
      { name: '南昌市', children: [{ name: '东湖区' }, { name: '西湖区' }, { name: '青云谱区' }, { name: '青山湖区' }, { name: '新建区' }, { name: '红谷滩区' }] },
      { name: '九江市', children: [{ name: '濂溪区' }, { name: '浔阳区' }, { name: '柴桑区' }] },
      { name: '赣州市', children: [{ name: '章贡区' }, { name: '南康区' }, { name: '赣县区' }] },
      { name: '景德镇市', children: [{ name: '昌江区' }, { name: '珠山区' }] },
      { name: '萍乡市', children: [{ name: '安源区' }, { name: '湘东区' }] },
      { name: '新余市', children: [{ name: '渝水区' }] },
      { name: '鹰潭市', children: [{ name: '月湖区' }, { name: '余江区' }] },
      { name: '宜春市', children: [{ name: '袁州区' }] },
      { name: '上饶市', children: [{ name: '信州区' }, { name: '广丰区' }, { name: '广信区' }] },
      { name: '吉安市', children: [{ name: '吉州区' }, { name: '青原区' }] },
      { name: '抚州市', children: [{ name: '临川区' }, { name: '东乡区' }] },
    ],
  },
  {
    name: '安徽省', children: [
      { name: '合肥市', children: [{ name: '瑶海区' }, { name: '庐阳区' }, { name: '蜀山区' }, { name: '包河区' }, { name: '长丰县' }, { name: '肥东县' }, { name: '肥西县' }] },
      { name: '芜湖市', children: [{ name: '镜湖区' }, { name: '弋江区' }, { name: '鸠江区' }, { name: '湾沚区' }] },
      { name: '蚌埠市', children: [{ name: '龙子湖区' }, { name: '蚌山区' }, { name: '禹会区' }, { name: '淮上区' }] },
      { name: '淮南市', children: [{ name: '大通区' }, { name: '田家庵区' }, { name: '谢家集区' }, { name: '八公山区' }, { name: '潘集区' }] },
      { name: '马鞍山市', children: [{ name: '花山区' }, { name: '雨山区' }, { name: '博望区' }] },
      { name: '安庆市', children: [{ name: '迎江区' }, { name: '大观区' }, { name: '宜秀区' }] },
      { name: '阜阳市', children: [{ name: '颍州区' }, { name: '颍东区' }, { name: '颍泉区' }] },
      { name: '宿州市', children: [{ name: '埇桥区' }] },
      { name: '滁州市', children: [{ name: '琅琊区' }, { name: '南谯区' }] },
      { name: '六安市', children: [{ name: '金安区' }, { name: '裕安区' }, { name: '叶集区' }] },
      { name: '宣城市', children: [{ name: '宣州区' }] },
      { name: '池州市', children: [{ name: '贵池区' }] },
      { name: '亳州市', children: [{ name: '谯城区' }] },
      { name: '黄山市', children: [{ name: '屯溪区' }, { name: '黄山区' }, { name: '徽州区' }] },
    ],
  },
  {
    name: '广西壮族自治区', children: [
      { name: '南宁市', children: [{ name: '兴宁区' }, { name: '青秀区' }, { name: '江南区' }, { name: '西乡塘区' }, { name: '良庆区' }, { name: '邕宁区' }, { name: '武鸣区' }] },
      { name: '柳州市', children: [{ name: '城中区' }, { name: '鱼峰区' }, { name: '柳南区' }, { name: '柳北区' }, { name: '柳江区' }] },
      { name: '桂林市', children: [{ name: '秀峰区' }, { name: '叠彩区' }, { name: '象山区' }, { name: '七星区' }, { name: '雁山区' }, { name: '临桂区' }, { name: '阳朔县' }] },
      { name: '梧州市', children: [{ name: '万秀区' }, { name: '长洲区' }, { name: '龙圩区' }] },
      { name: '北海市', children: [{ name: '海城区' }, { name: '银海区' }, { name: '铁山港区' }] },
      { name: '防城港市', children: [{ name: '港口区' }, { name: '防城区' }] },
      { name: '钦州市', children: [{ name: '钦南区' }, { name: '钦北区' }] },
      { name: '贵港市', children: [{ name: '港北区' }, { name: '港南区' }, { name: '覃塘区' }] },
      { name: '玉林市', children: [{ name: '玉州区' }, { name: '福绵区' }] },
      { name: '百色市', children: [{ name: '右江区' }, { name: '田阳区' }] },
      { name: '贺州市', children: [{ name: '八步区' }, { name: '平桂区' }] },
      { name: '河池市', children: [{ name: '金城江区' }, { name: '宜州区' }] },
      { name: '来宾市', children: [{ name: '兴宾区' }] },
      { name: '崇左市', children: [{ name: '江州区' }] },
    ],
  },
  {
    name: '云南省', children: [
      { name: '昆明市', children: [{ name: '五华区' }, { name: '盘龙区' }, { name: '官渡区' }, { name: '西山区' }, { name: '东川区' }, { name: '呈贡区' }, { name: '晋宁区' }] },
      { name: '曲靖市', children: [{ name: '麒麟区' }, { name: '沾益区' }, { name: '马龙区' }] },
      { name: '大理市', children: [{ name: '大理镇' }, { name: '下关镇' }] },
      { name: '玉溪市', children: [{ name: '红塔区' }, { name: '江川区' }] },
      { name: '丽江市', children: [{ name: '古城区' }] },
      { name: '普洱市', children: [{ name: '思茅区' }] },
      { name: '临沧市', children: [{ name: '临翔区' }] },
      { name: '保山市', children: [{ name: '隆阳区' }] },
      { name: '昭通市', children: [{ name: '昭阳区' }] },
    ],
  },
  {
    name: '贵州省', children: [
      { name: '贵阳市', children: [{ name: '南明区' }, { name: '云岩区' }, { name: '花溪区' }, { name: '乌当区' }, { name: '白云区' }, { name: '观山湖区' }] },
      { name: '遵义市', children: [{ name: '红花岗区' }, { name: '汇川区' }, { name: '播州区' }] },
      { name: '六盘水市', children: [{ name: '钟山区' }, { name: '六枝特区' }] },
      { name: '安顺市', children: [{ name: '西秀区' }, { name: '平坝区' }] },
      { name: '毕节市', children: [{ name: '七星关区' }] },
      { name: '铜仁市', children: [{ name: '碧江区' }, { name: '万山区' }] },
    ],
  },
  {
    name: '山西省', children: [
      { name: '太原市', children: [{ name: '小店区' }, { name: '迎泽区' }, { name: '杏花岭区' }, { name: '尖草坪区' }, { name: '万柏林区' }, { name: '晋源区' }] },
      { name: '大同市', children: [{ name: '平城区' }, { name: '云冈区' }, { name: '新荣区' }, { name: '云州区' }] },
      { name: '阳泉市', children: [{ name: '城区' }, { name: '矿区' }, { name: '郊区' }] },
      { name: '长治市', children: [{ name: '潞州区' }, { name: '上党区' }, { name: '屯留区' }, { name: '潞城区' }] },
      { name: '晋城市', children: [{ name: '城区' }, { name: '沁水县' }, { name: '阳城县' }, { name: '泽州县' }] },
      { name: '朔州市', children: [{ name: '朔城区' }, { name: '平鲁区' }] },
      { name: '晋中市', children: [{ name: '榆次区' }, { name: '太谷区' }] },
      { name: '运城市', children: [{ name: '盐湖区' }] },
      { name: '忻州市', children: [{ name: '忻府区' }] },
      { name: '临汾市', children: [{ name: '尧都区' }] },
      { name: '吕梁市', children: [{ name: '离石区' }] },
    ],
  },
  {
    name: '内蒙古自治区', children: [
      { name: '呼和浩特市', children: [{ name: '新城区' }, { name: '回民区' }, { name: '玉泉区' }, { name: '赛罕区' }] },
      { name: '包头市', children: [{ name: '东河区' }, { name: '昆都仑区' }, { name: '青山区' }, { name: '石拐区' }, { name: '白云矿区' }, { name: '九原区' }] },
      { name: '乌海市', children: [{ name: '海勃湾区' }, { name: '海南区' }, { name: '乌达区' }] },
      { name: '赤峰市', children: [{ name: '红山区' }, { name: '元宝山区' }, { name: '松山区' }] },
      { name: '通辽市', children: [{ name: '科尔沁区' }] },
      { name: '鄂尔多斯市', children: [{ name: '东胜区' }, { name: '康巴什区' }] },
      { name: '呼伦贝尔市', children: [{ name: '海拉尔区' }, { name: '扎赉诺尔区' }] },
    ],
  },
  {
    name: '吉林省', children: [
      { name: '长春市', children: [{ name: '南关区' }, { name: '宽城区' }, { name: '朝阳区' }, { name: '二道区' }, { name: '绿园区' }, { name: '双阳区' }, { name: '九台区' }] },
      { name: '吉林市', children: [{ name: '昌邑区' }, { name: '龙潭区' }, { name: '船营区' }, { name: '丰满区' }] },
      { name: '四平市', children: [{ name: '铁西区' }, { name: '铁东区' }] },
      { name: '辽源市', children: [{ name: '龙山区' }, { name: '西安区' }] },
      { name: '通化市', children: [{ name: '东昌区' }, { name: '二道江区' }] },
      { name: '白山市', children: [{ name: '浑江区' }, { name: '江源区' }] },
      { name: '松原市', children: [{ name: '宁江区' }] },
      { name: '白城市', children: [{ name: '洮北区' }] },
    ],
  },
  {
    name: '黑龙江省', children: [
      { name: '哈尔滨市', children: [{ name: '道里区' }, { name: '南岗区' }, { name: '道外区' }, { name: '平房区' }, { name: '松北区' }, { name: '香坊区' }, { name: '呼兰区' }, { name: '阿城区' }, { name: '双城区' }] },
      { name: '齐齐哈尔市', children: [{ name: '龙沙区' }, { name: '建华区' }, { name: '铁锋区' }, { name: '昂昂溪区' }, { name: '富拉尔基区' }] },
      { name: '牡丹江市', children: [{ name: '东安区' }, { name: '阳明区' }, { name: '爱民区' }, { name: '西安区' }] },
      { name: '佳木斯市', children: [{ name: '向阳区' }, { name: '前进区' }, { name: '东风区' }, { name: '郊区' }] },
      { name: '大庆市', children: [{ name: '萨尔图区' }, { name: '龙凤区' }, { name: '让胡路区' }, { name: '红岗区' }, { name: '大同区' }] },
      { name: '鸡西市', children: [{ name: '鸡冠区' }] },
      { name: '双鸭山市', children: [{ name: '尖山区' }] },
      { name: '伊春市', children: [{ name: '伊美区' }] },
      { name: '七台河市', children: [{ name: '桃山区' }] },
      { name: '鹤岗市', children: [{ name: '向阳区' }] },
      { name: '绥化市', children: [{ name: '北林区' }] },
    ],
  },
  {
    name: '甘肃省', children: [
      { name: '兰州市', children: [{ name: '城关区' }, { name: '七里河区' }, { name: '西固区' }, { name: '安宁区' }, { name: '红古区' }] },
      { name: '嘉峪关市', children: [{ name: '雄关区' }, { name: '长城区' }, { name: '镜铁区' }] },
      { name: '金昌市', children: [{ name: '金川区' }] },
      { name: '白银市', children: [{ name: '白银区' }, { name: '平川区' }] },
      { name: '天水市', children: [{ name: '秦州区' }, { name: '麦积区' }] },
      { name: '武威市', children: [{ name: '凉州区' }] },
      { name: '张掖市', children: [{ name: '甘州区' }] },
      { name: '酒泉市', children: [{ name: '肃州区' }] },
      { name: '庆阳市', children: [{ name: '西峰区' }] },
      { name: '定西市', children: [{ name: '安定区' }] },
      { name: '陇南市', children: [{ name: '武都区' }] },
    ],
  },
  {
    name: '宁夏回族自治区', children: [
      { name: '银川市', children: [{ name: '兴庆区' }, { name: '西夏区' }, { name: '金凤区' }] },
      { name: '石嘴山市', children: [{ name: '大武口区' }, { name: '惠农区' }] },
      { name: '吴忠市', children: [{ name: '利通区' }, { name: '红寺堡区' }] },
      { name: '固原市', children: [{ name: '原州区' }] },
      { name: '中卫市', children: [{ name: '沙坡头区' }] },
    ],
  },
  {
    name: '青海省', children: [
      { name: '西宁市', children: [{ name: '城东区' }, { name: '城中区' }, { name: '城西区' }, { name: '城北区' }, { name: '湟中区' }] },
      { name: '海东市', children: [{ name: '乐都区' }, { name: '平安区' }] },
    ],
  },
  {
    name: '西藏自治区', children: [
      { name: '拉萨市', children: [{ name: '城关区' }, { name: '堆龙德庆区' }, { name: '达孜区' }] },
      { name: '日喀则市', children: [{ name: '桑珠孜区' }] },
      { name: '昌都市', children: [{ name: '卡若区' }] },
      { name: '林芝市', children: [{ name: '巴宜区' }] },
      { name: '山南市', children: [{ name: '乃东区' }] },
      { name: '那曲市', children: [{ name: '色尼区' }] },
    ],
  },
  {
    name: '海南省', children: [
      { name: '海口市', children: [{ name: '秀英区' }, { name: '龙华区' }, { name: '琼山区' }, { name: '美兰区' }] },
      { name: '三亚市', children: [{ name: '海棠区' }, { name: '吉阳区' }, { name: '天涯区' }, { name: '崖州区' }] },
      { name: '三沙市', children: [{ name: '西沙区' }, { name: '南沙区' }] },
      { name: '儋州市', children: [{ name: '那大镇' }, { name: '中和镇' }] },
    ],
  },
  {
    name: '新疆维吾尔自治区', children: [
      { name: '乌鲁木齐市', children: [{ name: '天山区' }, { name: '沙依巴克区' }, { name: '新市区' }, { name: '水磨沟区' }, { name: '头屯河区' }, { name: '达坂城区' }, { name: '米东区' }] },
      { name: '克拉玛依市', children: [{ name: '独山子区' }, { name: '克拉玛依区' }, { name: '白碱滩区' }, { name: '乌尔禾区' }] },
      { name: '吐鲁番市', children: [{ name: '高昌区' }] },
      { name: '哈密市', children: [{ name: '伊州区' }] },
      { name: '昌吉市', children: [{ name: '昌吉镇' }] },
      { name: '库尔勒市', children: [{ name: '库尔勒镇' }] },
      { name: '喀什市', children: [{ name: '喀什镇' }] },
    ],
  },
  {
    name: '香港特别行政区', children: [
      { name: '香港', children: [{ name: '中西区' }, { name: '湾仔区' }, { name: '东区' }, { name: '南区' }, { name: '油尖旺区' }, { name: '深水埗区' }, { name: '九龙城区' }, { name: '黄大仙区' }, { name: '观塘区' }, { name: '荃湾区' }, { name: '葵青区' }, { name: '沙田区' }, { name: '西贡区' }, { name: '大埔区' }, { name: '北区' }, { name: '元朗区' }, { name: '屯门区' }, { name: '离岛区' }] },
    ],
  },
  {
    name: '澳门特别行政区', children: [
      { name: '澳门', children: [{ name: '花地玛堂区' }, { name: '花王堂区' }, { name: '望德堂区' }, { name: '大堂区' }, { name: '风顺堂区' }, { name: '嘉模堂区' }, { name: '路凼填海区' }, { name: '圣方济各堂区' }] },
    ],
  },
]
