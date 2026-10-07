import { formatPaise } from '@/lib/money';

/** A balance with its meaning in words, so colour is never the only signal. */
export function BalanceAmount({ paise, you = false }: { paise: number; you?: boolean }) {
  if (paise === 0) return <span className="amount">settled</span>;
  const words = paise > 0 ? (you ? 'you get back' : 'gets back') : you ? 'you owe' : 'owes';
  return (
    <span className={paise < 0 ? 'amount owes' : 'amount'}>
      <span className="amount-words">{words}</span> {formatPaise(Math.abs(paise))}
    </span>
  );
}
