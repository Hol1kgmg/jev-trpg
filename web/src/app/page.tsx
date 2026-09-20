'use client';

import { useEffect, useState } from 'react';
import { useGame } from '@/lib/store';
import type { SkillId } from '@/lib/game/types';

const skillLabels: Record<SkillId, string> = {
  investigate: '調査',
  combat: '戦闘',
  persuade: '交渉',
  escape: '逃走',
  occult: '神秘',
  stealth: '隠密',
};

export default function Page() {
  const { visible, sending, error, newGame, submit } = useGame();
  const [input, setInput] = useState('');

  useEffect(() => {
    if (useGame.getState().visible === null) void newGame();
  }, [newGame]);

  if (visible === null) {
    return <main className="p-6 text-sm opacity-70">{error ? '開始できませんでした。' : '……'}</main>;
  }

  const ended = visible.ending !== null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-800 pb-3">
        <h1 className="text-lg tracking-wide">{visible.locationName}</h1>
        <p className="text-xs tabular-nums opacity-70">
          ターン {visible.turn} / {visible.maxTurn}　HP {visible.hp}　正気度 {visible.sanity}
        </p>
      </header>

      <section className="text-sm leading-loose">{visible.scene}</section>

      <section className="grid gap-1 text-xs opacity-80">
        <p>{visible.occupation}</p>
        <p>
          {(Object.keys(skillLabels) as SkillId[])
            .map((id) => `${skillLabels[id]} ${visible.skills[id]}`)
            .join('　')}
        </p>
        <p>所持品: {visible.items.join('、')}</p>
      </section>

      {visible.acquiredClues.length > 0 && (
        <section className="border-l border-neutral-700 pl-3 text-xs leading-relaxed opacity-90">
          <h2 className="mb-1 opacity-70">入手済みの手がかり</h2>
          <ul className="grid gap-1">
            {visible.acquiredClues.map((clue) => (
              <li key={clue.id}>{clue.text}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-4 text-sm leading-loose">
        {visible.log.map((entry) => (
          <article key={entry.turn} className="border-t border-neutral-900 pt-3">
            <p className="text-xs opacity-50">
              {entry.turn}: {entry.action}
            </p>
            <p>{entry.narration}</p>
          </article>
        ))}
      </section>

      {ended ? (
        <section className="grid gap-4 border-t border-neutral-700 pt-4 text-sm leading-loose">
          <p>{visible.ending!.text}</p>
          <dl className="grid gap-1 text-xs opacity-80">
            <div>
              <dt className="inline opacity-60">正体: </dt>
              <dd className="inline">{visible.ending!.reveal.nature}</dd>
            </div>
            <div>
              <dt className="inline opacity-60">目的: </dt>
              <dd className="inline">{visible.ending!.reveal.purpose}</dd>
            </div>
            <div>
              <dt className="inline opacity-60">弱点: </dt>
              <dd className="inline">{visible.ending!.reveal.weakness}</dd>
            </div>
            <div>
              <dt className="inline opacity-60">あなたの秘密: </dt>
              <dd className="inline">{visible.ending!.reveal.secret}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="justify-self-start border border-neutral-700 px-4 py-2 text-xs"
            onClick={() => void newGame()}
            disabled={sending}
          >
            新規開始
          </button>
        </section>
      ) : (
        <form
          className="flex gap-2 border-t border-neutral-800 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            const action = input.trim();
            if (!action) return;
            setInput('');
            void submit(action);
          }}
        >
          <input
            className="flex-1 border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none"
            placeholder="どうする？"
            maxLength={200}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending}
          />
          <button
            type="submit"
            className="border border-neutral-700 px-4 py-2 text-xs"
            disabled={sending}
          >
            行動
          </button>
        </form>
      )}

      {error === 'invalid_action' && (
        <p className="text-xs text-amber-500">その入力は受け付けられませんでした。</p>
      )}
      {error === 'invalid_state' && (
        <p className="text-xs text-amber-500">保存された状態を読めませんでした。新規開始してください。</p>
      )}
    </main>
  );
}
