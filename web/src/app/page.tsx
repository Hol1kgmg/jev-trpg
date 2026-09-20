'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '@/lib/store';
import { siteName } from '@/lib/site';
import { previewDebounceMs } from '@/lib/game/tuning';
import {
  DIRECTIONS,
  DIRECTION_SKILL,
  ROUTE_ASPECT,
  ROUTE_DIRECTIONS,
  type Check,
  type Clue,
  type Direction,
  type Ending,
  type LogEntry,
  type RateBreakdown,
  type RouteDirection,
  type SkillId,
  type VisibleState,
} from '@/lib/game/types';

const skillLabels: Record<SkillId, string> = {
  investigate: '調査',
  combat: '戦闘',
  persuade: '交渉',
  escape: '逃走',
};

const directionLabels: Record<Direction, string> = {
  observe: '観察する',
  attack: '攻撃する',
  engage: '働きかける',
  withdraw: '退く',
};

const aspectLabels: Record<Clue['hints'][number], string> = {
  nature: '正体',
  purpose: '目的',
  weakness: '弱点',
};

// 調書の枠は決着ルートと 1 対 1。枠が埋まる＝その方針で決着できる、を見出しに書く
const ASPECT_ROUTE = Object.fromEntries(
  ROUTE_DIRECTIONS.map((d) => [ROUTE_ASPECT[d], d]),
) as Record<Clue['hints'][number], RouteDirection>;
const ASPECTS: Clue['hints'][number][] = ['nature', 'purpose', 'weakness'];

// 終了理由ごとに色だけ変える。文面はサーバーのテンプレートが決める（FR-020）
const ENDING_STYLE: Record<Ending['reason'], { label: string; text: string; box: string }> = {
  clear: { label: '生還', text: 'text-forest-light', box: 'border-forest/50 bg-forest/6' },
  death: { label: '死亡', text: 'text-blood-light', box: 'border-blood/50 bg-blood/6' },
  madness: { label: '発狂', text: 'text-gold', box: 'border-gold/50 bg-gold/6' },
  timeout: { label: '時間切れ', text: 'text-dim', box: 'border-edge bg-surface' },
  retire: { label: '失敗', text: 'text-blood-light', box: 'border-blood/50 bg-blood/6' },
};

// 成否の両端だけ色で強調する。中間は描写文に任せる
const OUTCOME_CLASS: Partial<Record<LogEntry['outcome'], string>> = {
  critical_success: 'text-gold',
  fumble: 'text-blood-light',
};

const PANEL = 'rounded-sm border border-edge bg-panel p-3';
const HEADING = 'font-display text-[10px] tracking-[0.25em] text-dim uppercase';

// ボタンは主（parchment 枠）と従（edge 枠）の 2 種。どちらも最低 44px（ui-spec §7）
function Btn({
  primary,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      type="button"
      className={`min-h-11 rounded-sm border px-5 font-display text-xs tracking-[0.2em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? 'border-parchment/30 text-parchment hover:border-parchment/70 hover:bg-parchment/5'
          : 'border-edge text-dim hover:border-dim hover:text-parchment'
      } ${className}`}
      {...props}
    />
  );
}

// HP と正気度は 0 で即終了するので、残りが少ないことは描写より先に伝える
function Gauge({ label, value, max }: { label: string; value: number; max: number }) {
  const low = value <= 3;
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between">
        <span className={HEADING}>{label}</span>
        <span className={`text-sm tabular-nums ${low ? 'animate-pulse text-blood-light' : ''}`}>
          {value}
          <span className="text-xs text-dim">/{max}</span>
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-abyss">
        <div
          className={`h-full rounded-full transition-all duration-700 ${low ? 'animate-pulse-blood bg-blood' : 'bg-forest'}`}
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
    </div>
  );
}

