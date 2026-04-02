import React, { useState, useMemo, useCallback } from 'react';
import { Calculator, DollarSign, Percent, RefreshCw, Info, Download, RotateCcw } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './utils/format';

// Input Component - Memoized to prevent unnecessary re-renders
const NumberInput = React.memo(({ 
  label, 
  value, 
  onChange, 
  prefix = "R$", 
  suffix = "", 
  disabled = false,
  placeholder = "0,00",
  className = "",
  labelClassName = "text-zinc-700"
}: {
  label: string;
  value: number | string;
  onChange?: (val: number) => void;
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  labelClassName?: string;
}) => {
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onChange) return;
    const rawValue = e.target.value.replace(/[^0-9]/g, '');
    const numValue = rawValue ? parseInt(rawValue) / 100 : 0;
    onChange(numValue);
  }, [onChange]);

  const displayValue = useMemo(() => 
    typeof value === 'number' 
      ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
      : value,
    [value]
  );

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className={`text-xs font-bold uppercase tracking-wide ${labelClassName}`}>{label}</label>
      <div className={`relative flex items-center bg-white border border-zinc-300 rounded-md shadow-sm focus-within:ring-2 focus-within:ring-amber-500 focus-within:border-amber-500 ${disabled ? 'bg-zinc-100 opacity-80' : ''}`}>
        {prefix && <span className="pl-3 text-zinc-500 text-sm font-medium">{prefix}</span>}
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          value={displayValue}
          onChange={handleChange}
          disabled={disabled}
          className="w-full py-2 px-3 text-right outline-none bg-transparent font-mono text-zinc-800 font-medium"
          placeholder={placeholder}
        />
        {suffix && <span className="pr-3 text-zinc-500 text-sm font-medium">{suffix}</span>}
      </div>
    </div>
  );
});

NumberInput.displayName = 'NumberInput';

// Percent Input with Calculated Value - Memoized
const PercentInputRow = React.memo(({ 
  label, 
  percent, 
  onChange, 
  baseValue,
  onValueChange
}: { 
  label: string, 
  percent: number, 
  onChange: (val: number) => void, 
  baseValue: number,
  onValueChange?: (val: number) => void
}) => {
  const calculatedValue = useMemo(() => baseValue * (percent / 100), [baseValue, percent]);

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="col-span-2">
        <NumberInput 
          label={label} 
          value={percent} 
          onChange={onChange} 
          prefix="" 
          suffix="%" 
        />
      </div>
      <div className="col-span-1">
        <NumberInput 
          label="Valor Calc." 
          value={calculatedValue} 
          onChange={onValueChange}
          disabled={!onValueChange} 
          prefix="R$" 
          className={!onValueChange ? "opacity-80" : ""}
        />
      </div>
    </div>
  );
});

PercentInputRow.displayName = 'PercentInputRow';

