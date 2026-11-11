type Size = 'p-[13px]' | 'gap-[18px] m-[7px]';
enum Spacing { Tight = 'p-[13px]', Loose = 'gap-[18px] m-[7px]' }
interface Props { pad: 'p-[13px]'; gap?: 'gap-[18px] m-[7px]' }
type Pair = `m-[13px] p-[13px] ${string}`;
declare function pick(size: 'p-[13px] m-[7px]'): Size;
const size = 'p-[13px]' as Size;
export const A = (props: Props) => (
  <div className={cn('p-[13px]' as const, size)} aria-label="p-[13px] m-[7px]" title={'p-[13px] m-[7px]'} />
);