function Vitals({ visible, className = '' }: { visible: VisibleState; className?: string }) {
  return (
    <div className={`grid gap-2 ${className}`}>
      <p className="font-display text-sm tabular-nums tracking-wider">
        TURN {Math.min(visible.turn, visible.maxTurn)}
        <span className="text-dim"> / {visible.maxTurn}</span>
      </p>
      <Gauge label="HP" value={visible.hp} max={10} />
      <Gauge label="正気度" value={visible.sanity} max={10} />
    </div>
  );
}

function Epithet({ children, className = '' }: { children: string; className?: string }) {
  return <h1 className={`font-display tracking-wider ${className}`}>{children}</h1>;
}

// 技能・所持品の書式を 1 箇所にまとめる。lg 未満は畳み、待機画面とサイドでは開いたまま
// `lit` は補正の基礎になる技能。方針を選んだ時点で光らせ、どの数字が効くかを先に示す
function Investigator({
  visible,
  lit = null,
  collapsible = false,
}: {
  visible: VisibleState;
  lit?: SkillId | null;
  collapsible?: boolean;
}) {
  const body = (
    <div className="grid gap-1 pt-2 text-xs text-dim">
      <p className="flex flex-wrap gap-x-4 tabular-nums">
        {(Object.keys(skillLabels) as SkillId[]).map((id) => (
          <span
            key={id}
            className={`transition-colors ${id === lit ? 'animate-pulse text-gold' : ''}`}
          >
            {skillLabels[id]} {visible.skills[id]}
          </span>
        ))}
      </p>
      <p>所持品: {visible.items.join('、')}</p>
    </div>
  );
  if (collapsible) {
    return (
      <details className="text-xs">
        <summary className="cursor-pointer text-dim">{visible.occupation}</summary>
        {body}
      </details>
    );
  }
  return (
    <div className="text-xs">
      <p className={HEADING}>探索者</p>
      <p className="pt-1">{visible.occupation}</p>
      {body}
    </div>
  );
}

// 行動が何をもたらしたかは描写文からは読み取れないので、増減を数字で添える
function deltaText(entry: LogEntry): string {
  const parts: string[] = [];
  if (entry.delta.hp !== 0) parts.push(`HP ${entry.delta.hp > 0 ? '+' : ''}${entry.delta.hp}`);
  if (entry.delta.sanity !== 0)
    parts.push(`正気度 ${entry.delta.sanity > 0 ? '+' : ''}${entry.delta.sanity}`);
  if (entry.delta.clueId !== null) parts.push('手がかりを得た');
  return parts.join('　');
}

const OUTCOME_LABEL: Partial<Record<LogEntry['outcome'], string>> = {
  critical_success: '決定的成功',
  success: '成功',
  failure: '失敗',
  fumble: '致命的失敗',
};

const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

// 成功率の内訳。Jev の解釈（妥当性・決め手）がどこで効いたかを数字で見せる（ADR 0004）。
// 内訳を持たない旧ログでは目標値だけになる
function rateText(r: RateBreakdown | Check): string {
  if (r.base === undefined) return `${skillLabels[r.skill]} ${r.rate}`;
  const parts = [`${skillLabels[r.skill]} ${r.base}`, `妥当性 ${signed(r.plausibility ?? 0)}`];
  if (r.route) parts.push(`決め手 ${signed(r.route)}`);
  return `${parts.join(' ')} ＝ ${r.rate}`;
}

// 判定は d100 の下方ロール。どの技能で、目標値いくつに対して、何が出たかを 1 行で示す
function checkText(entry: LogEntry): string | null {
  if (!entry.check) return null;
  return `${rateText(entry.check)}　→　出目 ${entry.check.roll}　${OUTCOME_LABEL[entry.outcome] ?? ''}`;
}

function LogArticle({ entry }: { entry: LogEntry }) {
  const delta = deltaText(entry);
  const check = checkText(entry);
  return (
    <article className="grid gap-1">
      <p className="text-xs text-dim">
        {entry.turn}: {directionLabels[entry.direction]}
        {entry.detail && `（${entry.detail}）`}
      </p>
      {check && (
        <p
          className={`font-display text-xs tabular-nums tracking-wider ${OUTCOME_CLASS[entry.outcome] ?? 'text-dim'}`}
        >
          {check}
        </p>
      )}
      <p className={OUTCOME_CLASS[entry.outcome]}>{entry.narration}</p>
      {delta && <p className="text-xs tabular-nums text-dim">{delta}</p>}
    </article>
  );
}

