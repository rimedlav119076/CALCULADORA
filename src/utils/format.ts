const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatCurrency = (value: number) => {
  return currencyFormatter.format(value);
};

export const formatPercent = (value: number) => {
  return percentFormatter.format(value / 100);
};

export const parseCurrency = (value: string) => {
  return Number(value.replace(/[^0-9,-]+/g, '').replace(',', '.'));
};
