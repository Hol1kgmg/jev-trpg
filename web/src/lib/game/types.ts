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

export type ActionType =
  | 'investigate'
  | 'combat'
  | 'persuade'
  | 'escape'
  | 'ritual'
  | 'hide'
  | 'other';

export const ACTION_TYPES: readonly ActionType[] = [
  'investigate',
  'combat',
  'persuade',
  'escape',
  'ritual',
  'hide',
  'other',
] as const;

export type Outcome =
  | 'critical_success'
  | 'success'
  | 'failure'
  | 'fumble'
  | 'ambiguous' // confidence < 0.5、またはフォールバック
  | 'meta'; // meta_cheat。ゲーム内の出来事として処理する

export type LocationId = string;

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

/** epithet のみ可視。それ以外は秘密 */
export type Entity = {
  epithet: string;
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
  locationId: LocationId | null;
};

export type Clue = {
  id: string;
  text: string;
  hints: ('nature' | 'purpose' | 'weakness')[];
};

export type Location = {
  id: LocationId;
  name: string;
  sceneKey: string;
  /** 配置された手がかり。秘密 */
  clueIds: string[];
};

export type LogEntry = {
  turn: number;
  /** プレイヤーの入力（そのまま） */
  action: string;
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

export const MAX_TURN = 12;

/** 封緘される全体状態。turn は 1〜12 */
export type GameState = {
  /** スキーマ版。不一致なら開封を失敗扱いにする */
  version: number;
  investigator: Investigator;
  entity: Entity;
  clearCondition: ClearCondition;
  locations: Location[];
  clues: Record<string, Clue>;
  currentLocationId: LocationId;
  turn: number;
  acquiredClueIds: string[];
  /** 再調査での重複入手を防ぐ */
  investigatedLocationIds: LocationId[];
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
  locationName: string;
  /** 場面描写（テンプレート展開済み） */
  scene: string;
  entityEpithet: string;
  acquiredClues: { id: string; text: string }[];
  log: LogEntry[];
  ending: Ending | null;
};

/** Jev の生応答をコード側で正規化した値。これ自体はゲーム状態を変えない（Constitution I） */
export type Judgment = {
  actionType: ActionType;
  skill: SkillId;
  /** score 0..4（小数。使用時に丸める） */
  plausibility: number;
  /** score 0..3（小数） */
  horrorExposure: number;
  exploitsWeakness: boolean;
  meetsClear: boolean;
  metaCheat: boolean;
  /** action_type の confidence 0..1（欠損時は 0） */
  confidence: number;
  source: 'jev' | 'fallback';
};

/** Jev に渡す最小限の情報（contracts/jev-questions.md） */
export type JevState = {
  location: string;
  investigator: {
    occupation: string;
    skills: Record<SkillId, number>;
    items: string[];
    hp: number;
    sanity: number;
  };
  acquiredClues: string[];
  /** プレイヤーの入力（そのまま。連結・加工しない） */
  action: string;
  /** meets_clear の instructions に埋め込む。レスポンスとして外へ出してはならない */
  clearConditionDescription: string;
};
