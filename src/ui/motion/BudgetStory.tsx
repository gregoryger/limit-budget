import { useEffect, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Pause, Play } from 'lucide-react';
import { rub } from '../../../shared/transactions';

type MoneyFlow = { balance: number; obligations: number };
const frames = 180;
const money = (value: number) => rub(value);

/** Display only: all amounts come from the same integer-kopeck budget inputs. */
function FlowComposition({ balance, obligations }: MoneyFlow) {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [24, 105], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <FlowVisual balance={balance} obligations={obligations} progress={progress} />;
}

function FlowVisual({ balance, obligations, progress }: MoneyFlow & { progress: number }) {
  const free = balance - obligations;
  const remaining = Math.max(0, Math.min(1, balance ? free / balance : 0));
  const barWidth = (1 - (1 - remaining) * progress) * 376;
  return (
    <AbsoluteFill
      style={{ fontFamily: 'Onest, sans-serif', color: '#171916', padding: '26px 28px' }}
    >
      <div style={{ fontSize: 16, fontWeight: 500 }}>Свободно после обязательных платежей</div>
      <div
        style={{
          fontSize: Math.abs(free) >= 100_000_000 ? 35 : 46,
          fontWeight: 700,
          letterSpacing: '-0.035em',
          marginTop: 10,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {money(free)}
      </div>
      <svg viewBox="0 0 376 72" width="100%" style={{ overflow: 'visible', marginTop: 18 }}>
        <rect x="0" y="12" width="376" height="32" rx="7" fill="#17191622" />
        <rect x="0" y="12" width={barWidth} height="32" rx="7" fill="#171916" />
        <line x1={barWidth} x2={barWidth} y1="6" y2="51" stroke="#171916" strokeWidth="2" />
        <text x="0" y="69" fontSize="13" fill="#37391d">
          {progress < 0.02 ? 'Весь остаток на счетах' : 'Остаток за вычетом платежей'}
        </text>
      </svg>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 14,
          borderTop: '1px solid #17191633',
          paddingTop: 15,
          marginTop: 'auto',
          fontSize: 15,
        }}
      >
        <div>
          <div style={{ color: '#434525', marginBottom: 5 }}>На счетах</div>
          <div style={{ fontWeight: 650 }}>{money(balance)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#434525', marginBottom: 5 }}>Обязательные платежи</div>
          <div style={{ fontWeight: 650 }}>− {money(obligations)}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function BudgetStory({ balance, obligations }: MoneyFlow) {
  const player = useRef<PlayerRef>(null);
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => {
      setReduced(query.matches);
      setPlaying(false);
    };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    setPlaying(false);
    const current = player.current;
    if (!current) return;
    const ended = () => setPlaying(false);
    const hide = () => {
      if (document.hidden) {
        current.pause();
        setPlaying(false);
      }
    };
    current.addEventListener('ended', ended);
    document.addEventListener('visibilitychange', hide);
    return () => {
      current.removeEventListener('ended', ended);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [balance, obligations, reduced]);
  const toggle = () => {
    const current = player.current;
    if (!current) return;
    if (playing) current.pause();
    else {
      if (current.getCurrentFrame() >= frames - 1) current.seekTo(0);
      current.play();
    }
    setPlaying(!playing);
  };
  return (
    <figure className="budget-story">
      <div className="budget-story-visual" aria-hidden="true">
        <Player
          key={`${balance}:${obligations}:${reduced}`}
          ref={player}
          component={FlowComposition}
          inputProps={{ balance, obligations }}
          durationInFrames={frames}
          fps={30}
          compositionWidth={432}
          compositionHeight={282}
          initialFrame={frames - 1}
          moveToBeginningWhenEnded={false}
          numberOfSharedAudioTags={0}
          clickToPlay={false}
          style={{ width: '100%' }}
        />
      </div>
      <figcaption>
        <span className="sr-only">
          Свободно после обязательных платежей: {money(balance - obligations)}. На счетах{' '}
          {money(balance)}, обязательные платежи {money(obligations)}. Будущие доходы не включены.
        </span>
        {!reduced && (
          <button
            className="story-control"
            onClick={toggle}
            aria-label={playing ? 'Приостановить разбор бюджета' : 'Показать разбор бюджета'}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
            <span>{playing ? 'Приостановить' : 'Как это считается'}</span>
            <span className="story-duration">6 сек</span>
          </button>
        )}
        {reduced && (
          <p className="story-still-note">Остаток − обязательные платежи = свободные деньги</p>
        )}
      </figcaption>
    </figure>
  );
}