// 一拍置いて見せるための器。ゆっくり現れ、読み終える頃に自動で閉じる（遷移は globals.css）
function Modal({
  ms,
  onClose,
  children,
}: {
  ms: number;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    const id = setTimeout(() => el?.close(), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={() => ref.current?.close()}
      className="m-auto w-[calc(100%-2rem)] max-w-lg bg-transparent p-0 text-parchment outline-none backdrop:bg-void/90"
    >
      <div className="rounded-sm border border-edge bg-panel p-6">{children}</div>
      {/* 自動で閉じるが、待たずに進めることも示す */}
      <button
        type="button"
        className="animate-fade-in mx-auto block min-h-11 px-4 pt-3 font-display text-xs tracking-[0.2em] text-dim hover:text-parchment [animation-delay:2600ms] [animation-fill-mode:backwards]"
      >
        閉じる
      </button>
    </dialog>
  );
}

// 行動の結果を一拍置いて見せる。読み終える頃に自動で閉じ、以降はログとして残る
function Reveal({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  const delta = deltaText(entry);
  const check = checkText(entry);
  return (
    <Modal
      // 読了までの目安。描写文の長さに比例させ、上限で頭打ちにする
      ms={Math.min((entry.check ? 4200 : 3600) + entry.narration.length * 90, 9800)}
      onClose={onClose}
    >
      <>
        {/* 遅延は枠が現れ切る 800ms の後から始める（globals.css の dialog 遷移と揃える） */}
        <p className="animate-fade-in text-xs text-dim [animation-delay:800ms] [animation-fill-mode:backwards]">
          {entry.turn}: {directionLabels[entry.direction]}
          {entry.detail && `（${entry.detail}）`}
        </p>
        {/* 出目を描写より先に見せる。描写は出目の帰結なので、順序で因果を示す */}
        {check && (
          <p
            className={`animate-fade-in pt-3 font-display text-sm tabular-nums tracking-wider [animation-delay:1200ms] [animation-fill-mode:backwards] ${OUTCOME_CLASS[entry.outcome] ?? 'text-dim'}`}
          >
            {check}
          </p>
        )}
        <p
          className={`animate-fade-in pt-3 text-base leading-loose [animation-fill-mode:backwards] ${OUTCOME_CLASS[entry.outcome] ?? ''}`}
          style={{ animationDelay: check ? '1800ms' : '1200ms' }}
        >
          {entry.narration}
        </p>
        {delta && (
          <p className="animate-fade-in pt-4 text-xs tabular-nums text-dim [animation-delay:2200ms] [animation-fill-mode:backwards]">
            {delta}
          </p>
        )}
      </>
    </Modal>
  );
}

// 幕切れはまず理由だけを告げる。正体・目的・弱点などの詳細は閉じた後の画面で読ませる
function EndReveal({ ending }: { ending: Ending }) {
  const style = ENDING_STYLE[ending.reason];
  return (
    <Modal ms={Math.min(3600 + ending.text.length * 90, 9800)}>
      <>
        <p
          className={`animate-fade-in text-center font-display text-3xl tracking-[0.3em] [animation-delay:800ms] [animation-fill-mode:backwards] ${style.text}`}
        >
          {style.label}
        </p>
        <p className="animate-fade-in pt-5 text-sm leading-loose [animation-delay:1600ms] [animation-fill-mode:backwards]">
          {ending.text}
        </p>
      </>
    </Modal>
  );
}

// タイトル画面の背景演出（格子・ビネット・同心円）。待機画面だけに使う
function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(45,106,79,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(45,106,79,0.8) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 35%, #080706 85%)' }}
      />
      <div className="absolute h-[480px] w-[480px] rounded-full border border-forest/8" />
      <div className="absolute h-[360px] w-[360px] rounded-full border border-forest/6" />
      <div className="absolute h-[240px] w-[240px] rounded-full border border-forest/4" />
    </div>
  );
}

export default function Page() {
  const {
    visible: live,
    phase,
    sending,
    error,
    previewing,
    preview,
    previewExhausted,
    newGame,
    restore,
    startSession,
    requestPreview,
    submit,
    retire,
  } = useGame();
  const [direction, setDirection] = useState<Direction | null>(null);
  const [detail, setDetail] = useState('');

  // 入力が止まってから一定時間で事前判定。入力が変われば取り消して数え直す（ADR 0004）
  useEffect(() => {
    if (direction === null || phase !== 'playing' || previewing) return;
    const sent = detail.trim();
    if (preview?.direction === direction && preview.detail === sent) return;
    const id = setTimeout(() => void requestPreview(direction, sent), previewDebounceMs);
    return () => clearTimeout(id);
    // previewing を含めるのは、通信中に入力が変わったとき、終わってから数え直すため
  }, [direction, detail, phase, preview, previewing, requestPreview]);
  // 表示するのは今の入力に対する判定だけ。古い判定は出さない
  const shownPreview =
    direction !== null && preview?.direction === direction && preview.detail === detail.trim()
      ? preview
      : null;
  // 光らせる技能。方針と 1 対 1 なので選んだ時点で確定する
  const litSkill = direction === null ? null : DIRECTION_SKILL[direction];
  const [reveal, setReveal] = useState<LogEntry | null>(null);
  // モーダルで結果を見せ終えるまで、送信前の状態のまま描く（ログ・調書・情景が先に動かないように）
  const [frozen, setFrozen] = useState<VisibleState | null>(null);
  const [ending, setEnding] = useState<Ending | null>(null);
  const visible = frozen ?? live;
  const unfreeze = useCallback(() => {
    // フェードアウト（globals.css の 800ms）が終わってから最新状態に差し替える
    setTimeout(() => {
      setFrozen(null);
      // 幕切れは最後の行動の結果を見せ終えてから告げる
      setEnding(useGame.getState().visible?.ending ?? null);
    }, 800);
  }, []);

  // 保存値があれば続きから、なければ新規プレイ（AS 3-1）
  useEffect(() => {
    if (useGame.getState().visible === null) void restore();
  }, [restore]);

  // どの画面からも 1 クリックで到達できる位置に置く（FR-025）
  const credits = (
    <footer className="border-t border-edge pt-3">
      <Link className="text-xs text-dim underline hover:text-parchment" href="/credits">
        クレジット
      </Link>
    </footer>
  );

  // 前回の演出用の状態も一緒に捨てる。残すと新しいゲームで直前の幕切れが再生される
  const startOver = () => {
    setDirection(null);
    setDetail('');
    setReveal(null);
    setFrozen(null);
    setEnding(null);
    void newGame();
  };
  const restart = (
    <Btn className="justify-self-start self-start" onClick={startOver} disabled={sending}>
      新規開始
    </Btn>
  );

  // 復元にも新規プレイにも失敗した状態。行き止まりにせず新規プレイを提案する（AS 3-3）
  if (visible === null) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6 text-sm">
        {error ? (
          <>
            <p className="text-dim">続きを読み込めませんでした。新しく始めてください。</p>
            {restart}
          </>
        ) : (
          <p className="animate-flicker text-dim">……</p>
        )}
        {credits}
      </main>
    );
  }

  // 待機画面。開示するのはセッション中と同じ範囲だけ（FR-026 / FR-027）
  if (phase === 'briefing') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 p-4 sm:p-6 animate-fade-in">
        <Backdrop />
        <header className="grid gap-3 text-center">
          <p className="font-display text-lg tracking-[0.4em]">{siteName}</p>
          <p className={HEADING}>Cosmic Horror · Solo</p>
          <Epithet className="animate-flicker text-4xl sm:text-5xl">{visible.entityEpithet}</Epithet>
          <div className="flex items-center justify-center gap-4">
            <div className="h-px w-16 bg-linear-to-r from-transparent to-forest/40" />
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold/50" />
            <div className="h-px w-16 bg-linear-to-l from-transparent to-forest/40" />
          </div>
        </header>
        <section className="text-sm leading-loose">{visible.entityAppearance}</section>
        {/* 「観察で枠を埋め、埋まった枠の方針で決着する」を遊ぶ前に一度だけ言葉で示す（FR-017b） */}
        <section className="grid gap-1 border-l border-gold/40 pl-3 text-xs leading-relaxed text-dim">
          <p>相手の正体・目的・弱点は、まだ何も分かっていない。まず観察せよ。</p>
          <p>正体を掴めば退ける。目的を掴めば働きかけられる。弱点を掴めば討てる。</p>
          <p>猶予は {visible.maxTurn} ターン。決着の一手は、何をするかを自分の言葉で書く。</p>
        </section>
        <section className={PANEL}>
          <Investigator visible={visible} />
        </section>
        <Btn primary className="w-52 self-center" onClick={startSession}>
          対峙する
        </Btn>
        {credits}
      </main>
    );
  }

  const ended = visible.ending !== null;
  const past = visible.log.slice(0, -1);
  const last = visible.log.at(-1);

  return (
    // PC とスマートフォン縦画面の 2 系統に留める（plan.md）。lg 未満は上端の sticky ヘッダー、
    // lg 以上は右側の sticky な box。本文の並びはどちらも「ログ → 現在の状況 → 手がかり → 行動」
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-4 sm:px-6 sm:pb-6 lg:grid lg:max-w-4xl lg:grid-cols-[1fr_15rem] lg:items-start lg:gap-x-8 lg:pt-6">
      {/* ログが伸びても基本情報が流れないよう画面上端に留める。背景を塗らないとログが透ける。
          毎ターン判断に効く残量を主、一度読めば足りる異名と探索者情報を従に置く */}
      <header className="sticky top-0 z-10 grid gap-2 border-b border-edge bg-void pt-4 pb-3 sm:pt-6 lg:hidden">
        <div className="flex items-baseline justify-between gap-4">
          <p className="font-display text-sm tabular-nums tracking-wider">
            TURN {Math.min(visible.turn, visible.maxTurn)}
            <span className="text-dim"> / {visible.maxTurn}</span>
          </p>
          <Epithet className="text-xs text-dim">{visible.entityEpithet}</Epithet>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Gauge label="HP" value={visible.hp} max={10} />
          <Gauge label="正気度" value={visible.sanity} max={10} />
        </div>
        <Investigator visible={visible} lit={litSkill} collapsible />
      </header>

      {/* ゲーム情報とプレイヤー情報。手がかりはターンごとに伸びて行動の直前に読むものなので入れない */}
      <aside className="hidden lg:sticky lg:top-6 lg:col-start-2 lg:grid lg:gap-3">
        <section className={PANEL}>
          <Epithet className="border-b border-edge pb-2 text-sm text-dim">{visible.entityEpithet}</Epithet>
          <Vitals visible={visible} className="pt-3" />
        </section>
        <section className={PANEL}>
          <Investigator visible={visible} lit={litSkill} />
        </section>
      </aside>

      <div className="flex flex-col gap-6 lg:col-start-1 lg:row-start-1">
        {/* 上から下へ時系列。古いログは畳み、直前のターンと現在の状況だけを開く */}
        {past.length > 0 && (
          <details className="text-sm leading-loose text-dim">
            <summary className="cursor-pointer text-xs">これまで ({past.length})</summary>
            <div className="grid gap-4 pt-3">
              {past.map((entry) => (
                <LogArticle key={entry.turn} entry={entry} />
              ))}
            </div>
          </details>
        )}

        {last && (
          <section className="text-sm leading-loose text-dim">
            <LogArticle entry={last} />
          </section>
        )}

        <section className="border-t border-edge pt-4 text-base leading-loose">{visible.scene}</section>

        {ended ? (
          <section className="grid gap-5 border-t border-edge pt-4 text-sm leading-loose animate-fade-in">
            <p
              className={`justify-self-start rounded-sm border px-6 py-2 font-display tracking-[0.2em] ${ENDING_STYLE[visible.ending!.reason].box} ${ENDING_STYLE[visible.ending!.reason].text}`}
            >
              {ENDING_STYLE[visible.ending!.reason].label}
            </p>
            <p>{visible.ending!.text}</p>
            <dl className={`${PANEL} grid gap-1 text-xs`}>
              {(
                [
                  ['正体', visible.ending!.reveal.nature],
                  ['目的', visible.ending!.reveal.purpose],
                  ['弱点', visible.ending!.reveal.weakness],
                  ['あなたの秘密', visible.ending!.reveal.secret],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="inline text-dim">{label}: </dt>
                  <dd className="inline">{value}</dd>
                </div>
              ))}
            </dl>
            {restart}
          </section>
        ) : (
          <>
            {/* 判断の唯一の根拠なので、判断する場所の直前に開いたまま置く（FR-017） */}
            {/* 正体・目的・弱点の枠を最初から見せ、各枠にどの方針（と技能）で決着できるかを添える。
                揃った枠は点灯させる。条件文は出さない（FR-017a） */}
            <section className={`${PANEL} grid gap-3 text-xs`}>
              <p className={`${HEADING} border-b border-edge pb-2`}>調書</p>
              {ASPECTS.map((aspect) => {
                const clues = visible.acquiredClues.filter((c) => c.hints.includes(aspect));
                const route = ASPECT_ROUTE[aspect];
                const skill = DIRECTION_SKILL[route];
                const ready = visible.readyDirections.includes(route);
                return (
                  <div key={aspect} className="grid gap-1">
                    <p className="flex flex-wrap items-baseline justify-between gap-x-3 font-display tracking-wider text-dim">
                      <span>
                        {aspectLabels[aspect]}
                        {clues.length === 0 && <span className="text-edge">　不明</span>}
                      </span>
                      <span className={ready ? 'text-gold' : 'text-edge'}>
                        {ready ? `${directionLabels[route]}で決着できる` : `→ ${directionLabels[route]}`}
                        <span className="tabular-nums">
                          （{skillLabels[skill]} {visible.skills[skill]}）
                        </span>
                      </span>
                    </p>
                    {clues.length > 0 && (
                      <ul className="grid gap-1 leading-relaxed">
                        {clues.map((clue) => (
                          <li key={clue.id} className="animate-slide-up">
                            {clue.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </section>

            <section className="grid gap-3 border-t border-edge pt-4">
              {sending && <p className="animate-flicker text-xs text-gold">判定中……</p>}
              {direction === null ? (
                <div className="grid gap-2">
                  <p className="text-xs text-dim">あなたはどうする？（方針）</p>
                  {/* 次に何をすべきかを状況で切り替える: 枠が空なら観察、揃ったら決着 */}
                  <p className="text-xs text-dim">
                    {visible.readyDirections.length > 0
                      ? `${visible.readyDirections.map((d) => directionLabels[d]).join('・')}で決着できる。調書の手がかりを踏まえ、何をするかを詳細に書け。`
                      : visible.acquiredClues.length === 0
                        ? 'まずは観察して、調書の枠を埋める。'
                        : '観察を重ねて枠を埋める。揃った枠の方針で決着できる。'}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {DIRECTIONS.map((d) => {
                      const ready = d !== 'observe' && visible.readyDirections.includes(d);
                      return (
                        <Btn
                          key={d}
                          className={`grid gap-0.5 px-3 py-3 hover:border-forest hover:bg-forest/8 ${ready ? 'border-gold/60 text-gold' : ''}`}
                          disabled={sending}
                          onClick={() => setDirection(d)}
                        >
                          {directionLabels[d]}
                          <span className="text-[10px] tabular-nums tracking-normal text-dim">
                            {skillLabels[DIRECTION_SKILL[d]]} {visible.skills[DIRECTION_SKILL[d]]}
                          </span>
                        </Btn>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <form
                  className="grid gap-3 animate-slide-up"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const sent = detail.trim();
                    setDirection(null);
                    setDetail('');
                    setFrozen(visible);
                    void submit(direction, sent).then(() => {
                      // ログが伸びたときだけ結果を見せる（二重送信・エラー時は伸びない）
                      const added = useGame.getState().visible?.log.at(-1);
                      if (added && added.turn !== last?.turn) setReveal(added);
                      else setFrozen(null);
                    });
                  }}
                >
                  <p className="text-xs text-dim">あなたはどうする？（詳細）</p>
                  <p className="font-display text-xs tracking-wider text-forest-light">
                    方針: {directionLabels[direction]}
                    {direction !== 'observe' && visible.readyDirections.includes(direction) && (
                      <span className="text-gold">　決着できる</span>
                    )}
                  </p>
                  <input
                    // text-base（16px）未満だと iOS が入力時に画面を拡大する
                    className="w-full rounded-sm border border-edge bg-abyss px-3 py-2 text-base outline-none focus:border-dim"
                    // 決着は詳細の内容で判定される。空欄でもターンは進むが、決着は絶対に付かない
                    placeholder={
                      direction === 'observe'
                        ? '空欄のままでも進められます'
                        : '何をするかを書く。空欄では決着は付かない'
                    }
                    maxLength={200}
                    value={detail}
                    onChange={(e) => setDetail(e.target.value)}
                    // 上限に達したら入力を固定する。直前の判定で確定する
                    disabled={sending || previewExhausted}
                    autoFocus
                  />
                  {/* 事前判定の状態を常に 1 行で示す: 入力待ち → 測定中 → 結果。
                      見せるのはダイス補正だけ。ロールしない判定は「……」 */}
                  <p className="min-h-4 font-display text-xs tabular-nums tracking-wider text-dim">
                    {shownPreview ? (
                      <>
                        <span className="text-forest-light">測定結果　</span>
                        {shownPreview.rate ? rateText(shownPreview.rate) : '……'}
                      </>
                    ) : previewExhausted ? (
                      'これ以上は測れない'
                    ) : previewing ? (
                      <span className="animate-flicker text-gold">判定を測定中……</span>
                    ) : (
                      '入力待ち'
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Btn primary type="submit" disabled={sending}>
                      決定
                    </Btn>
                    <Btn
                      className="border-transparent"
                      disabled={sending}
                      onClick={() => {
                        setDirection(null);
                        setDetail('');
                      }}
                    >
                      選び直す
                    </Btn>
                  </div>
                </form>
              )}
            </section>

            {/* 途中で降りる道。決着として扱い、幕切れと正体の開示は通常の終了と同じ画面で見せる */}
            <Btn
              className="justify-self-start border-transparent"
              disabled={sending}
              onClick={() => {
                if (!confirm('この対峙をあきらめますか？')) return;
                setDirection(null);
                setDetail('');
                void retire().then(() => setEnding(useGame.getState().visible?.ending ?? null));
              }}
            >
              あきらめる
            </Btn>
          </>
        )}

        {error === 'invalid_action' && (
          <p className="text-xs text-gold">その入力は受け付けられませんでした。</p>
        )}
        {error === 'invalid_state' && (
          <section className="grid gap-2">
            <p className="text-xs text-gold">保存された状態を読めませんでした。</p>
            {restart}
          </section>
        )}

        {credits}
      </div>

      {/* ターンごとに作り直してフェードインをやり直す。閉じた後は残しておくだけで害がない */}
      {reveal && <Reveal key={reveal.turn} entry={reveal} onClose={unfreeze} />}
      {ending && <EndReveal ending={ending} />}
    </main>
  );
}
