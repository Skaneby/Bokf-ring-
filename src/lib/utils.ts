// Cached — Intl.NumberFormat-konstruktion är dyr och anropas per rapportrad
const sekFormat = new Intl.NumberFormat('sv-SE', {
  style: 'currency',
  currency: 'SEK',
});

export function formatCurrency(amount: number) {
  return sekFormat.format(amount);
}