// Custom R$ Icon Component - Memoized
const BRLIcon = React.memo(({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <text x="2" y="18" fontSize="16" fontWeight="bold" fontFamily="sans-serif">R$</text>
  </svg>
));

BRLIcon.displayName = 'BRLIcon';

export default function App() {
  // State - Purchase
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [freight, setFreight] = useState(0);
  const [otherExpenses, setOtherExpenses] = useState(0);
  
  // State - Tax Credits (Purchase)
  const [icmsPurchaseRate, setIcmsPurchaseRate] = useState(0); // %
  const [icmsFreightRate, setIcmsFreightRate] = useState(0); // %

  // State - Sale Markup
  const [icmsSaleRate, setIcmsSaleRate] = useState(0); // %
  const [saleExpensesValue, setSaleExpensesValue] = useState(0); // R$ (Fixed Value)
  const [commissionRate, setCommissionRate] = useState(0); // %
  const [profitMargin, setProfitMargin] = useState(0); // %

  // State - Negotiation Tool
  const [targetSalesPrice, setTargetSalesPrice] = useState(0);

  // Memoized Calculations - Replaces useEffect + useState for derived values
  // This is significantly more performant as it avoids cascading state updates
  const { totalCost, icmsCreditValue, realCost } = useMemo(() => {
    const cost = purchasePrice + freight + otherExpenses;
    const creditProduct = purchasePrice * (icmsPurchaseRate / 100);
    const creditFreight = freight * (icmsFreightRate / 100);
    const totalCredit = creditProduct + creditFreight;
    const rCost = cost - totalCredit;

    return {
      totalCost: cost,
      icmsCreditValue: totalCredit,
      realCost: rCost
    };
  }, [purchasePrice, freight, otherExpenses, icmsPurchaseRate, icmsFreightRate]);

  const { salesPrice, markupMultiplier, deductionsRate } = useMemo(() => {
    const percentageDeductions = icmsSaleRate + commissionRate + profitMargin;
    const divisor = 1 - (percentageDeductions / 100);
    const totalBaseCost = realCost + saleExpensesValue;

    if (divisor <= 0) {
      return { salesPrice: 0, markupMultiplier: 0, deductionsRate: percentageDeductions };
    }

    const price = totalBaseCost / divisor;
    const markup = price / (realCost || 1);
    const expensesRate = price > 0 ? (saleExpensesValue / price) * 100 : 0;

    return {
      salesPrice: price,
      markupMultiplier: markup,
      deductionsRate: percentageDeductions + expensesRate
    };
  }, [realCost, saleExpensesValue, icmsSaleRate, commissionRate, profitMargin]);

  const expensesRate = useMemo(() => 
    salesPrice > 0 ? (saleExpensesValue / salesPrice) * 100 : 0,
    [saleExpensesValue, salesPrice]
  );

  // Suggested Purchase Price for Negotiation
  const suggestedPurchasePrice = useMemo(() => {
    if (targetSalesPrice <= 0) return 0;

    const ip = icmsPurchaseRate / 100;
    const ifr = icmsFreightRate / 100;
    const is1 = icmsSaleRate / 100;
    const c = commissionRate / 100;
    const m = profitMargin / 100;

    // Formula: P = [S(1 - (is1 + c + m)) - SE - F(1 - ifr) - OE] / (1 - ip)
    // Where:
    // S = targetSalesPrice
    // SE = saleExpensesValue (fixed)
    // F = freight (fixed)
    // OE = otherExpenses (fixed)
    
    const numerator = targetSalesPrice * (1 - (is1 + c + m)) - saleExpensesValue - freight * (1 - ifr) - otherExpenses;
    const denominator = 1 - ip;

    if (denominator <= 0) return 0;

    const result = numerator / denominator;
    return result > 0 ? result : 0;
  }, [targetSalesPrice, freight, otherExpenses, saleExpensesValue, icmsPurchaseRate, icmsFreightRate, icmsSaleRate, commissionRate, profitMargin]);

  const handleSaleExpensesRateChange = useCallback((newRate: number) => {
    const otherRates = icmsSaleRate + commissionRate + profitMargin;
    const k = 1 - (otherRates / 100);
    const r = newRate / 100;

    if (k - r <= 0.0001) return;

    const newValue = (r * realCost) / (k - r);
    setSaleExpensesValue(newValue);
  }, [icmsSaleRate, commissionRate, profitMargin, realCost]);

  const handleSaleExpensesValueChange = useCallback((val: number) => {
    setSaleExpensesValue(val);
  }, []);

  const handleProfitMarginValueChange = useCallback((val: number) => {
    const cost = realCost + saleExpensesValue;
    const otherRates = (icmsSaleRate + commissionRate) / 100;
    
    if (cost + val === 0) return;

    const newMarginDecimal = (val * (1 - otherRates)) / (cost + val);
    setProfitMargin(newMarginDecimal * 100);
  }, [realCost, saleExpensesValue, icmsSaleRate, commissionRate]);

  const handleReset = useCallback(() => {
    setPurchasePrice(0);
    setFreight(0);
    setOtherExpenses(0);
    setIcmsPurchaseRate(0);
    setIcmsFreightRate(0);
    setIcmsSaleRate(0);
    setSaleExpensesValue(0);
    setCommissionRate(0);
    setProfitMargin(0);
    setTargetSalesPrice(0);
  }, []);

  const handleExportPDF = useCallback(() => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Resumo de Formação de Preço', 14, 22);
    doc.setFontSize(10);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 30);

    const tableData = [
      ['Preço de Venda', formatCurrency(salesPrice)],
      ['(-) Custo Real', `-${formatCurrency(realCost)}`],
      ['(-) Impostos/Comissões', `-${formatCurrency(salesPrice * ((icmsSaleRate + commissionRate) / 100) + saleExpensesValue)}`],
      ['(=) Lucro Líquido', formatCurrency(salesPrice * (profitMargin / 100))],
    ];

    autoTable(doc, {
      startY: 40,
      head: [['Item', 'Valor']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [217, 119, 6] },
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 60, halign: 'right' },
      },
    });

    doc.text('Detalhamento:', 14, (doc as any).lastAutoTable.finalY + 10);

    const detailData = [
      ['Preço Compra', formatCurrency(purchasePrice)],
      ['Frete + Despesas', formatCurrency(freight + otherExpenses)],
      ['Crédito ICMS', `-${formatCurrency(icmsCreditValue)}`],
      ['Custo Real Final', formatCurrency(realCost)],
      ['Markup Multiplier', `${markupMultiplier.toFixed(4)}x`],
    ];

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 15,
      body: detailData,
      theme: 'plain',
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 60, halign: 'right' },
      },
    });
    
    doc.save('formacao-preco.pdf');
  }, [salesPrice, realCost, icmsSaleRate, commissionRate, saleExpensesValue, profitMargin, purchasePrice, freight, otherExpenses, icmsCreditValue, markupMultiplier]);

  const handleApplyNegotiation = useCallback(() => {
    if (targetSalesPrice <= 0) return;

    // 1. Calculate current percentage rates for fixed values to avoid distortion
    // We treat everything as a % of its respective base during this transition
    const fRate = purchasePrice > 0 ? (freight / purchasePrice) : 0;
    const oeAcqRate = purchasePrice > 0 ? (otherExpenses / purchasePrice) : 0;
    const seRate = salesPrice > 0 ? (saleExpensesValue / salesPrice) : 0;

    // 2. Math for Target Purchase Price (P)
    // S = Target Sales Price
    // AF (Acquisition Factor) = (1 - icmsPurchase%) + (fRate * (1 - icmsFreight%)) + oeAcqRate
    // SDF (Sales Deduction Factor) = 1 - (icmsSale% + commission% + profitMargin% + seRate%)
    // P = (S * SDF) / AF

    const ip = icmsPurchaseRate / 100;
    const ifr = icmsFreightRate / 100;
    const is1 = icmsSaleRate / 100;
    const c = commissionRate / 100;
    const m = profitMargin / 100;

    const af = (1 + fRate + oeAcqRate) - (ip + fRate * ifr);
    const sdf = 1 - (is1 + c + m + seRate);

    if (af <= 0 || sdf <= 0) return;

    const targetP = (targetSalesPrice * sdf) / af;

    // 3. Update all values to maintain the proportional integrity
    setPurchasePrice(targetP);
    setFreight(targetP * fRate);
    setOtherExpenses(targetP * oeAcqRate);
    setSaleExpensesValue(targetSalesPrice * seRate);
    
    // Clear target input after applying
    setTargetSalesPrice(0);
  }, [targetSalesPrice, purchasePrice, freight, otherExpenses, salesPrice, saleExpensesValue, icmsPurchaseRate, icmsFreightRate, icmsSaleRate, commissionRate, profitMargin]);

  return (
    <div className="min-h-screen bg-zinc-100 p-4 md:p-8 flex items-center justify-center font-sans">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl overflow-hidden border border-zinc-200">
        
        {/* Header */}
        <div className="bg-zinc-950 text-white p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <img src="/logo.svg" alt="NIVOR Consultoria" className="h-12" />
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <div className="text-right hidden lg:block mr-2">
              <div className="text-sm text-zinc-400">Data</div>
              <div className="font-mono text-zinc-200">{new Date().toLocaleDateString('pt-BR')}</div>
            </div>
            
            <button 
              onClick={handleReset}
              className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-md hover:shadow-zinc-500/20 active:scale-95 border border-zinc-600"
              title="Resetar valores"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Resetar</span>
            </button>

            <button 
              onClick={handleExportPDF}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-md hover:shadow-amber-500/20 active:scale-95 border border-amber-500"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Exportar PDF</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2">
          
          {/* LEFT COLUMN: COMPRA (Zinc/Grey Theme) */}
          <div className="p-6 bg-zinc-50 border-r border-zinc-200 relative">
            {/* Vertical Label Strip */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-zinc-700 rounded-tl-none"></div>

            <div className="pl-4 space-y-6">
              <div className="space-y-4">
                <h2 className="text-zinc-800 font-bold text-lg border-b border-zinc-300 pb-2 flex items-center gap-2">
                  <BRLIcon className="w-6 h-6 text-zinc-600" />
                  Custos de Aquisição
                </h2>
                
                <NumberInput 
                  label="(+) Preço Compra" 
                  value={purchasePrice} 
                  onChange={setPurchasePrice} 
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <NumberInput 
                    label="(+) Valor Frete" 
                    value={freight} 
                    onChange={setFreight} 
                  />
                  <NumberInput 
                    label="(+) Outras Despesas" 
                    value={otherExpenses} 
                    onChange={setOtherExpenses} 
                  />
                </div>

                <div className="pt-2">
                  <NumberInput 
                    label="(=) CUSTO TOTAL DO PRODUTO" 
                    value={totalCost} 
                    disabled 
                    className="opacity-100"
                    prefix="R$"
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-dashed border-zinc-300">
                <h2 className="text-zinc-800 font-bold text-lg border-b border-zinc-300 pb-2 flex items-center gap-2">
                  <Percent className="w-5 h-5 text-zinc-600" />
                  Créditos de Impostos
                </h2>
                
                <div className="space-y-4">
                  <PercentInputRow 
                    label="(-) ICMS Compra (%)" 
                    percent={icmsPurchaseRate} 
                    onChange={setIcmsPurchaseRate} 
                    baseValue={purchasePrice}
                  />
                  <PercentInputRow 
                    label="(-) ICMS Frete (%)" 
                    percent={icmsFreightRate} 
                    onChange={setIcmsFreightRate} 
                    baseValue={freight}
                  />
                </div>

                <div className="bg-zinc-100 p-3 rounded-lg border border-zinc-200 flex justify-between items-center text-sm text-zinc-800">
                  <span>Total Crédito ICMS:</span>
                  <span className="font-mono font-bold">{formatCurrency(icmsCreditValue)}</span>
                </div>

                <div className="pt-2">
                  <div className="bg-zinc-800 text-white p-4 rounded-xl shadow-lg transform transition-all hover:scale-[1.02] border border-zinc-700">
                    <label className="block text-xs font-bold uppercase tracking-wider opacity-80 mb-1">(=) Custo Real do Produto</label>
                    <div className="text-3xl font-mono font-bold tracking-tight text-white">
                      {formatCurrency(realCost)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: VENDA (Amber/Gold Theme) */}
          <div className="p-6 bg-[#fffbf2] relative">
            {/* Vertical Label Strip */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-200 lg:hidden"></div> {/* Mobile divider */}
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-amber-600 hidden lg:flex items-center justify-center">
              <span className="text-white font-bold tracking-widest text-sm rotate-90 whitespace-nowrap">VENDA / MARKUP</span>
            </div>

            <div className="pr-0 lg:pr-8 space-y-6">
              <div className="space-y-4">
                <h2 className="text-amber-900 font-bold text-lg border-b border-amber-200 pb-2 flex items-center gap-2">
                  <BRLIcon className="w-5 h-5 text-amber-700" />
                  Preço Venda (Markup)
                </h2>

                <div className="space-y-4">
                  <PercentInputRow 
                    label="ICMS Venda (%)" 
                    percent={icmsSaleRate} 
                    onChange={setIcmsSaleRate} 
                    baseValue={salesPrice}
                  />
                  <PercentInputRow 
                    label="Outras Despesas (%)" 
                    percent={expensesRate} 
                    onChange={handleSaleExpensesRateChange} 
                    baseValue={salesPrice}
                    onValueChange={handleSaleExpensesValueChange}
                  />
                  <PercentInputRow 
                    label="Comissão Venda (%)" 
                    percent={commissionRate} 
                    onChange={setCommissionRate} 
                    baseValue={salesPrice}
                  />
                  <PercentInputRow 
                    label="Margem de Lucro (%)" 
                    percent={profitMargin} 
                    onChange={setProfitMargin} 
                    baseValue={salesPrice}
                    onValueChange={handleProfitMarginValueChange}
                  />
                </div>

                <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 space-y-2">
                  <div className="flex justify-between items-center text-sm text-amber-900">
                    <span>Soma das Deduções:</span>
                    <span className="font-mono font-bold">{deductionsRate.toFixed(2)}%</span>
                  </div>
                  <div className="w-full bg-amber-200 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${deductionsRate > 100 ? 'bg-red-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min(deductionsRate, 100)}%` }}
                    ></div>
                  </div>
                  {deductionsRate >= 100 && (
                    <div className="text-xs text-red-600 font-bold flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Margem impossível (maior que 100%)
                    </div>
                  )}
                </div>

                <div className="pt-4">
                  <div className="bg-amber-600 text-white p-6 rounded-xl shadow-lg transform transition-all hover:scale-[1.02] border border-amber-500">
                    <div className="flex justify-between items-end mb-2">
                      <label className="block text-xs font-bold uppercase tracking-wider opacity-90 text-amber-50">Valor Total de Venda</label>
                      <span className="text-xs bg-amber-700 px-2 py-1 rounded text-amber-50 font-mono border border-amber-500">
                        Markup: {markupMultiplier.toFixed(4)}x
                      </span>
                    </div>
                    <div className="text-4xl font-mono font-bold tracking-tight text-white">
                      {deductionsRate >= 100 ? "Erro" : formatCurrency(salesPrice)}
                    </div>
                    <div className="mt-4 pt-4 border-t border-amber-500/50 grid grid-cols-2 gap-4 text-sm opacity-90">
                      <div>
                        <span className="block text-xs opacity-80 text-amber-100">Lucro Líquido (R$)</span>
                        <span className="font-mono font-bold">{formatCurrency(salesPrice * (profitMargin / 100))}</span>
                      </div>
                      <div className="text-right">
                        <span className="block text-xs opacity-80 text-amber-100">Impostos/Desp. (R$)</span>
                        <span className="font-mono font-bold">{formatCurrency(salesPrice * ((icmsSaleRate + commissionRate) / 100) + saleExpensesValue)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary Table */}
              <div className="bg-white rounded-lg border border-zinc-200 p-4 shadow-sm mb-6">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Resumo da Operação</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-zinc-100 pb-1">
                    <span className="text-zinc-600">Preço Venda</span>
                    <span className="font-mono font-bold text-zinc-900">{formatCurrency(salesPrice)}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-100 pb-1 text-red-600">
                    <span>(-) Custo Real</span>
                    <span className="font-mono">{realCost > 0 ? '-' : ''}{formatCurrency(realCost)}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-100 pb-1 text-red-600">
                    <span>(-) Impostos/Comissões</span>
                    <span className="font-mono">{(salesPrice * ((icmsSaleRate + commissionRate) / 100) + saleExpensesValue) > 0 ? '-' : ''}{formatCurrency(salesPrice * ((icmsSaleRate + commissionRate) / 100) + saleExpensesValue)}</span>
                  </div>
                  <div className="flex justify-between pt-1 text-green-600 font-bold">
                    <span>(=) Lucro Líquido</span>
                    <span className="font-mono">{formatCurrency(salesPrice * (profitMargin / 100))}</span>
                  </div>
                </div>
              </div>

              {/* Negotiation Tool */}
              <div className="bg-zinc-900 rounded-xl p-5 shadow-inner border border-zinc-800">
                <div className="flex items-center gap-2 mb-4">
                  <Calculator className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Ferramenta de Negociação</h3>
                </div>
                
                <div className="space-y-4">
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Informe o preço de venda desejado pelo mercado. O sistema mostrará o preço de compra ideal para manter suas margens.
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="w-full">
                      <NumberInput 
                        label="Preço de Venda Aceito no Mercado" 
                        value={targetSalesPrice} 
                        onChange={setTargetSalesPrice}
                        className="bg-zinc-800 rounded-lg p-1"
                        labelClassName="text-zinc-400"
                      />
                    </div>
                    <div className="w-full">
                      <div className="flex flex-col gap-1 bg-zinc-800 rounded-lg p-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide px-1">Preço de Compra Ideal</label>
                        <div className="py-2 px-3 text-right font-mono text-amber-400 font-bold text-lg">
                          {formatCurrency(suggestedPurchasePrice)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {suggestedPurchasePrice > 0 && (
                    <button
                      onClick={handleApplyNegotiation}
                      className="w-full mt-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-500 py-2 rounded-lg text-xs font-bold border border-amber-600/30 transition-all flex items-center justify-center gap-2 active:scale-95"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Aplicar este cenário à calculadora
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
