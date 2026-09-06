export type BiomeId = 'countryside' | 'forest' | 'coast' | 'snow' | 'desert';
export type TrainId = 'steam' | 'express' | 'freight' | 'metro' | 'tram' | 'sleeper' | 'mountain' | 'classic' | 'maintenance';
export interface DoorSpec { x: number; y: number; width: number; height: number }
export interface TrainSpec { id: TrainId; name: string; note: string; fact: string; color: string; door?: DoorSpec; }
export const asset = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`;
export const trains: TrainSpec[] = [
  { id: 'steam', name: '蒸汽火车', note: '呜——冒着蒸汽出发', fact: '蒸汽火车用蒸汽的力量，让车轮转起来。', color: '#e79a65', door: { x:.04574,y:.36162,width:.02533,height:.37638 } },
  { id: 'express', name: '高速列车', note: '长长车头，跑向远方', fact: '高速列车用电来行驶，能载着大家去远方。', color:'#91b9d2', door: { x:.77131,y:.2246,width:.02911,height:.5187 } },
  { id: 'freight', name: '货运火车', note: '木材和货物交给我', fact: '货运火车的车厢，可以装木材和集装箱。', color:'#95b39c', door: { x:.69586,y:.11905,width:.02552,height:.52857 } },
  { id: 'metro', name: '地铁列车', note: '城市里的好帮手', fact: '地铁帮助大家在城市里出行，有些路段在地下，有些在地面上。', color:'#8bc6be', door: {"x": 0.070915, "y": 0.227778, "width": 0.060637, "height": 0.522222} },
  { id: 'tram', name: '有轨电车', note: '沿着街道慢慢走', fact: '有轨电车也沿着轨道行驶，在一些城市的街道上能看到它。', color:'#e3bd70', door: {"x": 0.368692, "y": 0.40081, "width": 0.047374, "height": 0.510121} },
  { id: 'sleeper', name: '卧铺列车', note: '睡一觉，去远方', fact: '卧铺车厢里有小床，乘客可以躺下来休息。', color:'#96a4c4', door: {"x": 0.507538, "y": 0.282723, "width": 0.028141, "height": 0.481675} },
  { id: 'mountain', name: '山地列车', note: '去看看高高的山', fact: '有些山地铁路会用特别的齿轨，帮助列车爬上陡坡。', color:'#d69d87', door: {"x": 0.743175, "y": 0.19209, "width": 0.040445, "height": 0.638418} },
  { id: 'classic', name: '经典客车', note: '载着大家去旅行', fact: '客运列车载着乘客旅行，一节一节的车厢连接在一起。', color:'#a6bb94', door: {"x": 0.033333, "y": 0.283422, "width": 0.028283, "height": 0.497326} },
  { id: 'maintenance', name: '铁路工程车', note: '照顾铁路的小帮手', fact: '铁路工程车帮助工作人员检查、维护和修理铁路。', color:'#debf65', door: {"x": 0.841785, "y": 0.315315, "width": 0.030426, "height": 0.405405} },
];
export const biomes: Record<BiomeId, { name:string; icon:string; fact:string; color:string }> = {
 countryside: {name:'田野小镇',icon:'🏡',fact:'火车沿着轨道，经过绿绿的田野。',color:'#b5cd91'},
 forest: {name:'森林瀑布',icon:'🌲',fact:'听，森林里有小鸟，远处还有瀑布。',color:'#83af91'},
 coast: {name:'蓝色海岸',icon:'🌊',fact:'海边的灯塔，帮助船只辨认方向。',color:'#8fbfd1'},
 snow: {name:'雪山世界',icon:'🏔️',fact:'白白的雪盖住了山顶，像一顶大帽子。',color:'#b4c7d3'},
 desert: {name:'金色沙漠',icon:'🏜️',fact:'沙漠里很干燥，有些植物能储存水分。',color:'#d9b280'},
};
export const journeys: {id:string;name:string;icon:string;stops:BiomeId[]}[] = [
 {id:'explore',name:'环游小世界',icon:'🌍',stops:['countryside','forest','coast','desert','snow','forest','countryside']},
 {id:'woodland',name:'森林探险',icon:'🌲',stops:['countryside','forest','forest','snow','forest','countryside']},
 {id:'seaside',name:'追着海风跑',icon:'🌊',stops:['countryside','coast','coast','desert','coast','countryside']},
 {id:'snowland',name:'雪山旅行',icon:'🏔️',stops:['countryside','forest','snow','snow','forest','countryside']},
];
