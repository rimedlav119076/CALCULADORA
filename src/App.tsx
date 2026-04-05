import * as React from 'react';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Calculator, DollarSign, Percent, RefreshCw, Info, Download, RotateCcw, LogIn, LogOut, Save, History, CheckCircle2, AlertCircle, Trash2, Calendar, User as UserIcon, Package, Plus, Edit2, Settings, LayoutDashboard, FileUp, X, HelpCircle, Mail, ExternalLink } from 'lucide-react';
import manualData from './data/manual.json';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
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

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

// Manual Icon Helper
const ManualIcon = ({ name, className }: { name: string, className?: string }) => {
  const icons: Record<string, any> = {
    Calculator,
    LayoutDashboard,
    Settings,
    Package,
    History,
    FileUp,
    Download,
    RotateCcw
  };
  const Icon = icons[name] || HelpCircle;
  return <Icon className={className} />;
};

// Error Boundary Component
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false, error: null };
  public props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    const { hasError, error } = this.state;
    if (hasError) {
      let errorMessage = "Ocorreu um erro inesperado.";
      if (error && error.message) {
        try {
          const parsedError = JSON.parse(error.message);
          if (parsedError.error) errorMessage = parsedError.error;
        } catch (e) {
          errorMessage = error.message;
        }
      }

      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-red-500/30 p-8 rounded-3xl max-w-md w-full text-center space-y-6 shadow-2xl shadow-red-500/10">
            <div className="bg-red-500/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-black text-white uppercase tracking-tighter">Ops! Algo deu errado</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">{errorMessage}</p>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-xl font-bold transition-all border border-zinc-700 active:scale-95"
            >
              Recarregar Aplicativo
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

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
      <label className={`text-[10px] sm:text-xs font-bold uppercase tracking-wide ${labelClassName}`}>{label}</label>
      <div className={`relative flex items-center bg-white border border-zinc-300 rounded-md shadow-sm focus-within:ring-2 focus-within:ring-amber-500 focus-within:border-amber-500 ${disabled ? 'bg-zinc-100 opacity-80' : ''}`}>
        {prefix && <span className="pl-2 sm:pl-3 text-zinc-500 text-[10px] sm:text-sm font-medium">{prefix}</span>}
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
          className="w-full py-1.5 sm:py-2 px-2 sm:px-3 text-right outline-none bg-transparent font-mono text-zinc-800 font-medium text-xs sm:text-sm"
          placeholder={placeholder}
        />
        {suffix && <span className="pr-2 sm:pr-3 text-zinc-500 text-[10px] sm:text-sm font-medium">{suffix}</span>}
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
    <div className="grid grid-cols-2 gap-2 sm:gap-4">
      <div>
        <NumberInput 
          label={label} 
          value={percent} 
          onChange={onChange} 
          prefix="" 
          suffix="%" 
        />
      </div>
      <div className="flex flex-col">
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

// Dashboard Component
const Dashboard = ({ savedCalculations, products, isPro, onUpgrade }: { savedCalculations: any[], products: any[], isPro: boolean, onUpgrade: () => void }) => {
  if (!isPro) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-6 bg-zinc-50 min-h-[600px]">
        <div className="bg-amber-500/10 p-6 rounded-3xl">
          <LayoutDashboard className="w-16 h-16 text-amber-600" />
        </div>
        <div className="max-w-md space-y-2">
          <h3 className="text-2xl font-black text-zinc-900 uppercase tracking-tighter">Dashboard Exclusivo PRO</h3>
          <p className="text-zinc-500 text-sm leading-relaxed">
            Tenha acesso a métricas avançadas, gráficos de lucratividade e análise detalhada do seu faturamento.
          </p>
        </div>
        <button 
          onClick={onUpgrade}
          className="bg-zinc-950 hover:bg-zinc-800 text-white px-8 py-4 rounded-2xl font-bold transition-all shadow-xl shadow-zinc-950/20 active:scale-95 flex items-center gap-3"
        >
          <Package className="w-5 h-5 text-amber-500" />
          DESBLOQUEAR AGORA
        </button>
      </div>
    );
  }

  const stats = useMemo(() => {
    // Filtrar apenas cálculos válidos para não distorcer os gráficos
    const validCalculations = savedCalculations.filter(calc => (calc.salesPrice || 0) > 0);
    
    if (validCalculations.length === 0) return null;

    const totalCalculations = validCalculations.length;
    const avgProfitMargin = validCalculations.reduce((acc, curr) => acc + (curr.profitMargin || 0), 0) / totalCalculations;
    const totalSalesValue = validCalculations.reduce((acc, curr) => acc + (curr.salesPrice || 0), 0);
    
    // Most calculated products
    const productCounts: Record<string, number> = {};
    validCalculations.forEach(calc => {
      const name = calc.productName || 'Desconhecido';
      productCounts[name] = (productCounts[name] || 0) + 1;
    });

    const topProducts = Object.entries(productCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Margin distribution
    const marginRanges = [
      { name: '0-10%', count: 0, range: [0, 10] },
      { name: '10-20%', count: 0, range: [10, 20] },
      { name: '20-30%', count: 0, range: [20, 30] },
      { name: '30%+', count: 0, range: [30, 1000] },
    ];

    validCalculations.forEach(calc => {
      const margin = calc.profitMargin || 0;
      const range = marginRanges.find(r => margin >= r.range[0] && margin < r.range[1]);
      if (range) range.count++;
    });

    return {
      totalCalculations,
      avgProfitMargin,
      totalSalesValue,
      topProducts,
      marginRanges
    };
  }, [savedCalculations]);

  if (!stats) {
    return (
      <div className="p-12 text-center space-y-4">
        <div className="bg-zinc-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
          <LayoutDashboard className="w-8 h-8 text-zinc-400" />
        </div>
        <h3 className="text-lg font-bold text-zinc-900">Nenhum dado disponível</h3>
        <p className="text-zinc-500 max-w-xs mx-auto">Salve alguns cálculos para começar a ver as estatísticas da sua operação.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-2">
          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total de Simulações</div>
          <div className="text-3xl font-bold text-zinc-900">{stats.totalCalculations}</div>
          <div className="text-xs text-zinc-500">Histórico completo</div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-2">
          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Margem Média</div>
          <div className="text-3xl font-bold text-amber-600">{stats.avgProfitMargin.toFixed(2)}%</div>
          <div className="text-xs text-zinc-500">Lucro líquido médio</div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-2">
          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Volume de Vendas</div>
          <div className="text-3xl font-bold text-green-600">{formatCurrency(stats.totalSalesValue)}</div>
          <div className="text-xs text-zinc-500">Soma de todos os preços calculados</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Products Chart */}
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
          <h3 className="font-bold text-zinc-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-500" />
            Produtos Mais Calculados
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.topProducts} layout="vertical" margin={{ left: 40, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f4f4f5" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={100} 
                  tick={{ fontSize: 10, fill: '#71717a' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="count" fill="#d97706" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Margin Distribution Chart */}
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
          <h3 className="font-bold text-zinc-900 flex items-center gap-2">
            <Percent className="w-5 h-5 text-amber-500" />
            Distribuição de Margens
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.marginRanges}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="count"
                >
                  {stats.marginRanges.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#f59e0b', '#d97706', '#b45309', '#78350f'][index % 4]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 flex-wrap">
            {stats.marginRanges.map((range, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] font-medium text-zinc-500">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#f59e0b', '#d97706', '#b45309', '#78350f'][i % 4] }}></div>
                {range.name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// SettingsModal Component
const SettingsModal = ({ 
  isOpen, 
  onClose, 
  settings, 
  onSave, 
  isSaving,
  isPro,
  onUpgrade
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  settings: any; 
  onSave: (s: any) => void; 
  isSaving: boolean;
  isPro: boolean;
  onUpgrade: () => void;
}) => {
  const [localSettings, setLocalSettings] = useState<any>({
    defaultIcmsPurchaseRate: 0,
    defaultIcmsFreightRate: 0,
    defaultIcmsSaleRate: 0,
    defaultPisSaleRate: 0.165,
    defaultCofinsSaleRate: 0.76,
    defaultCommissionRate: 0,
    defaultProfitMargin: 0
  });

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings, isOpen]);

  if (!isOpen) return null;

  if (!isPro) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200">
          <div className="bg-zinc-950 p-6 text-center space-y-4">
            <div className="bg-amber-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto">
              <Settings className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="text-xl font-black text-white uppercase tracking-tighter">Configurações PRO</h3>
            <p className="text-zinc-400 text-sm">
              Defina alíquotas padrão e automatize seus cálculos. Funcionalidade exclusiva para assinantes PRO.
            </p>
            <div className="flex flex-col gap-3 pt-4">
              <button 
                onClick={onUpgrade}
                className="w-full bg-amber-600 hover:bg-amber-500 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-amber-500/20 active:scale-95 flex items-center justify-center gap-2"
              >
                <Package className="w-4 h-4" />
                QUERO SER PRO
              </button>
              <button 
                onClick={onClose}
                className="w-full bg-zinc-800 text-zinc-400 hover:text-white py-3 rounded-xl font-bold transition-colors"
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden border border-zinc-200 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 p-2 rounded-xl">
              <Settings className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900">Configurações Padrão</h2>
              <p className="text-xs text-zinc-500">Defina as alíquotas que serão usadas em novos cálculos.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-200 rounded-full transition-colors">
            <RotateCcw className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Créditos de Compra</h3>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase">ICMS Compra (%)</label>
                  <input 
                    type="number" 
                    value={localSettings.defaultIcmsPurchaseRate} 
                    onChange={(e) => setLocalSettings({ ...localSettings, defaultIcmsPurchaseRate: Number(e.target.value) })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase">ICMS Frete (%)</label>
                  <input 
                    type="number" 
                    value={localSettings.defaultIcmsFreightRate} 
                    onChange={(e) => setLocalSettings({ ...localSettings, defaultIcmsFreightRate: Number(e.target.value) })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Impostos de Venda</h3>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase">ICMS Venda (%)</label>
                  <input 
                    type="number" 
                    value={localSettings.defaultIcmsSaleRate} 
                    onChange={(e) => setLocalSettings({ ...localSettings, defaultIcmsSaleRate: Number(e.target.value) })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">PIS (%)</label>
                    <input 
                      type="number" 
                      step="0.001"
                      value={localSettings.defaultPisSaleRate} 
                      onChange={(e) => setLocalSettings({ ...localSettings, defaultPisSaleRate: Number(e.target.value) })}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">COFINS (%)</label>
                    <input 
                      type="number" 
                      step="0.001"
                      value={localSettings.defaultCofinsSaleRate} 
                      onChange={(e) => setLocalSettings({ ...localSettings, defaultCofinsSaleRate: Number(e.target.value) })}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100 space-y-4">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Comercial</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase">Comissão (%)</label>
                <input 
                  type="number" 
                  value={localSettings.defaultCommissionRate} 
                  onChange={(e) => setLocalSettings({ ...localSettings, defaultCommissionRate: Number(e.target.value) })}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase">Margem de Lucro (%)</label>
                <input 
                  type="number" 
                  value={localSettings.defaultProfitMargin} 
                  onChange={(e) => setLocalSettings({ ...localSettings, defaultProfitMargin: Number(e.target.value) })}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-zinc-100 bg-zinc-50 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 py-3 rounded-2xl font-bold text-sm transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={() => onSave(localSettings)}
            disabled={isSaving}
            className="flex-[2] bg-amber-600 hover:bg-amber-500 text-white py-3 rounded-2xl font-bold text-sm transition-all shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50"
          >
            {isSaving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [userPlan, setUserPlan] = useState<'FREE' | 'PRO'>('FREE');
  const isPro = useMemo(() => userPlan === 'PRO', [userPlan]);
  const isAdmin = useMemo(() => user?.email === 'adm.valdemir@gmail.com', [user]);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // State - Upgrade Modal
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isManualAdminModalOpen, setIsManualAdminModalOpen] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);

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
  
  // State - Settings & Dashboard
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isFloatingCalculatorOpen, setIsFloatingCalculatorOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [userSettings, setUserSettings] = useState<any | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

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

  // State - XML Import Selection
  const [isXmlSelectModalOpen, setIsXmlSelectModalOpen] = useState(false);
  const [xmlItems, setXmlItems] = useState<any[]>([]);
  const [xmlSupplier, setXmlSupplier] = useState('');

  // Manual State
  const [manualConfig, setManualConfig] = useState<any>({
    introTitle: "Bem-vindo!",
    introContent: "Este guia rápido ajudará você a entender todas as ferramentas disponíveis no aplicativo para otimizar a precificação dos seus produtos.",
    items: manualData,
    contactTitle: "Dúvidas ou Sugestões?",
    contactContent: "Estamos sempre buscando melhorar! Se você tiver alguma pergunta sobre os cálculos ou sugestões de novas funcionalidades, entre em contato conosco."
  });
  const [isSavingManual, setIsSavingManual] = useState(false);

  // Refs
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const requirePro = useCallback((action: () => void) => {
    if (isPro) {
      action();
    } else {
      setIsUpgradeModalOpen(true);
      showToast("Esta funcionalidade é exclusiva para assinantes PRO.", "info");
    }
  }, [isPro, showToast]);

  // Handle Payment Result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    
    if (paymentStatus === 'success') {
      showToast('Pagamento aprovado! Seu acesso PRO será liberado em instantes.', 'success');
      // Remove params from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (paymentStatus === 'failure') {
      showToast('O pagamento não foi concluído. Tente novamente.', 'error');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (paymentStatus === 'pending') {
      showToast('Seu pagamento está pendente de aprovação. Assim que confirmado, seu acesso PRO será liberado.', 'info');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [showToast]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);

      if (currentUser) {
        // Ensure user document exists
        const userDocRef = doc(db, 'users', currentUser.uid);
        
        // Listen to user document for plan changes
        const unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
          if (currentUser.email === 'adm.valdemir@gmail.com') {
            setUserPlan('PRO');
            return;
          }
          
          if (docSnap.exists()) {
            const userData = docSnap.data();
            setUserPlan(userData.plan || 'FREE');
          } else {
            // Create user doc if not exists
            setDoc(userDocRef, {
              email: currentUser.email,
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              plan: 'FREE',
              createdAt: Timestamp.now()
            });
          }
        });

        return () => unsubscribeUser();
      } else {
        setUserPlan('FREE');
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch History
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsUpgradeModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
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

  // Fetch Settings
  useEffect(() => {
    if (!user) {
      setUserSettings(null);
      return;
    }

    const docRef = doc(db, 'settings', user.uid);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const settings = docSnap.data();
        setUserSettings(settings);
        
        // Apply defaults if this is a fresh start (no manual values yet)
        // We only do this if the values are currently 0 or default
        setIcmsPurchaseRate(prev => prev === 0 ? (settings.defaultIcmsPurchaseRate || 0) : prev);
        setIcmsFreightRate(prev => prev === 0 ? (settings.defaultIcmsFreightRate || 0) : prev);
        setIcmsSaleRate(prev => prev === 0 ? (settings.defaultIcmsSaleRate || 0) : prev);
        setPisSaleRate(prev => prev === 0.165 ? (settings.defaultPisSaleRate || 0.165) : prev);
        setCofinsSaleRate(prev => prev === 0.76 ? (settings.defaultCofinsSaleRate || 0.76) : prev);
        setCommissionRate(prev => prev === 0 ? (settings.defaultCommissionRate || 0) : prev);
        setProfitMargin(prev => prev === 0 ? (settings.defaultProfitMargin || 0) : prev);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings');
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
    setIcmsPurchaseRate(userSettings?.defaultIcmsPurchaseRate || 0);
    setIcmsFreightRate(userSettings?.defaultIcmsFreightRate || 0);
    setIcmsSaleRate(userSettings?.defaultIcmsSaleRate || 0);
    setPisSaleRate(userSettings?.defaultPisSaleRate || 0.165);
    setCofinsSaleRate(userSettings?.defaultCofinsSaleRate || 0.76);
    setSaleExpensesValue(0);
    setCommissionRate(userSettings?.defaultCommissionRate || 0);
    setProfitMargin(userSettings?.defaultProfitMargin || 0);
    setTargetSalesPrice(0);
  }, [userSettings]);

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
      showToast("Login realizado com sucesso!", "success");
    } catch (error: any) {
      console.error("Login Error:", error);
      if (error.code !== 'auth/cancelled-query' && error.code !== 'auth/popup-closed-by-user') {
        showToast("Erro ao entrar: " + error.message, "error");
      }
    }
  }, [showToast]);

  // Fetch Manual Data from Firestore
  useEffect(() => {
    const manualDocRef = doc(db, 'config', 'manual');
    const unsubscribe = onSnapshot(manualDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setManualConfig({
          introTitle: data.introTitle || "Bem-vindo!",
          introContent: data.introContent || "Este guia rápido ajudará você a entender todas as ferramentas disponíveis no aplicativo para otimizar a precificação dos seus produtos.",
          items: data.items || manualData,
          contactTitle: data.contactTitle || "Dúvidas ou Sugestões?",
          contactContent: data.contactContent || "Estamos sempre buscando melhorar! Se você tiver alguma pergunta sobre os cálculos ou sugestões de novas funcionalidades, entre em contato conosco."
        });
      } else if (isAdmin) {
        // Seed initial data if it doesn't exist and user is admin
        setDoc(manualDocRef, { 
          introTitle: "Bem-vindo!",
          introContent: "Este guia rápido ajudará você a entender todas as ferramentas disponíveis no aplicativo para otimizar a precificação dos seus produtos.",
          items: manualData,
          contactTitle: "Dúvidas ou Sugestões?",
          contactContent: "Estamos sempre buscando melhorar! Se você tiver alguma pergunta sobre os cálculos ou sugestões de novas funcionalidades, entre em contato conosco.",
          updatedAt: Timestamp.now() 
        }).catch(err => console.error("Error seeding manual:", err));
      }
    });
    return () => unsubscribe();
  }, [isAdmin]);

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  }, []);

  const handleSaveSettings = useCallback(async (settings: any) => {
    if (!user) return;
    setIsSavingSettings(true);
    try {
      const docRef = doc(db, 'settings', user.uid);
      await setDoc(docRef, {
        ...settings,
        userId: user.uid,
        updatedAt: Timestamp.now()
      });
      setIsSettingsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings');
    } finally {
      setIsSavingSettings(false);
    }
  }, [user]);

  const handleSaveCalculation = useCallback(async () => {
    requirePro(() => {
      setIsSaveModalOpen(true);
    });
  }, [requirePro]);

  const handleXMLImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const xmlText = event.target?.result as string;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        // Emitente (Fornecedor)
        const supplierName = xmlDoc.getElementsByTagName("xNome")[0]?.textContent || "";
        setXmlSupplier(supplierName);
        
        // Itens da Nota
        const items = xmlDoc.getElementsByTagName("det");
        const parsedItems: any[] = [];
        
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const prodName = item.getElementsByTagName("xProd")[0]?.textContent || "";
          const unitPrice = parseFloat(item.getElementsByTagName("vUnCom")[0]?.textContent || "0");
          
          // ICMS Compra
          let icmsRate = 0;
          const pICMSNodes = item.getElementsByTagName("pICMS");
          if (pICMSNodes.length > 0) {
            icmsRate = parseFloat(pICMSNodes[0].textContent || "0");
          }

          // Frete do item
          const itemFrete = parseFloat(item.getElementsByTagName("vFrete")[0]?.textContent || "0");
          
          parsedItems.push({
            name: prodName,
            price: unitPrice,
            icms: icmsRate,
            freight: itemFrete
          });
        }
        
        if (parsedItems.length > 0) {
          // Se houver apenas um item, podemos carregar direto ou abrir o modal
          // O usuário pediu para abrir uma janela para selecionar, então abrimos sempre
          setXmlItems(parsedItems);
          setIsXmlSelectModalOpen(true);
          
          // Valor total de frete da nota (para referência se necessário)
          const totalFrete = parseFloat(xmlDoc.getElementsByTagName("vFrete")[0]?.textContent || "0");
          // Se o frete do item for 0, mas houver frete total, podemos sugerir o rateio ou apenas guardar o total
          // Por enquanto, vamos manter o frete do item extraído
        } else {
          showToast("Nenhum item encontrado no XML.", "error");
        }
      } catch (error) {
        console.error("Erro ao processar XML:", error);
        showToast("Erro ao processar o arquivo XML. Verifique se é uma NFe válida.", "error");
      }
      
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  }, []);

  const selectXmlItem = useCallback((item: any) => {
    setRepresentativeName(xmlSupplier);
    setProductName(item.name);
    setPurchasePrice(item.price);
    setIcmsPurchaseRate(item.icms);
    setFreight(item.freight);
    setIsXmlSelectModalOpen(false);
    showToast(`Produto selecionado: ${item.name}`, "success");
  }, [xmlSupplier, showToast]);

  const handleUpgrade = useCallback(async (planType: 'monthly' | 'annual' = 'monthly') => {
    if (!user) {
      handleLogin();
      return;
    }

    setIsUpgrading(true);
    try {
      const title = planType === 'annual' ? 'NIVOR Calculadora PRO - Plano Anual' : 'NIVOR Calculadora PRO - Assinatura Mensal';
      const price = planType === 'annual' ? 360.00 : 36.90;

      const response = await fetch('/api/create-preference', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
          email: user.email,
          title,
          price
        }),
      });

      const data = await response.json();
      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        throw new Error(data.error || 'Erro ao criar preferência de pagamento');
      }
    } catch (error: any) {
      console.error('Upgrade Error:', error);
      showToast(error.message || 'Ocorreu um erro ao processar seu upgrade.', "error");
    } finally {
      setIsUpgrading(false);
    }
  }, [user, handleLogin, showToast]);

  const handleConfirmSave = useCallback(async () => {
    if (!user || !productName) return;
    
    // Validação: Não permitir salvar cálculos vazios ou com preço zero
    if (salesPrice <= 0 || purchasePrice <= 0) {
      showToast("Por favor, realize um cálculo válido antes de salvar.", "error");
      return;
    }

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
      
      // Limpar campos após salvar a análise escolhida para evitar duplicidade
      setProductName('');
      setRepresentativeName('');
      setSelectedProductId(null);
      handleReset(); // Reseta os valores da calculadora para o estado inicial/padrão
      
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'calculations');
    } finally {
      setIsSaving(false);
    }
  }, [user, productName, selectedProductId, products, representativeName, purchasePrice, freight, otherExpenses, icmsPurchaseRate, icmsFreightRate, icmsSaleRate, saleExpensesValue, commissionRate, profitMargin, salesPrice, realCost, totalCost]);

  const handleLoadCalculation = useCallback((calc: any) => {
    setProductName(calc.productName || '');
    setRepresentativeName(calc.representativeName || '');
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

  const handleSaveManual = useCallback(async (newConfig: any) => {
    if (!isAdmin) return;
    setIsSavingManual(true);
    try {
      const manualDocRef = doc(db, 'config', 'manual');
      await setDoc(manualDocRef, { 
        ...newConfig,
        updatedAt: Timestamp.now(),
        updatedBy: user?.uid
      });
      showToast("Manual atualizado com sucesso!", "success");
      setIsManualAdminModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'config/manual');
    } finally {
      setIsSavingManual(false);
    }
  }, [isAdmin, user, showToast]);

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
          <div className="bg-zinc-950 text-white p-4 md:p-6 flex flex-col gap-6">
            {/* Top Row: Title and User */}
            <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-4 sm:gap-0">
              <div className="flex flex-col items-center sm:items-start">
                <h1 className="text-xl md:text-2xl font-black tracking-tighter text-white uppercase italic">
                  CALCULADORA <span className="text-amber-500">PREÇO VENDA</span>
                </h1>
                <div className="h-1 w-12 bg-amber-500 rounded-full mt-1 hidden sm:block"></div>
              </div>
              
              {user ? (
                <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-800">
                  {userPlan === 'PRO' ? (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/10 rounded-md border border-amber-500/20">
                      <Package className="w-3 h-3 text-amber-500" />
                      <span className="text-[10px] font-black text-amber-500 uppercase tracking-tighter">PRO</span>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setIsUpgradeModalOpen(true)}
                      className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white px-2.5 py-1 rounded-md text-[10px] font-black transition-all active:scale-95 animate-pulse"
                    >
                      <Package className="w-3 h-3" />
                      SEJA PRO
                    </button>
                  )}
                  <button 
                    onClick={() => setIsManualModalOpen(true)}
                    className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white px-2.5 py-1 rounded-md text-[10px] font-black transition-all active:scale-95 border border-zinc-700"
                    title="Manual do Usuário"
                  >
                    <HelpCircle className="w-3 h-3 text-amber-500" />
                    MANUAL
                  </button>

                  {isAdmin && (
                    <button 
                      onClick={() => setIsManualAdminModalOpen(true)}
                      className="flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white px-2.5 py-1 rounded-md text-[10px] font-black transition-all active:scale-95 border border-red-700"
                      title="Painel Administrativo"
                    >
                      <Settings className="w-3 h-3 text-white" />
                      ADMIN
                    </button>
                  )}

                  <div className="w-[1px] h-4 bg-zinc-800 mx-1"></div>
                  <div className="flex items-center gap-2">
                    <img 
                      src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'User'}`} 
                      alt="User" 
                      className="w-6 h-6 rounded-full border border-zinc-700"
                      referrerPolicy="no-referrer"
                    />
                    <span className="text-xs font-medium text-zinc-300 hidden sm:inline">{user.displayName?.split(' ')[0]}</span>
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="p-1 text-zinc-500 hover:text-red-400 transition-colors ml-1"
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
            </div>

            {/* Bottom Row: Navigation Actions */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 justify-center sm:justify-end w-full">
              <button 
                onClick={() => requirePro(() => setIsDashboardOpen(!isDashboardOpen))}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 md:py-2 rounded-lg text-[10px] md:text-xs font-bold transition-all border active:scale-95 w-full sm:w-auto whitespace-nowrap ${isDashboardOpen ? 'bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700'}`}
                title={isDashboardOpen ? "Voltar para Calculadora" : "Ver Dashboard"}
              >
                {isDashboardOpen ? <Calculator className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <LayoutDashboard className="w-3.5 h-3.5 md:w-4 md:h-4 text-amber-500" />}
                <span>{isDashboardOpen ? "Calculadora" : "Dashboard"}</span>
                {!isPro && <span className="ml-1 bg-amber-500 text-white px-1 rounded-[4px] text-[8px]">PRO</span>}
              </button>

              <button 
                onClick={() => requirePro(() => setIsSettingsModalOpen(true))}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 md:gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-2.5 md:px-3 py-2 md:py-2 rounded-lg text-[10px] md:text-xs font-bold transition-colors border border-zinc-700 active:scale-95 w-full sm:w-auto whitespace-nowrap"
                title="Configurações Padrão"
              >
                <Settings className="w-3.5 h-3.5 md:w-4 md:h-4 text-amber-500" />
                <span>Config</span>
                {!isPro && <span className="ml-1 bg-amber-500 text-white px-1 rounded-[4px] text-[8px]">PRO</span>}
              </button>

              <button 
                onClick={() => requirePro(() => setIsProductsModalOpen(true))}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 md:gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-2.5 md:px-3 py-2 md:py-2 rounded-lg text-[10px] md:text-xs font-bold transition-colors border border-zinc-700 active:scale-95 w-full sm:w-auto whitespace-nowrap"
                title="Gerenciar Produtos"
              >
                <Package className="w-3.5 h-3.5 md:w-4 md:h-4 text-amber-500" />
                <span>Produtos</span>
                {!isPro && <span className="ml-1 bg-amber-500 text-white px-1 rounded-[4px] text-[8px]">PRO</span>}
              </button>

              <button 
                onClick={() => requirePro(() => setIsHistoryModalOpen(true))}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 md:gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-2.5 md:px-3 py-2 md:py-2 rounded-lg text-[10px] md:text-xs font-bold transition-colors border border-zinc-700 active:scale-95 w-full sm:w-auto whitespace-nowrap"
                title="Ver Histórico"
              >
                <History className="w-3.5 h-3.5 md:w-4 md:h-4 text-amber-500" />
                <span>Histórico</span>
                {!isPro && <span className="ml-1 bg-amber-500 text-white px-1 rounded-[4px] text-[8px]">PRO</span>}
              </button>

              <button 
                onClick={handleReset}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 md:gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-2.5 md:px-3 py-2 md:py-2 rounded-lg text-[10px] md:text-xs font-bold transition-colors border border-zinc-700 active:scale-95 w-full sm:w-auto whitespace-nowrap"
                title="Resetar valores"
              >
                <RotateCcw className="w-3.5 h-3.5 md:w-4 md:h-4 text-zinc-400" />
                <span>Resetar</span>
              </button>

              <button 
                onClick={() => setIsFloatingCalculatorOpen(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 md:gap-2 bg-amber-600 hover:bg-amber-500 text-white px-2.5 md:px-3 py-2 md:py-2 rounded-lg text-[10px] md:text-xs font-bold transition-all shadow-md hover:shadow-amber-500/20 active:scale-95 border border-amber-500 w-full sm:w-auto whitespace-nowrap"
                title="Abrir Calculadora"
              >
                <Calculator className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span>CALC</span>
              </button>

              <button 
                onClick={() => requirePro(handleExportPDF)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 md:gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-2.5 md:px-3 py-2 md:py-2 rounded-lg text-[10px] md:text-xs font-bold transition-colors border border-zinc-700 active:scale-95 w-full sm:w-auto whitespace-nowrap"
                title="Exportar PDF"
              >
                <Download className="w-3.5 h-3.5 md:w-4 md:h-4 text-amber-500" />
                <span>PDF</span>
                {!isPro && <span className="ml-1 bg-amber-500 text-white px-1 rounded-[4px] text-[8px]">PRO</span>}
              </button>

              <button 
                onClick={() => requirePro(handleExportExcel)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 md:gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-2.5 md:px-3 py-2 md:py-2 rounded-lg text-[10px] md:text-xs font-bold transition-colors border border-zinc-700 active:scale-95 w-full sm:w-auto whitespace-nowrap"
                title="Exportar Excel"
              >
                <Download className="w-3.5 h-3.5 md:w-4 md:h-4 text-green-500" />
                <span>EXCEL</span>
                {!isPro && <span className="ml-1 bg-amber-500 text-white px-1 rounded-[4px] text-[8px]">PRO</span>}
              </button>
            </div>
          </div>

          {isDashboardOpen ? (
            <Dashboard 
              savedCalculations={savedCalculations} 
              products={products} 
              isPro={isPro}
              onUpgrade={() => setIsUpgradeModalOpen(true)}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2">
              {/* LEFT COLUMN: COMPRA (Zinc/Grey Theme) */}
              <div className="p-6 bg-zinc-50 border-r border-zinc-200 relative">
            {/* Vertical Label Strip */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-zinc-700 rounded-tl-none"></div>

            <div className="pl-4 space-y-6">
              <div className="space-y-4">
                <h2 className="text-zinc-800 font-bold text-lg border-b border-zinc-300 pb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BRLIcon className="w-6 h-6 text-zinc-600" />
                    Custos de Aquisição
                  </div>
                  {isPro ? (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all border border-zinc-300 active:scale-95"
                      title="Importar XML da NFe"
                    >
                      <FileUp className="w-3 h-3" />
                      IMPORTAR XML
                    </button>
                  ) : (
                    <button
                      onClick={() => requirePro(() => fileInputRef.current?.click())}
                      className="flex items-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all border border-amber-200 active:scale-95 group"
                      title="Funcionalidade PRO"
                    >
                      <FileUp className="w-3 h-3" />
                      IMPORTAR XML
                      <span className="ml-1 bg-amber-500 text-white px-1 rounded-[4px] text-[8px]">PRO</span>
                    </button>
                  )}
                </h2>
                
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleXMLImport} 
                  accept=".xml" 
                  className="hidden" 
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide px-1">Nome do Produto</label>
                    <input 
                      type="text"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="Ex: Smartphone Samsung"
                      className="w-full bg-white border border-zinc-300 rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-amber-500 text-zinc-800 text-sm transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide px-1">Fornecedor / Representante</label>
                    <input 
                      type="text"
                      value={representativeName}
                      onChange={(e) => setRepresentativeName(e.target.value)}
                      placeholder="Ex: Distribuidora XYZ"
                      className="w-full bg-white border border-zinc-300 rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-amber-500 text-zinc-800 text-sm transition-all"
                    />
                  </div>
                </div>
                
                <NumberInput 
                  label="(+) Preço Compra" 
                  value={purchasePrice} 
                  onChange={setPurchasePrice} 
                />
                
                <div className="grid grid-cols-2 gap-2 sm:gap-4">
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
                    {saveSuccess ? 'Salvo!' : (
                      <span className="flex items-center gap-1">
                        Salvar Cálculo
                        {!isPro && <span className="bg-amber-500 text-white px-1 rounded-[4px] text-[8px]">PRO</span>}
                      </span>
                    )}
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
      )}

      {/* XML Item Selection Modal */}
      {isXmlSelectModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-zinc-200 flex flex-col max-h-[80vh]">
            <div className="bg-zinc-950 p-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-amber-500 p-2 rounded-lg">
                  <FileUp className="w-5 h-5 text-zinc-950" />
                </div>
                <div>
                  <h3 className="font-bold uppercase tracking-wider text-sm">Selecionar Produto do XML</h3>
                  <p className="text-[10px] text-zinc-400 font-medium">Fornecedor: {xmlSupplier}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsXmlSelectModalOpen(false)}
                className="text-zinc-400 hover:text-white transition-colors p-2 hover:bg-zinc-800 rounded-full"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 bg-amber-50 border-b border-amber-100 flex items-center gap-2 text-amber-800 text-xs font-medium shrink-0">
              <Info className="w-4 h-4" />
              Esta nota fiscal contém {xmlItems.length} itens. Selecione qual você deseja analisar agora.
            </div>

            <div className="overflow-y-auto p-2 space-y-2 bg-zinc-50">
              {xmlItems.map((item, index) => (
                <button
                  key={index}
                  onClick={() => selectXmlItem(item)}
                  className="w-full text-left bg-white p-4 rounded-xl border border-zinc-200 hover:border-amber-500 hover:shadow-md transition-all group flex items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Item #{index + 1}</div>
                    <h4 className="font-bold text-zinc-900 group-hover:text-amber-700 transition-colors truncate">{item.name}</h4>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-zinc-400 uppercase font-bold">Preço Unit.</span>
                        <span className="text-sm font-mono font-bold text-zinc-700">{formatCurrency(item.price)}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] text-zinc-400 uppercase font-bold">ICMS</span>
                        <span className="text-sm font-mono font-bold text-zinc-700">{item.icms}%</span>
                      </div>
                      {item.freight > 0 && (
                        <div className="flex flex-col">
                          <span className="text-[9px] text-zinc-400 uppercase font-bold">Frete Item</span>
                          <span className="text-sm font-mono font-bold text-zinc-700">{formatCurrency(item.freight)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 bg-zinc-100 group-hover:bg-amber-500 p-2 rounded-lg transition-colors">
                    <Calculator className="w-5 h-5 text-zinc-400 group-hover:text-white" />
                  </div>
                </button>
              ))}
            </div>
            
            <div className="p-4 border-t border-zinc-100 bg-white shrink-0 flex justify-end">
              <button
                onClick={() => setIsXmlSelectModalOpen(false)}
                className="px-6 py-2 text-sm font-bold text-zinc-500 hover:text-zinc-700 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Upgrade Modal */}
      {isUpgradeModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-[110] animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-zinc-200 flex flex-col">
            <div className="relative h-48 bg-zinc-950 flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 opacity-20">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,#f59e0b_0%,transparent_50%)]"></div>
              </div>
              <div className="relative z-10 text-center">
                <div className="inline-flex p-3 bg-amber-500 rounded-2xl shadow-xl shadow-amber-500/20 mb-4">
                  <Package className="w-8 h-8 text-zinc-950" />
                </div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Seja Markup PRO</h3>
                <p className="text-amber-500 font-bold text-sm">Desbloqueie o potencial máximo da sua empresa</p>
              </div>
              <button 
                onClick={() => setIsUpgradeModalOpen(false)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors p-2"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="grid grid-cols-1 gap-4">
                {[
                  { icon: <FileUp className="w-5 h-5" />, title: "Importação de XML", desc: "Carregue notas fiscais e economize horas de trabalho manual." },
                  { icon: <LayoutDashboard className="w-5 h-5" />, title: "Dashboard Avançado", desc: "Métricas detalhadas de lucratividade e volume de vendas." },
                  { icon: <History className="w-5 h-5" />, title: "Histórico Ilimitado", desc: "Salve quantas simulações precisar sem restrições." },
                  { icon: <Save className="w-5 h-5" />, title: "Suporte Prioritário", desc: "Atendimento exclusivo para assinantes PRO." }
                ].map((item, i) => (
                  <div key={i} className="flex gap-4 items-start">
                    <div className="bg-amber-50 p-2 rounded-lg text-amber-600 shrink-0">
                      {item.icon}
                    </div>
                    <div>
                      <h4 className="font-bold text-zinc-900 text-sm">{item.title}</h4>
                      <p className="text-zinc-500 text-xs leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                    <div>
                      <span className="text-2xl font-black text-zinc-900">R$ 36,90</span>
                      <span className="text-zinc-500 text-xs font-medium"> / mês</span>
                      <span className="block text-[10px] font-bold text-zinc-400 uppercase">Assinatura Mensal</span>
                    </div>
                    <button
                      onClick={() => handleUpgrade('monthly')}
                      disabled={isUpgrading}
                      className="bg-zinc-950 hover:bg-zinc-800 text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isUpgrading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'ASSINAR MENSAL'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-amber-50 rounded-2xl border border-amber-200 relative overflow-hidden">
                    <div className="absolute top-0 right-0 bg-amber-500 text-white text-[8px] font-black px-2 py-0.5 rounded-bl-lg uppercase tracking-tighter">Melhor Valor</div>
                    <div>
                      <span className="text-2xl font-black text-zinc-900">R$ 360,00</span>
                      <span className="text-zinc-500 text-xs font-medium"> / ano</span>
                      <span className="block text-[10px] font-bold text-amber-600 uppercase">Plano Anual à Vista</span>
                    </div>
                    <button
                      onClick={() => handleUpgrade('annual')}
                      disabled={isUpgrading}
                      className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50"
                    >
                      {isUpgrading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'ASSINAR ANUAL'}
                    </button>
                  </div>
                </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-[110] animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden border border-zinc-200 flex flex-col">
            <div className="bg-zinc-950 p-6 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-amber-500 p-2 rounded-xl">
                  <HelpCircle className="w-6 h-6 text-zinc-950" />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter">Manual do Usuário</h3>
                  <p className="text-amber-500 text-[10px] font-bold uppercase tracking-widest">NIVOR Calculadora</p>
                </div>
              </div>
              <button 
                onClick={() => setIsManualModalOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors p-2 hover:bg-zinc-800 rounded-full"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Introduction */}
              <div className="space-y-2">
                <h4 className="text-lg font-black text-zinc-900 uppercase tracking-tight border-b-2 border-amber-500 inline-block">{manualConfig.introTitle}</h4>
                <p className="text-zinc-600 text-sm leading-relaxed whitespace-pre-wrap">
                  {manualConfig.introContent}
                </p>
              </div>

              {/* Features Loop */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {manualConfig.items.map((item: any) => (
                  <div key={item.id} className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 hover:border-amber-500/50 transition-all group">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="bg-white p-2 rounded-lg shadow-sm border border-zinc-100 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                        <ManualIcon name={item.icon} className="w-5 h-5" />
                      </div>
                      <h5 className="font-bold text-zinc-900 text-sm">{item.title}</h5>
                    </div>
                    <p className="text-zinc-500 text-xs leading-relaxed">{item.description}</p>
                  </div>
                ))}
              </div>

              {/* Contact Section */}
              <div className="bg-amber-50 rounded-2xl p-6 border border-amber-200 space-y-4">
                <div className="flex items-center gap-3">
                  <Mail className="w-6 h-6 text-amber-600" />
                  <h4 className="text-lg font-black text-amber-900 uppercase tracking-tight">{manualConfig.contactTitle}</h4>
                </div>
                <p className="text-amber-800 text-sm leading-relaxed whitespace-pre-wrap">
                  {manualConfig.contactContent}
                </p>
                <div className="flex flex-wrap gap-3">
                  <a 
                    href="mailto:adm.valdemir@gmail.com"
                    className="flex items-center gap-2 bg-zinc-950 hover:bg-zinc-800 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-lg shadow-zinc-950/20"
                  >
                    <Mail className="w-4 h-4 text-amber-500" />
                    ENVIAR E-MAIL
                  </a>
                  <a 
                    href="https://mail.google.com/mail/?view=cm&fs=1&to=adm.valdemir@gmail.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-white hover:bg-zinc-50 text-zinc-900 px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 border border-zinc-200 shadow-sm"
                  >
                    <ExternalLink className="w-4 h-4 text-red-500" />
                    ABRIR NO GMAIL
                  </a>
                </div>
              </div>
            </div>

            <div className="p-6 bg-zinc-50 border-t border-zinc-200 flex justify-end gap-3">
              {isAdmin && (
                <button 
                  onClick={() => {
                    setIsManualModalOpen(false);
                    setIsManualAdminModalOpen(true);
                  }}
                  className="bg-red-600 hover:bg-red-500 text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center gap-2"
                >
                  <Edit2 className="w-4 h-4" />
                  EDITAR CONTEÚDO
                </button>
              )}
              <button 
                onClick={() => setIsManualModalOpen(false)}
                className="bg-zinc-950 hover:bg-zinc-800 text-white px-8 py-2.5 rounded-xl font-bold text-xs transition-all active:scale-95"
              >
                ENTENDI
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Manual Admin Modal */}
      {isManualAdminModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-[110] animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-zinc-200 flex flex-col">
            <div className="bg-red-600 p-6 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-xl">
                  <Settings className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter">Painel Administrativo</h3>
                  <p className="text-red-200 text-[10px] font-bold uppercase tracking-widest">Edição do Manual do Usuário</p>
                </div>
              </div>
              <button 
                onClick={() => setIsManualAdminModalOpen(false)}
                className="text-white/60 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-4">
                <AlertCircle className="w-6 h-6 text-red-600 shrink-0" />
                <p className="text-red-800 text-xs font-medium">
                  As alterações feitas aqui serão salvas no banco de dados e refletidas para todos os usuários do aplicativo em tempo real.
                </p>
              </div>

              {/* Intro Editor */}
              <div className="space-y-4 bg-zinc-50 p-6 rounded-2xl border border-zinc-200">
                <h4 className="text-sm font-black text-zinc-900 uppercase tracking-tight flex items-center gap-2">
                  <Info className="w-4 h-4 text-amber-500" />
                  Seção de Introdução
                </h4>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Título da Introdução</label>
                    <input 
                      type="text"
                      value={manualConfig.introTitle}
                      onChange={(e) => setManualConfig({ ...manualConfig, introTitle: e.target.value })}
                      className="w-full bg-white border border-zinc-200 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-red-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Texto de Boas-vindas</label>
                    <textarea 
                      value={manualConfig.introContent}
                      onChange={(e) => setManualConfig({ ...manualConfig, introContent: e.target.value })}
                      rows={3}
                      className="w-full bg-white border border-zinc-200 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Items Editor */}
              <div className="space-y-4">
                <h4 className="text-sm font-black text-zinc-900 uppercase tracking-tight flex items-center gap-2">
                  <LayoutDashboard className="w-4 h-4 text-amber-500" />
                  Funcionalidades (Lista)
                </h4>
                <div className="space-y-4">
                  {manualConfig.items.map((item: any, index: number) => (
                    <div key={item.id} className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6 space-y-4 relative group">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="bg-zinc-200 text-zinc-600 text-[10px] font-black px-2 py-0.5 rounded-md">#{index + 1}</span>
                          <h5 className="font-bold text-zinc-900">Item: {item.title}</h5>
                        </div>
                        <button 
                          onClick={() => {
                            const newItems = manualConfig.items.filter((_: any, i: number) => i !== index);
                            setManualConfig({ ...manualConfig, items: newItems });
                          }}
                          className="text-zinc-400 hover:text-red-600 transition-colors p-2"
                          title="Remover Item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase">Título</label>
                          <input 
                            type="text"
                            value={item.title}
                            onChange={(e) => {
                              const newItems = [...manualConfig.items];
                              newItems[index].title = e.target.value;
                              setManualConfig({ ...manualConfig, items: newItems });
                            }}
                            className="w-full bg-white border border-zinc-200 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-red-500 outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase">Ícone (Lucide Name)</label>
                          <select 
                            value={item.icon}
                            onChange={(e) => {
                              const newItems = [...manualConfig.items];
                              newItems[index].icon = e.target.value;
                              setManualConfig({ ...manualConfig, items: newItems });
                            }}
                            className="w-full bg-white border border-zinc-200 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-red-500 outline-none"
                          >
                            <option value="Calculator">Calculadora</option>
                            <option value="LayoutDashboard">Dashboard</option>
                            <option value="Settings">Configurações</option>
                            <option value="Package">Produtos</option>
                            <option value="History">Histórico</option>
                            <option value="FileUp">Importação</option>
                            <option value="Download">Exportação</option>
                            <option value="RotateCcw">Resetar</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase">Descrição</label>
                        <textarea 
                          value={item.description}
                          onChange={(e) => {
                            const newItems = [...manualConfig.items];
                            newItems[index].description = e.target.value;
                            setManualConfig({ ...manualConfig, items: newItems });
                          }}
                          rows={3}
                          className="w-full bg-white border border-zinc-200 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none"
                        />
                      </div>
                    </div>
                  ))}

                  <button 
                    onClick={() => {
                      const newItem = {
                        id: `item-${Date.now()}`,
                        title: 'Novo Item',
                        description: 'Descrição do novo item...',
                        icon: 'HelpCircle'
                      };
                      setManualConfig({ ...manualConfig, items: [...manualConfig.items, newItem] });
                    }}
                    className="w-full py-4 border-2 border-dashed border-zinc-200 rounded-2xl text-zinc-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all flex items-center justify-center gap-2 font-bold text-sm"
                  >
                    <Plus className="w-5 h-5" />
                    ADICIONAR NOVO ITEM AO MANUAL
                  </button>
                </div>
              </div>

              {/* Contact Editor */}
              <div className="space-y-4 bg-amber-50 p-6 rounded-2xl border border-amber-200">
                <h4 className="text-sm font-black text-amber-900 uppercase tracking-tight flex items-center gap-2">
                  <Mail className="w-4 h-4 text-amber-600" />
                  Seção de Contato
                </h4>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-amber-700 uppercase">Título do Contato</label>
                    <input 
                      type="text"
                      value={manualConfig.contactTitle}
                      onChange={(e) => setManualConfig({ ...manualConfig, contactTitle: e.target.value })}
                      className="w-full bg-white border border-amber-200 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-red-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-amber-700 uppercase">Mensagem de Suporte</label>
                    <textarea 
                      value={manualConfig.contactContent}
                      onChange={(e) => setManualConfig({ ...manualConfig, contactContent: e.target.value })}
                      rows={3}
                      className="w-full bg-white border border-amber-200 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 bg-zinc-50 border-t border-zinc-200 flex justify-between items-center">
              <div className="flex gap-2">
                <input 
                  type="file" 
                  accept=".json"
                  className="hidden"
                  id="manual-import"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        try {
                          const json = JSON.parse(event.target?.result as string);
                          if (Array.isArray(json)) {
                            setManualConfig({ ...manualConfig, items: json });
                            showToast("Itens do manual importados! Clique em salvar para aplicar.", "success");
                          } else if (json && typeof json === 'object' && json.items) {
                            setManualConfig(json);
                            showToast("Configuração completa do manual importada! Clique em salvar para aplicar.", "success");
                          } else {
                            showToast("Formato de arquivo inválido.", "error");
                          }
                        } catch (err) {
                          showToast("Erro ao ler arquivo JSON.", "error");
                        }
                      };
                      reader.readAsText(file);
                    }
                  }}
                />
                <button 
                  onClick={() => document.getElementById('manual-import')?.click()}
                  className="flex items-center gap-2 bg-white hover:bg-zinc-100 text-zinc-700 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border border-zinc-200"
                >
                  <FileUp className="w-4 h-4 text-amber-500" />
                  IMPORTAR JSON
                </button>
                <button 
                  onClick={() => {
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(manualConfig, null, 2));
                    const downloadAnchorNode = document.createElement('a');
                    downloadAnchorNode.setAttribute("href",     dataStr);
                    downloadAnchorNode.setAttribute("download", "manual_backup.json");
                    document.body.appendChild(downloadAnchorNode);
                    downloadAnchorNode.click();
                    downloadAnchorNode.remove();
                  }}
                  className="flex items-center gap-2 bg-white hover:bg-zinc-100 text-zinc-700 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border border-zinc-200"
                >
                  <Download className="w-4 h-4 text-blue-500" />
                  EXPORTAR JSON
                </button>
              </div>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsManualAdminModalOpen(false)}
                  className="px-6 py-2.5 text-sm font-bold text-zinc-500 hover:text-zinc-700 transition-colors"
                >
                  DESCARTAR
                </button>
                <button 
                  onClick={() => handleSaveManual(manualConfig)}
                  disabled={isSavingManual}
                  className="bg-red-600 hover:bg-red-500 text-white px-8 py-2.5 rounded-xl font-bold text-xs transition-all active:scale-95 shadow-lg shadow-red-500/20 disabled:opacity-50 flex items-center gap-2"
                >
                  {isSavingManual ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  SALVAR ALTERAÇÕES NO MANUAL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              {!isPro ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-6">
                  <div className="bg-amber-500/10 p-6 rounded-3xl">
                    <History className="w-16 h-16 text-amber-600" />
                  </div>
                  <div className="max-w-md space-y-2">
                    <h3 className="text-2xl font-black text-zinc-900 uppercase tracking-tighter">Histórico de Simulações PRO</h3>
                    <p className="text-zinc-500 text-sm leading-relaxed">
                      Acesse todos os seus cálculos salvos, compare simulações e mantenha um registro completo das suas operações.
                    </p>
                  </div>
                  <button 
                    onClick={() => setIsUpgradeModalOpen(true)}
                    className="bg-zinc-950 hover:bg-zinc-800 text-white px-8 py-4 rounded-2xl font-bold transition-all shadow-xl shadow-zinc-950/20 active:scale-95 flex items-center gap-3"
                  >
                    <Package className="w-5 h-5 text-amber-500" />
                    DESBLOQUEAR AGORA
                  </button>
                </div>
              ) : !user ? (
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
              {!isPro ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-6">
                  <div className="bg-amber-500/10 p-6 rounded-3xl">
                    <Package className="w-16 h-16 text-amber-600" />
                  </div>
                  <div className="max-w-md space-y-2">
                    <h3 className="text-2xl font-black text-zinc-900 uppercase tracking-tighter">Gestão de Produtos PRO</h3>
                    <p className="text-zinc-500 text-sm leading-relaxed">
                      Cadastre seus produtos, gerencie estoques e tenha acesso rápido aos custos de aquisição para agilizar seus cálculos.
                    </p>
                  </div>
                  <button 
                    onClick={() => setIsUpgradeModalOpen(true)}
                    className="bg-zinc-950 hover:bg-zinc-800 text-white px-8 py-4 rounded-2xl font-bold transition-all shadow-xl shadow-zinc-950/20 active:scale-95 flex items-center gap-3"
                  >
                    <Package className="w-5 h-5 text-amber-500" />
                    DESBLOQUEAR AGORA
                  </button>
                </div>
              ) : !user ? (
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
        {/* Settings Modal */}
        <SettingsModal 
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          settings={userSettings}
          onSave={handleSaveSettings}
          isSaving={isSavingSettings}
          isPro={isPro}
          onUpgrade={() => setIsUpgradeModalOpen(true)}
        />

        <FloatingCalculator 
          isOpen={isFloatingCalculatorOpen}
          onClose={() => setIsFloatingCalculatorOpen(false)}
        />

        {/* Toast Notification */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className={`px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${
              toast.type === 'success' ? 'bg-zinc-900 border-green-500/50 text-green-400' :
              toast.type === 'error' ? 'bg-zinc-900 border-red-500/50 text-red-400' :
              'bg-zinc-900 border-amber-500/50 text-amber-400'
            }`}>
              {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> :
               toast.type === 'error' ? <AlertCircle className="w-5 h-5" /> :
               <Info className="w-5 h-5" />}
              <span className="text-sm font-bold tracking-tight">{toast.message}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  </ErrorBoundary>
);
}

// Floating Calculator Component
const FloatingCalculator = React.memo(({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [shouldReset, setShouldReset] = useState(false);

  const handleNumber = useCallback((num: string) => {
    setDisplay(prev => {
      if (prev === '0' || shouldReset) {
        setShouldReset(false);
        return num;
      }
      return prev + num;
    });
  }, [shouldReset]);

  const handleOperator = useCallback((op: string) => {
    setEquation(display + ' ' + op + ' ');
    setShouldReset(true);
  }, [display]);

  const calculate = useCallback(() => {
    try {
      const fullEquation = equation + display;
      // Sanitize input: only allow numbers, operators, and decimal point
      const sanitized = fullEquation.replace(/[^0-9+\-*/.,]/g, '').replace(',', '.');
      const result = eval(sanitized);
      setDisplay(String(result).replace('.', ','));
      setEquation('');
      setShouldReset(true);
    } catch (e) {
      setDisplay('Erro');
    }
  }, [equation, display]);

  const clear = useCallback(() => {
    setDisplay('0');
    setEquation('');
    setShouldReset(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Numbers
      if (e.key >= '0' && e.key <= '9') {
        handleNumber(e.key);
      } 
      // Operators
      else if (['+', '-', '*', '/'].includes(e.key)) {
        handleOperator(e.key);
      } 
      // Equals
      else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        calculate();
      } 
      // Clear
      else if (e.key === 'Escape' || e.key === 'Delete' || e.key === 'c' || e.key === 'C') {
        clear();
      } 
      // Decimal
      else if (e.key === ',' || e.key === '.') {
        handleNumber(',');
      }
      // Backspace
      else if (e.key === 'Backspace') {
        setDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleNumber, handleOperator, calculate, clear]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 sm:inset-auto sm:bottom-4 sm:right-4 flex items-center justify-center sm:block z-[200] animate-in fade-in zoom-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-72 overflow-hidden flex flex-col">
        <div className="bg-zinc-800 p-3 flex items-center justify-between border-b border-zinc-700">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-amber-500" />
            <span className="text-white text-xs font-bold uppercase tracking-wider">Calculadora</span>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 bg-zinc-950 text-right">
          <div className="text-zinc-500 text-[10px] h-4 mb-1 font-mono">{equation}</div>
          <div className="text-white text-3xl font-mono font-bold truncate">{display}</div>
        </div>

        <div className="p-2 grid grid-cols-4 gap-1 bg-zinc-900">
          <button onClick={clear} className="col-span-2 p-3 bg-zinc-800 text-amber-500 rounded-lg font-bold hover:bg-zinc-700 transition-colors">AC</button>
          <button onClick={() => handleOperator('/')} className="p-3 bg-zinc-800 text-amber-500 rounded-lg font-bold hover:bg-zinc-700 transition-colors">÷</button>
          <button onClick={() => handleOperator('*')} className="p-3 bg-zinc-800 text-amber-500 rounded-lg font-bold hover:bg-zinc-700 transition-colors">×</button>

          {[7, 8, 9].map(n => (
            <button key={n} onClick={() => handleNumber(String(n))} className="p-3 bg-zinc-800 text-white rounded-lg font-bold hover:bg-zinc-700 transition-colors">{n}</button>
          ))}
          <button onClick={() => handleOperator('-')} className="p-3 bg-zinc-800 text-amber-500 rounded-lg font-bold hover:bg-zinc-700 transition-colors">−</button>

          {[4, 5, 6].map(n => (
            <button key={n} onClick={() => handleNumber(String(n))} className="p-3 bg-zinc-800 text-white rounded-lg font-bold hover:bg-zinc-700 transition-colors">{n}</button>
          ))}
          <button onClick={() => handleOperator('+')} className="p-3 bg-zinc-800 text-amber-500 rounded-lg font-bold hover:bg-zinc-700 transition-colors">+</button>

          {[1, 2, 3].map(n => (
            <button key={n} onClick={() => handleNumber(String(n))} className="p-3 bg-zinc-800 text-white rounded-lg font-bold hover:bg-zinc-700 transition-colors">{n}</button>
          ))}
          <button onClick={calculate} className="row-span-2 p-3 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-500 transition-colors shadow-lg shadow-amber-600/20">=</button>

          <button onClick={() => handleNumber('0')} className="col-span-2 p-3 bg-zinc-800 text-white rounded-lg font-bold hover:bg-zinc-700 transition-colors">0</button>
          <button onClick={() => handleNumber(',')} className="p-3 bg-zinc-800 text-white rounded-lg font-bold hover:bg-zinc-700 transition-colors">,</button>
        </div>
      </div>
    </div>
  );
});
