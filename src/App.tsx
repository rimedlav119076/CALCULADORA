import * as React from 'react';
import { useState, useMemo, useCallback, useEffect, Component } from 'react';
import { Calculator, DollarSign, Percent, RefreshCw, Info, Download, RotateCcw, LogIn, LogOut, Save, History, CheckCircle2, AlertCircle, Trash2, Calendar, User as UserIcon, Package, Plus, Edit2 } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatCurrency } from './utils/format';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  doc, 
  setDoc, 
  getDoc,
  updateDoc,
  addDoc, 
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteDoc,
  Timestamp,
  User
} from './firebase';

// Error Handling Types
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Error Boundary Component (Placeholder)
const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

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
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState("");
  const isPercent = suffix === "%";

  // Format value for display
  const formatValue = useCallback((val: number | string) => {
    if (typeof val !== 'number') return String(val);
    return val.toLocaleString('pt-BR', { 
      minimumFractionDigits: isPercent ? 0 : 2, 
      maximumFractionDigits: isPercent ? 4 : 2 
    });
  }, [isPercent]);

  // Sync local value when prop changes and not focused
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(formatValue(value));
    }
  }, [value, isFocused, formatValue]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    
    // Allow typing only numbers, one comma/dot
    // We keep the raw string in local state to allow typing
    setLocalValue(val);
    
    // Parse for parent state
    // Remove thousands separator (dot) and replace decimal separator (comma) with dot
    const cleanVal = val.replace(/\./g, '').replace(',', '.');
    const numValue = cleanVal === '' ? 0 : parseFloat(cleanVal);
    
    if (!isNaN(numValue) && onChange) {
      onChange(numValue);
    }
  }, [onChange]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    // When focusing, show a cleaner version for editing (no thousands separator)
    if (typeof value === 'number') {
      setLocalValue(value.toLocaleString('pt-BR', { 
        useGrouping: false, 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 4 
      }).replace('.', ','));
    }
  }, [value]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    // Formatting happens via the useEffect sync
  }, []);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className={`text-xs font-bold uppercase tracking-wide ${labelClassName}`}>{label}</label>
      <div className={`relative flex items-center bg-white border border-zinc-300 rounded-md shadow-sm focus-within:ring-2 focus-within:ring-amber-500 focus-within:border-amber-500 ${disabled ? 'bg-zinc-100 opacity-80' : ''}`}>
        {prefix && <span className="pl-3 text-zinc-500 text-sm font-medium">{prefix}</span>}
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoCorrect="off"
          value={localValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
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
    <div className="grid grid-cols-2 gap-4">
      <div>
        <NumberInput 
          label={label} 
          value={percent} 
          onChange={onChange} 
          prefix="" 
          suffix="%" 
        />
      </div>
      <div>
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
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // State - Save Modal
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [productName, setProductName] = useState('');
  const [representativeName, setRepresentativeName] = useState('');

  // State - History Modal
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [savedCalculations, setSavedCalculations] = useState<any[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // State - Products (for suggestions and management)
  const [isProductsModalOpen, setIsProductsModalOpen] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [productSuggestions, setProductSuggestions] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

  // State - Purchase
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [freight, setFreight] = useState(0);
  const [otherExpenses, setOtherExpenses] = useState(0);
  
  // State - Tax Credits (Purchase)
  const [icmsPurchaseRate, setIcmsPurchaseRate] = useState(0); // %
  const [icmsFreightRate, setIcmsFreightRate] = useState(0); // %

  // State - Sale Markup
  const [icmsSaleRate, setIcmsSaleRate] = useState(0); // %
  const [pisSaleRate, setPisSaleRate] = useState(0.165); // %
  const [cofinsSaleRate, setCofinsSaleRate] = useState(0.76); // %
  const [saleExpensesValue, setSaleExpensesValue] = useState(0); // R$ (Fixed Value)
  const [commissionRate, setCommissionRate] = useState(0); // %
  const [profitMargin, setProfitMargin] = useState(0); // %

  // State - Negotiation Tool
  const [targetSalesPrice, setTargetSalesPrice] = useState(0);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);

      if (currentUser) {
        // Ensure user document exists
        const userDocRef = doc(db, 'users', currentUser.uid);
        try {
          const userDoc = await getDoc(userDocRef);
          if (!userDoc.exists()) {
            await setDoc(userDocRef, {
              email: currentUser.email,
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              plan: 'FREE',
              createdAt: Timestamp.now()
            });
          }
        } catch (error) {
          console.error("Error checking/creating user doc:", error);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch History
  useEffect(() => {
    if (!user) {
      setSavedCalculations([]);
      return;
    }

    const q = query(
      collection(db, 'calculations'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const calcs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSavedCalculations(calcs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'calculations');
    });

    return () => unsubscribe();
  }, [user]);

  // Fetch Products for suggestions
  useEffect(() => {
    if (!user) {
      setProducts([]);
      return;
    }

    const q = query(
      collection(db, 'products'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prods = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a: any, b: any) => a.name.localeCompare(b.name));
      setProducts(prods);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    return () => unsubscribe();
  }, [user]);

  // Handle Product Name Change with suggestions
  const handleProductNameChange = useCallback((name: string) => {
    setProductName(name);
    setSelectedProductId(null);
    
    if (name.length > 1) {
      const normalizedSearch = name.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      
      // Merge names from products and calculations to ensure we find everything
      const allNamesMap = new Map();
      
      // Add from products collection
      products.forEach(p => {
        allNamesMap.set(p.name.toLowerCase().trim(), { id: p.id, name: p.name, type: 'product' });
      });
      
      // Add from history (calculations) if not already there
      savedCalculations.forEach(c => {
        if (c.productName) {
          const key = c.productName.toLowerCase().trim();
          if (!allNamesMap.has(key)) {
            allNamesMap.set(key, { id: c.productId || `history-${key}`, name: c.productName, type: 'history' });
          }
        }
      });

      const filtered = Array.from(allNamesMap.values())
        .filter(item => {
          const normalizedName = item.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return normalizedName.includes(normalizedSearch);
        })
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 6);
      
      setProductSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setProductSuggestions([]);
      setShowSuggestions(false);
    }
  }, [products, savedCalculations]);

  const selectProduct = useCallback((product: any) => {
    setProductName(product.name);
    setSelectedProductId(product.id);
    setShowSuggestions(false);
  }, []);

  // Memoized Calculations
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
    const percentageDeductions = icmsSaleRate + pisSaleRate + cofinsSaleRate + commissionRate + profitMargin;
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
  }, [realCost, saleExpensesValue, icmsSaleRate, pisSaleRate, cofinsSaleRate, commissionRate, profitMargin]);

  const expensesRate = useMemo(() => 
    salesPrice > 0 ? (saleExpensesValue / salesPrice) * 100 : 0,
    [saleExpensesValue, salesPrice]
  );

  // Suggested Values for Negotiation
  const negotiationResults = useMemo(() => {
    if (targetSalesPrice <= 0) return null;

    const ip = icmsPurchaseRate / 100;
    const ifr = icmsFreightRate / 100;
    const is1 = icmsSaleRate / 100;
    const p = pisSaleRate / 100;
    const cf = cofinsSaleRate / 100;
    const c = commissionRate / 100;
    const m = profitMargin / 100;

    // Case 1: Target Price is LOWER or EQUAL to current calculated price
    // Focus: Negotiation with supplier (Calculate Ideal Purchase Price)
    if (targetSalesPrice <= salesPrice) {
      const numerator = targetSalesPrice * (1 - (is1 + p + cf + c + m)) - saleExpensesValue - freight * (1 - ifr) - otherExpenses;
      const denominator = 1 - ip;
      const result = denominator > 0 ? Math.max(0, numerator / denominator) : 0;
      
      return {
        type: 'purchase',
        label: 'Preço de Compra Ideal',
        value: result
      };
    } 
    
    // Case 2: Target Price is GREATER than current calculated price
    // Focus: Profit Optimization (Calculate Suggested Profit Margin)
    else {
      const totalBaseCost = realCost + saleExpensesValue;
      const otherSalesRates = (icmsSaleRate + pisSaleRate + cofinsSaleRate + commissionRate) / 100;
      
      // Formula: m = 1 - OtherRates - (Cost / TargetPrice)
      const newMarginDecimal = 1 - otherSalesRates - (totalBaseCost / targetSalesPrice);
      const newMarginPercent = Math.max(0, newMarginDecimal * 100);

      return {
        type: 'margin',
        label: 'Margem de Lucro Sugerida',
        value: newMarginPercent
      };
    }
  }, [targetSalesPrice, salesPrice, realCost, freight, otherExpenses, saleExpensesValue, icmsPurchaseRate, icmsFreightRate, icmsSaleRate, pisSaleRate, cofinsSaleRate, commissionRate, profitMargin]);

  const handleSaleExpensesRateChange = useCallback((newRate: number) => {
    const otherRates = icmsSaleRate + pisSaleRate + cofinsSaleRate + commissionRate + profitMargin;
    const k = 1 - (otherRates / 100);
    const r = newRate / 100;

    if (k - r <= 0.0001) return;

    const newValue = (r * realCost) / (k - r);
    setSaleExpensesValue(newValue);
  }, [icmsSaleRate, pisSaleRate, cofinsSaleRate, commissionRate, profitMargin, realCost]);

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
    setPisSaleRate(0.165);
    setCofinsSaleRate(0.76);
    setSaleExpensesValue(0);
    setCommissionRate(0);
    setProfitMargin(0);
    setTargetSalesPrice(0);
  }, []);

  const handleExportPDF = useCallback(() => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('pt-BR');
    const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Header
    doc.setFillColor(24, 24, 27); // zinc-950
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('NIVOR CONSULTORIA', 14, 20);
    doc.setFontSize(10);
    doc.text('Análise de Formação de Preço e Rentabilidade', 14, 28);
    doc.text(`Gerado em: ${dateStr} às ${timeStr}`, 140, 28);

    // Section 1: Identificação (if available)
    let currentY = 50;
    if (productName || representativeName) {
      doc.setTextColor(24, 24, 27);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('IDENTIFICAÇÃO', 14, currentY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      currentY += 8;
      if (productName) {
        doc.text(`Produto: ${productName}`, 14, currentY);
        currentY += 6;
      }
      if (representativeName) {
        doc.text(`Representante/Fornecedor: ${representativeName}`, 14, currentY);
        currentY += 6;
      }
      currentY += 4;
    }

    // Section 2: Custos de Aquisição
    doc.setTextColor(24, 24, 27);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('1. CUSTOS DE AQUISIÇÃO', 14, currentY);
    currentY += 5;

    const acquisitionData = [
      ['Preço de Compra (R$)', '', formatCurrency(purchasePrice)],
      ['Valor do Frete (R$)', '', formatCurrency(freight)],
      ['Outras Despesas (R$)', '', formatCurrency(otherExpenses)],
      ['Crédito ICMS Compra (%)', `${icmsPurchaseRate.toFixed(2)}%`, formatCurrency(purchasePrice * (icmsPurchaseRate / 100))],
      ['Crédito ICMS Frete (%)', `${icmsFreightRate.toFixed(2)}%`, formatCurrency(freight * (icmsFreightRate / 100))],
      ['VALOR DO CRÉDITO ICMS (R$)', '', formatCurrency(icmsCreditValue)],
      ['CUSTO REAL DO PRODUTO (R$)', '', formatCurrency(realCost)],
    ];

    autoTable(doc, {
      startY: currentY,
      body: acquisitionData,
      theme: 'grid',
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { cellWidth: 45, halign: 'right' },
        2: { cellWidth: 45, halign: 'right', fontStyle: 'bold' },
      },
      headStyles: { fillColor: [24, 24, 27] },
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;

    // Section 3: Formação de Preço de Venda
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('2. FORMAÇÃO DE PREÇO DE VENDA', 14, currentY);
    currentY += 5;

    const salesData = [
      ['ICMS sobre Venda (%)', `${icmsSaleRate.toFixed(2)}%`, formatCurrency(salesPrice * (icmsSaleRate / 100))],
      ['PIS sobre Venda (%)', `${pisSaleRate.toFixed(3)}%`, formatCurrency(salesPrice * (pisSaleRate / 100))],
      ['COFINS sobre Venda (%)', `${cofinsSaleRate.toFixed(3)}%`, formatCurrency(salesPrice * (cofinsSaleRate / 100))],
      ['Outras Despesas (%)', `${expensesRate.toFixed(2)}%`, formatCurrency(saleExpensesValue)],
      ['Comissão de Venda (%)', `${commissionRate.toFixed(2)}%`, formatCurrency(salesPrice * (commissionRate / 100))],
      ['Margem de Lucro Desejada (%)', `${profitMargin.toFixed(2)}%`, formatCurrency(salesPrice * (profitMargin / 100))],
      ['Markup Multiplicador', '', `${markupMultiplier.toFixed(4)}x`],
      ['PREÇO DE VENDA CALCULADO (R$)', '', formatCurrency(salesPrice)],
    ];

    autoTable(doc, {
      startY: currentY,
      body: salesData,
      theme: 'grid',
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { cellWidth: 45, halign: 'right' },
        2: { cellWidth: 45, halign: 'right', fontStyle: 'bold' },
      },
      headStyles: { fillColor: [217, 119, 6] },
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;

    // Section 4: Resumo da Operação
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('3. RESUMO DA OPERAÇÃO', 14, currentY);
    currentY += 5;

    const summaryData = [
      ['Faturamento Bruto', '', formatCurrency(salesPrice)],
      ['(-) Custo Real da Mercadoria', '', `-${formatCurrency(realCost)}`],
      ['(-) Impostos e Comissões', '', `-${formatCurrency(salesPrice * ((icmsSaleRate + pisSaleRate + cofinsSaleRate + commissionRate) / 100) + saleExpensesValue)}`],
      ['(=) LUCRO LÍQUIDO FINAL', '', formatCurrency(salesPrice * (profitMargin / 100))],
    ];

    autoTable(doc, {
      startY: currentY,
      body: summaryData,
      theme: 'striped',
      styles: { fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { cellWidth: 45, halign: 'right' },
        2: { cellWidth: 45, halign: 'right', fontStyle: 'bold' },
      },
    });

    doc.save(`analise-${productName || 'calculo'}-${dateStr.replace(/\//g, '-')}.pdf`);
  }, [salesPrice, realCost, icmsSaleRate, pisSaleRate, cofinsSaleRate, commissionRate, saleExpensesValue, profitMargin, purchasePrice, freight, otherExpenses, icmsCreditValue, markupMultiplier, icmsPurchaseRate, icmsFreightRate, expensesRate, productName, representativeName]);

  const handleExportExcel = useCallback(() => {
    const dateStr = new Date().toLocaleDateString('pt-BR');
    
    const data = [
      ['NIVOR CONSULTORIA - ANÁLISE DE PRECIFICAÇÃO'],
      ['Gerado em:', dateStr],
      [''],
      ['IDENTIFICAÇÃO'],
      ['Produto:', productName || 'Não informado'],
      ['Representante/Fornecedor:', representativeName || 'Não informado'],
      [''],
      ['1. CUSTOS DE AQUISIÇÃO', 'Percentual (%)', 'Valor (R$)'],
      ['Preço de Compra', '', purchasePrice],
      ['Valor do Frete', '', freight],
      ['Outras Despesas', '', otherExpenses],
      ['Crédito ICMS Compra (%)', icmsPurchaseRate / 100, purchasePrice * (icmsPurchaseRate / 100)],
      ['Crédito ICMS Frete (%)', icmsFreightRate / 100, freight * (icmsFreightRate / 100)],
      ['Valor Crédito ICMS', '', icmsCreditValue],
      ['CUSTO REAL FINAL', '', realCost],
      [''],
      ['2. FORMAÇÃO DE PREÇO DE VENDA', 'Percentual (%)', 'Valor (R$)'],
      ['ICMS sobre Venda (%)', icmsSaleRate / 100, salesPrice * (icmsSaleRate / 100)],
      ['PIS sobre Venda (%)', pisSaleRate / 100, salesPrice * (pisSaleRate / 100)],
      ['COFINS sobre Venda (%)', cofinsSaleRate / 100, salesPrice * (cofinsSaleRate / 100)],
      ['Outras Despesas (%)', expensesRate / 100, saleExpensesValue],
      ['Comissão de Venda (%)', commissionRate / 100, salesPrice * (commissionRate / 100)],
      ['Margem de Lucro (%)', profitMargin / 100, salesPrice * (profitMargin / 100)],
      ['Markup Multiplicador', '', markupMultiplier],
      ['PREÇO DE VENDA CALCULADO', '', salesPrice],
      [''],
      ['3. RESUMO FINANCEIRO', '', 'Valor (R$)'],
      ['Faturamento Bruto', '', salesPrice],
      ['Custo Real Mercadoria', '', realCost],
      ['Impostos e Comissões', '', (salesPrice * ((icmsSaleRate + pisSaleRate + cofinsSaleRate + commissionRate) / 100) + saleExpensesValue)],
      ['LUCRO LÍQUIDO', '', (salesPrice * (profitMargin / 100))],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // Formatting percentages and currency (basic)
    // Column B (index 1) for percentages, Column C (index 2) for currency
    const currencyRows = [9, 10, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 23, 25, 28, 29, 30, 31];
    const percentRows = [12, 13, 18, 19, 20, 21, 22, 23];
    
    currencyRows.forEach(row => {
      const cell = ws[XLSX.utils.encode_cell({ r: row - 1, c: 2 })];
      if (cell) cell.z = '"R$ "#,##0.00';
    });
    
    percentRows.forEach(row => {
      const cell = ws[XLSX.utils.encode_cell({ r: row - 1, c: 1 })];
      if (cell) cell.z = '0.00%';
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Análise");
    XLSX.writeFile(wb, `analise-${productName || 'calculo'}.xlsx`);
  }, [productName, representativeName, purchasePrice, freight, otherExpenses, icmsPurchaseRate, icmsFreightRate, icmsCreditValue, realCost, icmsSaleRate, pisSaleRate, cofinsSaleRate, expensesRate, commissionRate, profitMargin, markupMultiplier, salesPrice, saleExpensesValue]);

  const handleApplyNegotiation = useCallback(() => {
    if (!negotiationResults || targetSalesPrice <= 0) return;

    if (negotiationResults.type === 'purchase') {
      setPurchasePrice(negotiationResults.value);
    } else {
      setProfitMargin(negotiationResults.value);
    }
    
    // Clear target input after applying
    setTargetSalesPrice(0);
  }, [targetSalesPrice, negotiationResults]);

  const handleLogin = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  }, []);

  const handleSaveCalculation = useCallback(async () => {
    if (!user) {
      handleLogin();
      return;
    }
    setIsSaveModalOpen(true);
  }, [user, handleLogin]);

  const handleConfirmSave = useCallback(async () => {
    if (!user || !productName) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      let finalProductId = selectedProductId;

      // If no product selected, check if it exists by name (case insensitive)
      if (!finalProductId) {
        const normalizedNewName = productName.toLowerCase().trim();
        const existingProduct = products.find(p => p.name.toLowerCase().trim() === normalizedNewName);
        
        if (existingProduct) {
          finalProductId = existingProduct.id;
        } else {
          // Create new product entry
          const newProductRef = await addDoc(collection(db, 'products'), {
            userId: user.uid,
            name: productName.trim(),
            supplierName: representativeName.trim(),
            baseCost: purchasePrice,
            icmsPurchaseRate,
            icmsFreightRate,
            icmsSaleRate,
            pisSaleRate,
            cofinsSaleRate,
            createdAt: Timestamp.now()
          });
          finalProductId = newProductRef.id;
        }
      }

      const calculationData = {
        userId: user.uid,
        productId: finalProductId,
        productName: productName.trim(),
        representativeName: representativeName.trim(),
        purchasePrice,
        freight,
        otherExpenses,
        icmsPurchaseRate,
        icmsFreightRate,
        icmsSaleRate,
        pisSaleRate,
        cofinsSaleRate,
        saleExpensesValue,
        commissionRate,
        profitMargin,
        salesPrice,
        realCost,
        totalCost,
        createdAt: Timestamp.now()
      };

      await addDoc(collection(db, 'calculations'), calculationData);
      setSaveSuccess(true);
      setIsSaveModalOpen(false);
      setProductName('');
      setRepresentativeName('');
      setSelectedProductId(null);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'calculations');
    } finally {
      setIsSaving(false);
    }
  }, [user, productName, selectedProductId, products, representativeName, purchasePrice, freight, otherExpenses, icmsPurchaseRate, icmsFreightRate, icmsSaleRate, saleExpensesValue, commissionRate, profitMargin, salesPrice, realCost, totalCost]);

  const handleLoadCalculation = useCallback((calc: any) => {
    setPurchasePrice(calc.purchasePrice || 0);
    setFreight(calc.freight || 0);
    setOtherExpenses(calc.otherExpenses || 0);
    setIcmsPurchaseRate(calc.icmsPurchaseRate || 0);
    setIcmsFreightRate(calc.icmsFreightRate || 0);
    setIcmsSaleRate(calc.icmsSaleRate || 0);
    setPisSaleRate(calc.pisSaleRate || 0.165);
    setCofinsSaleRate(calc.cofinsSaleRate || 0.76);
    setSaleExpensesValue(calc.saleExpensesValue || 0);
    setCommissionRate(calc.commissionRate || 0);
    setProfitMargin(calc.profitMargin || 0);
    setIsHistoryModalOpen(false);
  }, []);

  const handleDeleteCalculation = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'calculations', id));
      setDeletingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `calculations/${id}`);
    }
  }, []);

  const handleSaveProduct = useCallback(async (productData: any) => {
    if (!user) return;
    setIsSavingProduct(true);
    try {
      if (productData.id) {
        // Update
        const productRef = doc(db, 'products', productData.id);
        await updateDoc(productRef, {
          name: productData.name.trim(),
          supplierName: (productData.supplierName || '').trim(),
          baseCost: productData.baseCost || 0,
          icmsPurchaseRate: productData.icmsPurchaseRate || 0,
          icmsFreightRate: productData.icmsFreightRate || 0,
          icmsSaleRate: productData.icmsSaleRate || 0,
          pisSaleRate: productData.pisSaleRate || 0.165,
          cofinsSaleRate: productData.cofinsSaleRate || 0.76,
          updatedAt: Timestamp.now()
        });
      } else {
        // Create
        await addDoc(collection(db, 'products'), {
          userId: user.uid,
          name: productData.name.trim(),
          supplierName: (productData.supplierName || '').trim(),
          baseCost: productData.baseCost || 0,
          icmsPurchaseRate: productData.icmsPurchaseRate || 0,
          icmsFreightRate: productData.icmsFreightRate || 0,
          icmsSaleRate: productData.icmsSaleRate || 0,
          pisSaleRate: productData.pisSaleRate || 0.165,
          cofinsSaleRate: productData.cofinsSaleRate || 0.76,
          createdAt: Timestamp.now()
        });
      }
      setEditingProduct(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'products');
    } finally {
      setIsSavingProduct(false);
    }
  }, [user]);

  const handleDeleteProduct = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'products', id));
      setDeletingProductId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
    }
  }, []);

  const handleSelectProductForCalculator = useCallback((product: any) => {
    setPurchasePrice(product.baseCost || 0);
    // Also update the product name and representative name in the state
    setProductName(product.name);
    setRepresentativeName(product.supplierName || '');
    
    // Load tax rates if they exist
    if (product.icmsPurchaseRate !== undefined) setIcmsPurchaseRate(product.icmsPurchaseRate);
    if (product.icmsFreightRate !== undefined) setIcmsFreightRate(product.icmsFreightRate);
    if (product.icmsSaleRate !== undefined) setIcmsSaleRate(product.icmsSaleRate);
    if (product.pisSaleRate !== undefined) setPisSaleRate(product.pisSaleRate);
    if (product.cofinsSaleRate !== undefined) setCofinsSaleRate(product.cofinsSaleRate);

    setSelectedProductId(product.id);
    setIsProductsModalOpen(false);
  }, []);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-zinc-100 p-4 md:p-8 flex items-center justify-center font-sans">
        <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl overflow-hidden border border-zinc-200">
          
          {/* Header */}
          <div className="bg-zinc-950 text-white p-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <img src="/logo.svg" alt="NIVOR Consultoria" className="h-12" />
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto justify-end">
              {user ? (
                <div className="flex items-center gap-3 mr-2">
                  <div className="text-right hidden sm:block">
                    <div className="text-[10px] text-zinc-500 uppercase font-bold">Usuário</div>
                    <div className="text-xs text-zinc-200 font-medium">{user.displayName}</div>
                  </div>
                  <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-zinc-700" />
                  <button 
                    onClick={handleLogout}
                    className="p-2 text-zinc-400 hover:text-white transition-colors"
                    title="Sair"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleLogin}
                  className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-zinc-700 active:scale-95"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Entrar</span>
                </button>
              )}
              
              <button 
                onClick={() => setIsProductsModalOpen(true)}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-zinc-700 active:scale-95"
                title="Gerenciar Produtos"
              >
                <Package className="w-4 h-4 text-amber-500" />
                <span className="hidden sm:inline">Produtos</span>
              </button>

              <button 
                onClick={() => setIsHistoryModalOpen(true)}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-zinc-700 active:scale-95"
                title="Ver Histórico"
              >
                <History className="w-4 h-4 text-amber-500" />
                <span className="hidden sm:inline">Histórico</span>
              </button>

              <div className="h-8 w-[1px] bg-zinc-800 mx-1 hidden sm:block"></div>

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
                title="Exportar PDF"
              >
                <Download className="w-4 h-4" />
                <span className="hidden lg:inline">PDF</span>
              </button>

              <button 
                onClick={handleExportExcel}
                className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-md hover:shadow-green-500/20 active:scale-95 border border-green-600"
                title="Exportar Excel"
              >
                <Download className="w-4 h-4" />
                <span className="hidden lg:inline">Excel</span>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <PercentInputRow 
                      label="PIS Venda (%)" 
                      percent={pisSaleRate} 
                      onChange={setPisSaleRate} 
                      baseValue={salesPrice}
                    />
                    <PercentInputRow 
                      label="COFINS Venda (%)" 
                      percent={cofinsSaleRate} 
                      onChange={setCofinsSaleRate} 
                      baseValue={salesPrice}
                    />
                  </div>
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
                        <span className="font-mono font-bold">{formatCurrency(salesPrice * ((icmsSaleRate + pisSaleRate + cofinsSaleRate + commissionRate) / 100) + saleExpensesValue)}</span>
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
                    <span className="font-mono">{(salesPrice * ((icmsSaleRate + pisSaleRate + cofinsSaleRate + commissionRate) / 100) + saleExpensesValue) > 0 ? '-' : ''}{formatCurrency(salesPrice * ((icmsSaleRate + pisSaleRate + cofinsSaleRate + commissionRate) / 100) + saleExpensesValue)}</span>
                  </div>
                  <div className="flex justify-between pt-1 text-green-600 font-bold">
                    <span>(=) Lucro Líquido</span>
                    <span className="font-mono">{formatCurrency(salesPrice * (profitMargin / 100))}</span>
                  </div>
                </div>

                <div className="mt-4">
                  <button
                    onClick={handleSaveCalculation}
                    disabled={isSaving}
                    className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 border ${
                      saveSuccess 
                        ? 'bg-green-50 text-green-600 border-green-200' 
                        : 'bg-zinc-900 text-white border-zinc-800 hover:bg-zinc-800'
                    }`}
                  >
                    {isSaving ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : saveSuccess ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <Save className="w-3 h-3" />
                    )}
                    {saveSuccess ? 'Salvo!' : 'Salvar Cálculo'}
                  </button>
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
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide px-1">
                          {negotiationResults?.label || "Resultado Sugerido"}
                        </label>
                        <div className="py-2 px-3 text-right font-mono text-amber-400 font-bold text-lg">
                          {negotiationResults?.type === 'margin' 
                            ? `${negotiationResults.value.toFixed(2)}%`
                            : formatCurrency(negotiationResults?.value || 0)
                          }
                        </div>
                      </div>
                    </div>
                  </div>

                  {negotiationResults && negotiationResults.value > 0 && (
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

    {/* Save Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200">
            <div className="bg-zinc-950 p-4 text-white flex items-center justify-between">
              <h3 className="font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                <Save className="w-4 h-4 text-amber-500" />
                Salvar Simulação
              </h3>
              <button 
                onClick={() => setIsSaveModalOpen(false)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1 relative">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Descrição do Produto</label>
                <input 
                  type="text"
                  value={productName}
                  onChange={(e) => handleProductNameChange(e.target.value)}
                  onFocus={() => productName.length > 1 && handleProductNameChange(productName)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 300)}
                  placeholder="Ex: Smartphone Samsung Galaxy S23"
                  className="w-full bg-zinc-50 border border-zinc-300 rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-zinc-800"
                  autoFocus
                />
                
                {/* Suggestions Dropdown */}
                {showSuggestions && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-2xl z-[60] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="bg-zinc-50 px-3 py-1 text-[10px] font-bold text-zinc-400 uppercase border-b border-zinc-100 flex justify-between">
                      <span>Sugestões Encontradas</span>
                      <span>{productSuggestions.length}</span>
                    </div>
                    {productSuggestions.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault(); // Prevent blur before click
                          selectProduct(p);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-zinc-700 hover:bg-amber-50 transition-colors flex items-center justify-between group border-b border-zinc-50 last:border-0"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium group-hover:text-amber-700">{p.name}</span>
                          <span className="text-[9px] text-zinc-400 uppercase tracking-tighter">
                            {p.type === 'product' ? 'No Catálogo' : 'Do Histórico'}
                          </span>
                        </div>
                        <span className="text-[10px] text-amber-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">Selecionar</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* New Product Indicator */}
                {!showSuggestions && productName.length > 2 && !products.some(p => p.name.toLowerCase().trim() === productName.toLowerCase().trim()) && (
                  <div className="absolute right-3 top-[34px] flex items-center gap-1 text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                    <Save className="w-2 h-2" />
                    NOVO
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Nome do Representante / Fornecedor</label>
                <input 
                  type="text"
                  value={representativeName}
                  onChange={(e) => setRepresentativeName(e.target.value)}
                  placeholder="Ex: João Silva - Distribuidora X"
                  className="w-full bg-zinc-50 border border-zinc-300 rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-zinc-800"
                />
              </div>
              
              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setIsSaveModalOpen(false)}
                  className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 py-2 rounded-lg font-bold text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleConfirmSave}
                  disabled={!productName || isSaving}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-lg font-bold text-sm transition-colors shadow-lg shadow-amber-600/20"
                >
                  {isSaving ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden border border-zinc-200 flex flex-col">
            <div className="bg-zinc-950 p-4 text-white flex items-center justify-between shrink-0">
              <h3 className="font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                <History className="w-4 h-4 text-amber-500" />
                Histórico de Simulações
              </h3>
              <button 
                onClick={() => setIsHistoryModalOpen(false)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              {!user ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
                  <p className="text-zinc-500">Faça login para ver seu histórico.</p>
                </div>
              ) : savedCalculations.length === 0 ? (
                <div className="text-center py-12">
                  <History className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
                  <p className="text-zinc-500">Nenhum cálculo salvo ainda.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {savedCalculations.map((calc) => (
                    <div key={calc.id} className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 hover:border-amber-500/50 transition-all group">
                      <div className="flex justify-between items-start mb-3">
                        <div className="space-y-1">
                          <h4 className="font-bold text-zinc-900 line-clamp-1">{calc.productName}</h4>
                          <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase font-bold">
                            <Calendar className="w-3 h-3" />
                            {calc.createdAt?.toDate().toLocaleDateString('pt-BR')} {calc.createdAt?.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {deletingId === calc.id ? (
                            <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
                              <button 
                                onClick={() => setDeletingId(null)}
                                className="text-[10px] font-bold text-zinc-400 hover:text-zinc-600 px-2 py-1"
                              >
                                Cancelar
                              </button>
                              <button 
                                onClick={() => handleDeleteCalculation(calc.id)}
                                className="text-[10px] font-bold bg-red-50 text-red-600 hover:bg-red-100 px-2 py-1 rounded"
                              >
                                Confirmar Exclusão
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setDeletingId(calc.id)}
                              className="text-zinc-400 hover:text-red-500 p-1 transition-colors"
                              title="Excluir cálculo"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-white p-2 rounded border border-zinc-100">
                          <div className="text-[9px] text-zinc-400 uppercase font-bold">Venda</div>
                          <div className="text-sm font-mono font-bold text-zinc-800">{formatCurrency(calc.salesPrice)}</div>
                        </div>
                        <div className="bg-white p-2 rounded border border-zinc-100">
                          <div className="text-[9px] text-zinc-400 uppercase font-bold">Margem</div>
                          <div className="text-sm font-mono font-bold text-amber-600">{calc.profitMargin.toFixed(2)}%</div>
                        </div>
                      </div>

                      {calc.representativeName && (
                        <div className="flex items-center gap-2 text-xs text-zinc-600 mb-4 bg-zinc-100/50 p-2 rounded">
                          <UserIcon className="w-3 h-3 text-zinc-400" />
                          <span className="line-clamp-1">{calc.representativeName}</span>
                        </div>
                      )}

                      <button 
                        onClick={() => handleLoadCalculation(calc)}
                        className="w-full bg-zinc-900 text-white py-2 rounded-lg text-xs font-bold hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Carregar Simulação
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-zinc-100 bg-zinc-50 shrink-0">
              <button 
                onClick={() => setIsHistoryModalOpen(false)}
                className="w-full bg-zinc-200 hover:bg-zinc-300 text-zinc-700 py-2 rounded-lg font-bold text-sm transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Products Management Modal */}
      {isProductsModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden border border-zinc-200 flex flex-col">
            <div className="bg-zinc-950 p-4 text-white flex items-center justify-between shrink-0">
              <h3 className="font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-500" />
                Gestão de Produtos
              </h3>
              <button 
                onClick={() => {
                  setIsProductsModalOpen(false);
                  setEditingProduct(null);
                }}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              {!user ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
                  <p className="text-zinc-500">Faça login para gerenciar seus produtos.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Add/Edit Form */}
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                      {editingProduct?.id ? <Edit2 className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                      {editingProduct?.id ? 'Editar Produto' : 'Novo Produto'}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase">Nome do Produto</label>
                        <input 
                          type="text"
                          value={editingProduct?.name || ''}
                          onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                          placeholder="Ex: Fertilizante 07-28-14"
                          className="w-full bg-white border border-zinc-300 rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase">Fornecedor</label>
                        <input 
                          type="text"
                          value={editingProduct?.supplierName || ''}
                          onChange={(e) => setEditingProduct({ ...editingProduct, supplierName: e.target.value })}
                          placeholder="Ex: Fertipar"
                          className="w-full bg-white border border-zinc-300 rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase">Custo Base (R$)</label>
                        <input 
                          type="text"
                          value={editingProduct?.baseCost ? formatCurrency(editingProduct.baseCost).replace('R$ ', '') : ''}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            setEditingProduct({ ...editingProduct, baseCost: Number(val) / 100 });
                          }}
                          placeholder="0,00"
                          className="w-full bg-white border border-zinc-300 rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-amber-500 text-sm font-mono"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleSaveProduct(editingProduct)}
                          disabled={!editingProduct?.name || isSavingProduct}
                          className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white py-2 rounded-lg font-bold text-sm transition-colors"
                        >
                          {isSavingProduct ? 'Salvando...' : editingProduct?.id ? 'Atualizar' : 'Cadastrar'}
                        </button>
                        {editingProduct && (
                          <button 
                            onClick={() => setEditingProduct(null)}
                            className="bg-zinc-200 hover:bg-zinc-300 text-zinc-600 px-4 py-2 rounded-lg font-bold text-sm transition-colors"
                          >
                            Limpar
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4 pt-4 border-t border-zinc-200">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-zinc-400 uppercase">ICMS Compra (%)</label>
                        <input 
                          type="number"
                          value={editingProduct?.icmsPurchaseRate || 0}
                          onChange={(e) => setEditingProduct({ ...editingProduct, icmsPurchaseRate: Number(e.target.value) })}
                          className="w-full bg-white border border-zinc-300 rounded-lg py-1.5 px-3 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-zinc-400 uppercase">ICMS Frete (%)</label>
                        <input 
                          type="number"
                          value={editingProduct?.icmsFreightRate || 0}
                          onChange={(e) => setEditingProduct({ ...editingProduct, icmsFreightRate: Number(e.target.value) })}
                          className="w-full bg-white border border-zinc-300 rounded-lg py-1.5 px-3 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-zinc-400 uppercase">ICMS Venda (%)</label>
                        <input 
                          type="number"
                          value={editingProduct?.icmsSaleRate || 0}
                          onChange={(e) => setEditingProduct({ ...editingProduct, icmsSaleRate: Number(e.target.value) })}
                          className="w-full bg-white border border-zinc-300 rounded-lg py-1.5 px-3 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-zinc-400 uppercase">PIS Venda (%)</label>
                        <input 
                          type="number"
                          step="0.001"
                          value={editingProduct?.pisSaleRate || 0.165}
                          onChange={(e) => setEditingProduct({ ...editingProduct, pisSaleRate: Number(e.target.value) })}
                          className="w-full bg-white border border-zinc-300 rounded-lg py-1.5 px-3 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-zinc-400 uppercase">COFINS Venda (%)</label>
                        <input 
                          type="number"
                          step="0.001"
                          value={editingProduct?.cofinsSaleRate || 0.76}
                          onChange={(e) => setEditingProduct({ ...editingProduct, cofinsSaleRate: Number(e.target.value) })}
                          className="w-full bg-white border border-zinc-300 rounded-lg py-1.5 px-3 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Products List */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {products.length === 0 ? (
                      <div className="col-span-full text-center py-8 text-zinc-400 text-sm italic">
                        Nenhum produto cadastrado no catálogo.
                      </div>
                    ) : (
                      products.map((product) => (
                        <div key={product.id} className="bg-white border border-zinc-200 rounded-xl p-4 hover:border-amber-500/50 transition-all group relative">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-zinc-900 line-clamp-1 pr-8">{product.name}</h4>
                            <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => setEditingProduct(product)}
                                className="text-zinc-400 hover:text-amber-600 p-1"
                                title="Editar"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => setDeletingProductId(product.id)}
                                className="text-zinc-400 hover:text-red-500 p-1"
                                title="Excluir"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-1 mb-4">
                            <div className="text-xs font-mono font-bold text-zinc-600">
                              Custo: <span className="text-zinc-900">{formatCurrency(product.baseCost || 0)}</span>
                            </div>
                            {product.supplierName && (
                              <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                                <UserIcon className="w-3 h-3" />
                                <span className="font-medium">{product.supplierName}</span>
                              </div>
                            )}
                          </div>

                          {deletingProductId === product.id ? (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                              <button 
                                onClick={() => handleDeleteProduct(product.id)}
                                className="flex-1 bg-red-50 text-red-600 py-1.5 rounded-lg text-[10px] font-bold hover:bg-red-100"
                              >
                                Confirmar
                              </button>
                              <button 
                                onClick={() => setDeletingProductId(null)}
                                className="flex-1 bg-zinc-100 text-zinc-500 py-1.5 rounded-lg text-[10px] font-bold hover:bg-zinc-200"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => handleSelectProductForCalculator(product)}
                              className="w-full bg-zinc-900 text-white py-2 rounded-lg text-[10px] font-bold hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
                            >
                              <Calculator className="w-3 h-3" />
                              Usar na Calculadora
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-zinc-100 bg-zinc-50 shrink-0">
              <button 
                onClick={() => {
                  setIsProductsModalOpen(false);
                  setEditingProduct(null);
                }}
                className="w-full bg-zinc-200 hover:bg-zinc-300 text-zinc-700 py-2 rounded-lg font-bold text-sm transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </ErrorBoundary>
  );
}
