// data-model.md の全型。永続化先は localStorage のみで、DB スキーマは存在しない。

export type SkillId = 'investigate' | 'combat' | 'persuade' | 'escape' | 'occult' | 'stealth';

export const SKILL_IDS: readonly SkillId[] = [
  'investigate',
  'combat',
  'persuade',
  'escape',
  'occult',
  'stealth',
] as const;

/** プレイヤーが毎ターン 4 択から選ぶ行動の方向性（FR-006 / FR-030） */
export const DIRECTIONS = ['observe', 'attack', 'engage', 'withdraw'] as const;

export type Direction = (typeof DIRECTIONS)[number];

/** 描写テンプレートのキーになる段階。turn から導出し、GameState には保存しない */
export type EntityStage = 'appearance' | 'agitation' | 'frenzy';

export type Outcome =
  | 'critical_success'
  | 'success'
  | 'failure'
  | 'fumble'
  | 'ambiguous' // confidence < 0.5、またはフォールバック
  | 'meta'; // meta_cheat。ゲーム内の出来事として処理する

/** `skills` は各技能 5〜80 で全 SkillId を網羅、`items` は 1〜3 個、`hp`/`sanity` は初期 10・範囲 0〜10 */
export type Investigator = {
  occupation: string;
  skills: Record<SkillId, number>;
  items: string[];
  /** 演出用。判定には使わない。秘密（エンディングで開示） */
  secret: string;
  hp: number;
  sanity: number;
};

export type Weakness = {
  id: string;
  label: string;
  requiredClueIds: string[];
};

/** epithet と appearance のみ可視。それ以外は秘密 */
export type Entity = {
  epithet: string;
  appearance: string;
  nature: string;
  purpose: string;
  weakness: Weakness;
  manifestation: string;
};

/** 全フィールドが秘密。FR-003 によりクライアントへ一切送らない */
export type ClearCondition = {
  id: string;
  description: string;
  /** 1〜3 個 */
  requiredClueIds: string[];
};

export type Clue = {
  id: string;
  text: string;
  hints: ('nature' | 'purpose' | 'weakness')[];
};

export type LogEntry = {
  turn: number;
  direction: Direction;
  /** 添えられた詳細（空文字もありうる） */
  detail: string;
  outcome: Outcome;
  /** テンプレート展開済み */
  narration: string;
  delta: { hp: number; sanity: number; clueId: string | null };
};

export type Ending = {
  reason: 'clear' | 'death' | 'madness' | 'timeout';
  text: string;
  reveal: { nature: string; purpose: string; weakness: string; secret: string };
};

export const MAX_TURN = 8;

/** 封緘される全体状態。turn は 1〜8 */
export type GameState = {
  /** スキーマ版。不一致なら開封を失敗扱いにする */
  version: number;
  investigator: Investigator;
  entity: Entity;
  clearCondition: ClearCondition;
  clues: Record<string, Clue>;
  turn: number;
  acquiredClueIds: string[];
  log: LogEntry[];
  ending: Ending | null;
};

/** GameState から秘密を落とした投影 */
export type VisibleState = {
  occupation: string;
  skills: Record<SkillId, number>;
  items: string[];
  hp: number;
  sanity: number;
  turn: number;
  maxTurn: typeof MAX_TURN;
  /** 怪異の現在の様子（テンプレート展開済み） */
  scene: string;
  entityEpithet: string;
  entityAppearance: string;
  acquiredClues: { id: string; text: string }[];
  log: LogEntry[];
  ending: Ending | null;
};

/** Jev の生応答をコード側で正規化した値。これ自体はゲーム状態を変えない（Constitution I） */
export type Judgment = {
  skill: SkillId;
  /** score 0..4（小数。使用時に丸める） */
  plausibility: number;
  /** score 0..3（小数） */
  horrorExposure: number;
  exploitsWeakness: boolean;
  meetsClear: boolean;
  metaCheat: boolean;
  /** skill の confidence 0..1（欠損時は 0） */
  confidence: number;
  source: 'jev' | 'fallback';
};

/** Jev に渡す最小限の情報（contracts/jev-questions.md） */
export type JevState = {
  scene: string;
  investigator: {
    occupation: string;
    skills: Record<SkillId, number>;
    items: string[];
    hp: number;
    sanity: number;
  };
  acquiredClues: string[];
  action: {
    direction: Direction;
    /** プレイヤーの入力（そのまま。連結・加工しない。空文字もありうる） */
    detail: string;
  };
};
