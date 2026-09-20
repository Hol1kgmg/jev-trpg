// data-model.md の全型。永続化先は localStorage のみで、DB スキーマは存在しない。

export type SkillId = 'investigate' | 'combat' | 'persuade' | 'escape';

export const SKILL_IDS: readonly SkillId[] = ['investigate', 'combat', 'persuade', 'escape'] as const;

/** プレイヤーが毎ターン 4 択から選ぶ行動の方向性（FR-006 / FR-030） */
export const DIRECTIONS = ['observe', 'attack', 'engage', 'withdraw'] as const;

export type Direction = (typeof DIRECTIONS)[number];

/** 方針と技能は 1 対 1。ロールに使う技能は方針で確定し、Jev には尋ねない */
export const DIRECTION_SKILL: Record<Direction, SkillId> = {
  observe: 'investigate',
  attack: 'combat',
  engage: 'persuade',
  withdraw: 'escape',
};

/** 決着に至る方針。観察は手がかりを得るだけで決着しない */
export const ROUTE_DIRECTIONS = ['attack', 'engage', 'withdraw'] as const;

export type RouteDirection = (typeof ROUTE_DIRECTIONS)[number];

/** 各ルートが要る調書の枠。枠が埋まる＝そのルートで決着できる、を UI にそのまま写す */
export const ROUTE_ASPECT: Record<RouteDirection, Clue['hints'][number]> = {
  attack: 'weakness',
  engage: 'purpose',
  withdraw: 'nature',
};

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

/** epithet と appearance のみ可視。それ以外は秘密 */
export type Entity = {
  epithet: string;
  appearance: string;
  nature: string;
  purpose: string;
  weakness: string;
  manifestation: string;
};

/** 決着ルート 1 本。全フィールドが秘密で、揃ったかどうか（真偽）だけを可視にする */
export type Route = {
  /** Jev の meets_clear の instructions に埋め込む条件文 */
  description: string;
  /** 1〜3 個。すべて入手済みでなければ成立しない */
  requiredClueIds: string[];
};

export type Clue = {
  id: string;
  text: string;
  hints: ('nature' | 'purpose' | 'weakness')[];
};

/**
 * 成功率の内訳。プレイヤーに開示する（事前判定と実行後ログで同じ形）。
 * rate = clamp(base + plausibility + route, rateMin, rateMax)
 */
export type RateBreakdown = {
  skill: SkillId;
  /** 技能値 */
  base: number;
  /** plausibility による補正（負もありうる） */
  plausibility: number;
  /** 決め手ボーナス。手がかりの揃ったルートの条件を満たす行動にだけ乗る。乗らなければ 0 */
  route: number;
  rate: number;
};

/** d100 判定の内訳。内訳の各項は旧封緘データでは欠けうる */
export type Check = Partial<RateBreakdown> & { skill: SkillId; rate: number; roll: number };

/** 事前判定の結果。同じ方針・詳細で実行されたときだけ再利用する（ADR 0004） */
export type Preview = { direction: Direction; detail: string; judgment: Judgment };

export type LogEntry = {
  turn: number;
  direction: Direction;
  /** 添えられた詳細（空文字もありうる） */
  detail: string;
  outcome: Outcome;
  /** ロールしたターンのみ。ambiguous / meta では undefined。optional なのは旧封緘データ互換のため */
  check?: Check;
  /** テンプレート展開済み */
  narration: string;
  delta: { hp: number; sanity: number; clueId: string | null };
};

export type Ending = {
  reason: 'clear' | 'death' | 'madness' | 'timeout' | 'retire';
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
  routes: Record<RouteDirection, Route>;
  /** 挿入順＝観察で手に入る順 */
  clues: Record<string, Clue>;
  turn: number;
  acquiredClueIds: string[];
  log: LogEntry[];
  ending: Ending | null;
  /** 今のターンに事前判定を走らせた回数。ターンが進むと 0 に戻る。旧封緘データでは欠けうる */
  previews?: number;
  /** 直近の事前判定。ターンが進むと消える */
  preview?: Preview | null;
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
  /** hints は「どの側面に関わるか」の分類だけで、隠す本文（nature 等）は含まない */
  acquiredClues: { id: string; text: string; hints: Clue['hints'] }[];
  /** 必要な手がかりが揃い、決着を狙える方針。条件文は含まない */
  readyDirections: RouteDirection[];
  log: LogEntry[];
  ending: Ending | null;
};

/** Jev の生応答をコード側で正規化した値。これ自体はゲーム状態を変えない（Constitution I） */
export type Judgment = {
  /** score 0..4（小数。使用時に丸める） */
  plausibility: number;
  /** score 0..3（小数） */
  horrorExposure: number;
  /** 選んだ方針のルート条件を満たすか。observe では常に false */
  meetsClear: boolean;
  metaCheat: boolean;
  /** plausibility の confidence 0..1（欠損時は 0） */
  confidence: number;
  source: 'jev' | 'fallback';
};

/**
 * 画像素材 1 件の出所。ゲーム状態とは独立した静的データで、封緘の対象外（data-model.md）。
 * 画像の参照はこのエントリ経由に限る（FR-024）。
 */
export type AssetEntry = {
  /** public/ からの相対パス。例: 'assets/entity-dweller.webp' */
  path: string;
  /** 入手元のページ URL */
  sourceUrl: string;
  /** 作者名。不明な場合も空文字にせず出典名を入れる */
  author: string;
  /** 'CC0-1.0' / 'CC BY 4.0' など */
  license: string;
  licenseUrl: string;
  requiresCredit: boolean;
  /** 表示するクレジット文。requiresCredit が false でも記録する */
  creditText: string;
  commercialUse: boolean;
  /** ライセンス上、改変が許されているか */
  modification: boolean;
  /** 本作で実際に加工したか */
  modified: boolean;
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
