import React, { useState, useEffect } from 'react';
import { Calculator, DollarSign, Percent, RefreshCw, Info, Download, RotateCcw } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './utils/format';

// Input Component
const NumberInput = ({ 
  label, 
  value, 
  onChange, 
  prefix = "R$", 
  suffix = "", 
  disabled = false,
  placeholder = "0,00",
  className = ""
}: {
  label: string;
  value: number | string;
  onChange?: (val: number) => void;
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onChange) return;
    const rawValue = e.target.value.replace(/[^0-9]/g, '');
    const numValue = rawValue ? parseInt(rawValue) / 100 : 0;
    onChange(numValue);
  };

  const displayValue = typeof value === 'number' 
    ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
    : value;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-xs font-bold text-zinc-700 uppercase tracking-wide">{label}</label>
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
};

// Percent Input with Calculated Value
const PercentInputRow = ({ 
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
}) => (
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
        value={baseValue * (percent / 100)} 
        onChange={onValueChange}
        disabled={!onValueChange} 
        prefix="R$" 
        className={!onValueChange ? "opacity-80" : ""}
      />
    </div>
  </div>
);

// Custom R$ Icon Component
const BRLIcon = ({ className }: { className?: string }) => (
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
);

const SectionHeader = ({ title, color, icon: Icon }: { title: string, color: string, icon: any }) => (
  <div className={`flex items-center gap-2 p-3 ${color} text-white font-bold text-lg rounded-t-lg shadow-sm`}>
    <Icon className="w-5 h-5" />
    {title}
  </div>
);

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
  const [saleExpensesRate, setSaleExpensesRate] = useState(0); // %
  const [commissionRate, setCommissionRate] = useState(0); // %
  const [profitMargin, setProfitMargin] = useState(0); // %

  // Calculated Values
  const [totalCost, setTotalCost] = useState(0);
  const [icmsCreditValue, setIcmsCreditValue] = useState(0);
  const [realCost, setRealCost] = useState(0);
  const [salesPrice, setSalesPrice] = useState(0);
  const [markupMultiplier, setMarkupMultiplier] = useState(0);

  useEffect(() => {
    // 1. Calculate Total Cost (Acquisition)
    const cost = purchasePrice + freight + otherExpenses;
    setTotalCost(cost);

    // 2. Calculate ICMS Credits (Recoverable taxes)
    // Credit on Product + Credit on Freight
    const creditProduct = purchasePrice * (icmsPurchaseRate / 100);
    const creditFreight = freight * (icmsFreightRate / 100);
    const totalCredit = creditProduct + creditFreight;
    setIcmsCreditValue(totalCredit);

    // 3. Calculate Real Cost
    const rCost = cost - totalCredit;
    setRealCost(rCost);

    // 4. Calculate Sales Price (Markup)
    // Formula: Price = Cost / (1 - (Tax + Exp + Comm + Margin))
    const totalDeductionsPercent = icmsSaleRate + saleExpensesRate + commissionRate + profitMargin;
    
    if (totalDeductionsPercent >= 100) {
      setSalesPrice(0); // Avoid division by zero or negative price
      setMarkupMultiplier(0);
    } else {
      const divisor = 1 - (totalDeductionsPercent / 100);
      const price = rCost / divisor;
      setSalesPrice(price);
      
      // Markup Multiplier (how much we multiply real cost to get price)
      // Price = RealCost * Markup
      setMarkupMultiplier(price / (rCost || 1));
    }

  }, [
    purchasePrice, freight, otherExpenses, 
    icmsPurchaseRate, icmsFreightRate,
    icmsSaleRate, saleExpensesRate, commissionRate, profitMargin
  ]);

  const handleSaleExpensesValueChange = (val: number) => {
    // Calculate what percentage this value represents of the final price
    // Formula derivation:
    // Price = RealCost / (1 - (OtherRates + NewExpRate))
    // Price = RealCost / (1 - OtherRates - (Val / Price))
    // Price * (1 - OtherRates) - Val = RealCost
    // Price = (RealCost + Val) / (1 - OtherRates)
    
    const otherRates = icmsSaleRate + commissionRate + profitMargin;
    const divisor = 1 - (otherRates / 100);
    
    if (divisor <= 0) return; // Impossible margin

    const projectedPrice = (realCost + val) / divisor;
    
    if (projectedPrice > 0) {
      const newRate = (val / projectedPrice) * 100;
      setSaleExpensesRate(newRate);
    }
  };

  const handleReset = () => {
    // Reset Inputs
    setPurchasePrice(0);
    setFreight(0);
    setOtherExpenses(0);
    setIcmsPurchaseRate(0);
    setIcmsFreightRate(0);
    setIcmsSaleRate(0);
    setSaleExpensesRate(0);
    setCommissionRate(0);
    setProfitMargin(0);

    // Reset Derived Values (Force update immediately)
    setTotalCost(0);
    setIcmsCreditValue(0);
    setRealCost(0);
    setSalesPrice(0);
    setMarkupMultiplier(0);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();

    // Title
    doc.setFontSize(18);
    doc.text('Resumo de Formação de Preço', 14, 22);
    
    doc.setFontSize(10);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 30);

    // Data for the table
    const tableData = [
      ['Preço de Venda', formatCurrency(salesPrice)],
      ['(-) Custo Real', `-${formatCurrency(realCost)}`],
      ['(-) Impostos/Comissões', `-${formatCurrency(salesPrice * ((icmsSaleRate + saleExpensesRate + commissionRate) / 100))}`],
      ['(=) Lucro Líquido', formatCurrency(salesPrice * (profitMargin / 100))],
    ];

    autoTable(doc, {
      startY: 40,
      head: [['Item', 'Valor']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [217, 119, 6] }, // Amber-600 color (approx #d97706)
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 60, halign: 'right' },
      },
    });

    // Add detailed breakdown
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
  };

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
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-zinc-700 flex items-center justify-center rounded-tl-none">
              <span className="text-white font-bold tracking-widest text-sm -rotate-90 whitespace-nowrap">COMPRA / CUSTOS</span>
            </div>

            <div className="pl-8 space-y-6">
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
                    label="(=) Custo Total (Nota)" 
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
                  <RefreshCw className="w-5 h-5 text-amber-700" />
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
                    percent={saleExpensesRate} 
                    onChange={setSaleExpensesRate} 
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
                  />
                </div>

                <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 space-y-2">
                  <div className="flex justify-between items-center text-sm text-amber-900">
                    <span>Soma das Deduções:</span>
                    <span className="font-mono font-bold">{(icmsSaleRate + saleExpensesRate + commissionRate + profitMargin).toFixed(2)}%</span>
                  </div>
                  <div className="w-full bg-amber-200 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${icmsSaleRate + saleExpensesRate + commissionRate + profitMargin > 100 ? 'bg-red-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min(icmsSaleRate + saleExpensesRate + commissionRate + profitMargin, 100)}%` }}
                    ></div>
                  </div>
                  {(icmsSaleRate + saleExpensesRate + commissionRate + profitMargin) >= 100 && (
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
                      {(icmsSaleRate + saleExpensesRate + commissionRate + profitMargin) >= 100 ? "Erro" : formatCurrency(salesPrice)}
                    </div>
                    <div className="mt-4 pt-4 border-t border-amber-500/50 grid grid-cols-2 gap-4 text-sm opacity-90">
                      <div>
                        <span className="block text-xs opacity-80 text-amber-100">Lucro Líquido (R$)</span>
                        <span className="font-mono font-bold">{formatCurrency(salesPrice * (profitMargin / 100))}</span>
                      </div>
                      <div className="text-right">
                        <span className="block text-xs opacity-80 text-amber-100">Impostos/Desp. (R$)</span>
                        <span className="font-mono font-bold">{formatCurrency(salesPrice * ((icmsSaleRate + saleExpensesRate + commissionRate) / 100))}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary Table */}
              <div className="bg-white rounded-lg border border-zinc-200 p-4 shadow-sm">
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
                    <span className="font-mono">{(salesPrice * ((icmsSaleRate + saleExpensesRate + commissionRate) / 100)) > 0 ? '-' : ''}{formatCurrency(salesPrice * ((icmsSaleRate + saleExpensesRate + commissionRate) / 100))}</span>
                  </div>
                  <div className="flex justify-between pt-1 text-green-600 font-bold">
                    <span>(=) Lucro Líquido</span>
                    <span className="font-mono">{formatCurrency(salesPrice * (profitMargin / 100))}</span>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
