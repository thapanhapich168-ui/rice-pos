export const EXCHANGE_RATE = 4000;

export const formatRiel = (amount: number) => `${new Intl.NumberFormat('en-US').format(Math.round(amount))} ៛`;

export const formatUSD = (amount: number) => `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;

export const formatNumber = (v: number) => new Intl.NumberFormat('en-US').format(v);

export const parseOwner = (ownerStr: any) => {
  const o = (ownerStr || '').toLowerCase().trim();
  if (o === 'mom') return 'mom';
  if (o === 'pich') return 'pich';
  if (o === 'jing') return 'jing';
  return 'both'; 
};