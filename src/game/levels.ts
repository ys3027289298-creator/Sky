import { v } from '../core/math';
import type { EnemyKind, MissionId } from '../core/types';

export interface SpawnEnemy { kind: EnemyKind; pos: [number, number, number]; }
export interface LevelDef {
  id: MissionId;
  regionIndex: number;
  playerStart: [number, number, number];
  evac: [number, number, number];
  asteroids: number;
  asteroidsCenter: [number, number, number];
  asteroidsSpread: number;
  hasStation: boolean;
  stationPos?: [number, number, number];
  enemies: SpawnEnemy[];
  /** 增援波次延迟生成 */
  reinforcementKinds: EnemyKind[];
}

export const LEVELS: LevelDef[] = [
  {
    id: 'recon',
    regionIndex: 0,
    playerStart: [0, 0, 0],
    evac: [0, 0, 60],
    asteroids: 60,
    asteroidsCenter: [0, 0, -350],
    asteroidsSpread: 230,
    hasStation: false,
    enemies: [
      { kind: 'scout', pos: [40, 10, -260] },
      { kind: 'scout', pos: [-60, -20, -340] },
      { kind: 'scout', pos: [80, 30, -420] },
      { kind: 'interceptor', pos: [-30, 10, -460] }
    ],
    reinforcementKinds: ['scout', 'interceptor']
  },
  {
    id: 'escort',
    regionIndex: 0,
    playerStart: [0, 0, 0],
    evac: [0, 0, -700],
    asteroids: 80,
    asteroidsCenter: [0, 20, -400],
    asteroidsSpread: 280,
    hasStation: false,
    enemies: [
      { kind: 'interceptor', pos: [60, 0, -250] },
      { kind: 'interceptor', pos: [-70, 20, -320] },
      { kind: 'scout', pos: [30, -30, -420] },
      { kind: 'gunship', pos: [0, 40, -520] },
      { kind: 'defense', pos: [-40, 10, -560] }
    ],
    reinforcementKinds: ['interceptor', 'interceptor', 'scout']
  },
  {
    id: 'station',
    regionIndex: 1,
    playerStart: [420, 20, -650],
    evac: [220, 60, -620],
    asteroids: 40,
    asteroidsCenter: [420, 20, -900],
    asteroidsSpread: 200,
    hasStation: true,
    stationPos: [420, 20, -920],
    enemies: [
      { kind: 'defense', pos: [460, 40, -880] },
      { kind: 'defense', pos: [380, -20, -940] },
      { kind: 'gunship', pos: [420, 60, -980] },
      { kind: 'interceptor', pos: [470, 0, -850] },
      { kind: 'interceptor', pos: [370, 40, -960] }
    ],
    reinforcementKinds: ['defense', 'interceptor']
  },
  {
    id: 'final',
    regionIndex: 2,
    playerStart: [-420, -30, -1180],
    evac: [-200, 60, -1120],
    asteroids: 50,
    asteroidsCenter: [-420, -30, -1500],
    asteroidsSpread: 240,
    hasStation: false,
    enemies: [
      { kind: 'interceptor', pos: [-380, 0, -1350] },
      { kind: 'interceptor', pos: [-470, -40, -1400] },
      { kind: 'gunship', pos: [-420, 40, -1450] },
      { kind: 'defense', pos: [-360, -20, -1480] },
      { kind: 'defense', pos: [-480, 20, -1520] },
      { kind: 'command', pos: [-420, 0, -1650] }
    ],
    reinforcementKinds: ['interceptor', 'gunship']
  }
];

export { v };
