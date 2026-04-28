import * as React from 'react';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Calculator, DollarSign, Percent, RefreshCw, Info, Download, RotateCcw, LogIn, LogOut, Save, History, CheckCircle2, AlertCircle, Trash2, Calendar, User as UserIcon, Package, Plus, Edit2, Settings, LayoutDashboard, FileUp, X, HelpCircle, Mail, ExternalLink, Search, ShieldAlert, Lock, BookOpen, ChevronDown, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
    RotateCcw,
    Calendar,
    Percent,
    BookOpen
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

// Subscription Alert Component
const SubscriptionAlert = React.memo(({ 
  days, 
  onClose 
}: { 
  days: number, 
  onClose: () => void 
}) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top duration-500">
      <div className="bg-brand-primary text-brand-black px-4 py-2 rounded-full shadow-2xl flex items-center gap-3 border border-brand-primary/20">
        <div className="bg-brand-black/10 p-1 rounded-full">
          <Calendar className="w-4 h-4" />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-tight">
          Sua assinatura PRO vence em <span className="underline">{days} {days === 1 ? 'dia' : 'dias'}</span>. Renove agora!
        </p>
        <button 
          onClick={onClose}
          className="hover:bg-brand-black/10 p-1 rounded-full transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
});

SubscriptionAlert.displayName = 'SubscriptionAlert';

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
  labelClassName = "text-slate-300"
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
      {label && <label className={`text-[8px] sm:text-[9px] font-bold uppercase tracking-wide ${labelClassName}`}>{label}</label>}
      <div className={`relative flex items-center bg-brand-black border border-brand-border rounded-lg shadow-sm focus-within:ring-2 focus-within:ring-brand-primary focus-within:border-brand-primary ${disabled ? 'bg-brand-muted opacity-80' : ''}`}>
        {prefix && <span className="pl-2 sm:pl-3 text-slate-500 text-[10px] sm:text-sm font-medium">{prefix}</span>}
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
          className="w-full py-1.5 sm:py-2 px-2 sm:px-3 text-right outline-none bg-transparent font-mono text-slate-100 font-medium text-[11px] sm:text-xs"
          placeholder={placeholder}
        />
        {suffix && <span className="pr-2 sm:pr-3 text-slate-500 text-[10px] sm:text-sm font-medium">{suffix}</span>}
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
  onValueChange,
  className = "",
  disabled = false
}: { 
  label: string, 
  percent: number, 
  onChange: (val: number) => void, 
  baseValue: number,
  onValueChange?: (val: number) => void,
  className?: string,
  disabled?: boolean
}) => {
  const calculatedValue = useMemo(() => baseValue * (percent / 100), [baseValue, percent]);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className={`text-[8px] sm:text-[9px] font-bold uppercase tracking-wide px-1 ${disabled ? 'text-slate-500' : 'text-slate-300'}`}>{label}</label>
      <div className="grid grid-cols-2 gap-1 sm:gap-2">
        <NumberInput 
          label="" 
          value={percent} 
          onChange={onChange} 
          prefix="" 
          suffix="%" 
          disabled={disabled}
        />
        <NumberInput 
          label="" 
          value={calculatedValue} 
          onChange={onValueChange}
          disabled={!onValueChange || disabled} 
          prefix="R$" 
          className={(!onValueChange || disabled) ? "opacity-80" : ""}
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
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-6 bg-brand-bg min-h-[600px]">
        <div className="bg-brand-primary/10 p-6 rounded-3xl">
          <LayoutDashboard className="w-16 h-16 text-brand-primary" />
        </div>
        <div className="max-w-md space-y-2">
          <h3 className="text-2xl font-black text-slate-100 uppercase tracking-tighter">Dashboard Exclusivo PRO</h3>
          <p className="text-slate-500 text-sm leading-relaxed">
            Tenha acesso a métricas avançadas, gráficos de lucratividade e análise detalhada do seu faturamento.
          </p>
        </div>
        <button 
          onClick={onUpgrade}
          className="bg-brand-primary hover:bg-brand-primary-hover text-brand-black px-8 py-4 rounded-2xl font-bold text-[17px] transition-all shadow-xl shadow-brand-primary/20 active:scale-95 flex items-center gap-3"
        >
          <Package className="w-5 h-5" />
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
        <div className="bg-brand-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto">
          <LayoutDashboard className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-bold text-slate-100">Nenhum dado disponível</h3>
        <p className="text-slate-500 max-w-xs mx-auto">Salve alguns cálculos para começar a ver as estatísticas da sua operação.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-brand-card p-6 rounded-2xl border border-brand-border shadow-sm space-y-2">
          <div className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Total de Simulações</div>
          <div className="text-3xl font-bold text-slate-100">{stats.totalCalculations}</div>
          <div className="text-xs text-slate-500">Histórico completo</div>
        </div>
        <div className="bg-brand-card p-6 rounded-2xl border border-brand-border shadow-sm space-y-2">
          <div className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Margem Média</div>
          <div className="text-3xl font-bold text-brand-primary">{stats.avgProfitMargin.toFixed(2)}%</div>
          <div className="text-xs text-slate-500">Lucro líquido médio</div>
        </div>
        <div className="bg-brand-card p-6 rounded-2xl border border-brand-border shadow-sm space-y-2">
          <div className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Volume de Vendas</div>
          <div className="text-3xl font-bold text-brand-primary">{formatCurrency(stats.totalSalesValue)}</div>
          <div className="text-xs text-slate-500">Soma de todos os preços calculados</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Products Chart */}
        <div className="bg-brand-card p-6 rounded-2xl border border-brand-border shadow-sm space-y-6">
          <h3 className="font-bold text-slate-100 flex items-center gap-2">
            <Package className="w-5 h-5 text-brand-primary" />
            Produtos Mais Calculados
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.topProducts} layout="vertical" margin={{ left: 40, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#2D3748" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={100} 
                  tick={{ fontSize: 10, fill: '#A0AEC0' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  cursor={{ fill: '#2D3748' }}
                  contentStyle={{ backgroundColor: '#10141A', borderRadius: '12px', border: '1px solid #2D3748', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)' }}
                />
                <Bar dataKey="count" fill="#0BC5EA" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Margin Distribution Chart */}
        <div className="bg-brand-card p-6 rounded-2xl border border-brand-border shadow-sm space-y-6">
          <h3 className="font-bold text-slate-100 flex items-center gap-2">
            <Percent className="w-5 h-5 text-brand-primary" />
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
                    <Cell key={`cell-${index}`} fill={['#0BC5EA', '#00B5D8', '#0987A0', '#065666'][index % 4]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#10141A', borderRadius: '12px', border: '1px solid #2D3748', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 flex-wrap">
            {stats.marginRanges.map((range, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] font-medium text-slate-500">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#0BC5EA', '#00B5D8', '#0987A0', '#065666'][i % 4] }}></div>
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
    defaultRegimeCompra: 'Real',
    defaultRegimeVenda: 'Real',
    defaultSimplesNacionalRate: 0,
    defaultIcmsPurchaseRate: 0,
    defaultIcmsFreightRate: 0,
    defaultIpi: 0,
    defaultPisPurchaseRate: 0,
    defaultCofinsPurchaseRate: 0,
    defaultIcmsSaleRate: 0,
    defaultPisSaleRate: 1.65,
    defaultCofinsSaleRate: 7.6,
    defaultIrpjRate: 1.2,
    defaultCsllRate: 1.08,
    defaultSaleExpensesRate: 0,
    defaultCommissionRate: 0,
    defaultProfitMargin: 0
  });

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-brand-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-brand-card w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden border border-brand-border flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-brand-border flex items-center justify-between bg-brand-black">
          <div className="flex items-center gap-3">
            <div className="bg-brand-primary/20 p-2 rounded-xl">
              <Settings className="w-6 h-6 text-brand-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100">Configurações Padrão</h2>
              <p className="text-xs text-slate-500">Defina as alíquotas que serão usadas em novos cálculos.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-brand-muted rounded-full transition-colors">
            <RotateCcw className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Regime Tributário Padrão</h3>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-300 uppercase">Venda (Sua Empresa)</label>
                  <div className="flex gap-2 p-1 bg-brand-black rounded-xl border border-brand-border">
                    {(['Simples', 'Presumido', 'Real'] as const).map((regime) => (
                      <button
                        key={regime}
                        type="button"
                        onClick={() => setLocalSettings({ ...localSettings, defaultRegimeVenda: regime })}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                          localSettings.defaultRegimeVenda === regime 
                            ? 'bg-brand-primary text-brand-black' 
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {regime}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Custos e Créditos de Compra</h3>
              <div className="space-y-3">
                {localSettings.defaultRegimeCompra !== 'Simples' && (
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-300 uppercase">IPI Padrão (%)</label>
                    <input 
                      type="number" 
                      value={localSettings.defaultIpi} 
                      onChange={(e) => setLocalSettings({ ...localSettings, defaultIpi: Number(e.target.value) })}
                      className="w-full bg-brand-black border border-brand-border rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary outline-none text-slate-100"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-300 uppercase">ICMS Compra (%)</label>
                  <input 
                    type="number" 
                    value={localSettings.defaultIcmsPurchaseRate} 
                    onChange={(e) => setLocalSettings({ ...localSettings, defaultIcmsPurchaseRate: Number(e.target.value) })}
                    className="w-full bg-brand-black border border-brand-border rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary outline-none text-slate-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-300 uppercase">ICMS Frete (%)</label>
                  <input 
                    type="number" 
                    value={localSettings.defaultIcmsFreightRate} 
                    onChange={(e) => setLocalSettings({ ...localSettings, defaultIcmsFreightRate: Number(e.target.value) })}
                    className="w-full bg-brand-black border border-brand-border rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary outline-none text-slate-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-300 uppercase">PIS Compra (%)</label>
                  <input 
                    type="number" 
                    step="0.001"
                    value={localSettings.defaultPisPurchaseRate} 
                    onChange={(e) => setLocalSettings({ ...localSettings, defaultPisPurchaseRate: Number(e.target.value) })}
                    className="w-full bg-brand-black border border-brand-border rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary outline-none text-slate-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-300 uppercase">COFINS Compra (%)</label>
                  <input 
                    type="number" 
                    step="0.001"
                    value={localSettings.defaultCofinsPurchaseRate} 
                    onChange={(e) => setLocalSettings({ ...localSettings, defaultCofinsPurchaseRate: Number(e.target.value) })}
                    className="w-full bg-brand-black border border-brand-border rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary outline-none text-slate-100"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Deduções de Venda</h3>
              <div className="space-y-3">
                {localSettings.defaultRegimeVenda === 'Simples' ? (
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-300 uppercase">Simples Nacional (%)</label>
                    <input 
                      type="number" 
                      value={localSettings.defaultSimplesNacionalRate} 
                      onChange={(e) => setLocalSettings({ ...localSettings, defaultSimplesNacionalRate: Number(e.target.value) })}
                      className="w-full bg-brand-black border border-brand-border rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary outline-none text-slate-100"
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-300 uppercase">ICMS Venda (%)</label>
                      <input 
                        type="number" 
                        value={localSettings.defaultIcmsSaleRate} 
                        onChange={(e) => setLocalSettings({ ...localSettings, defaultIcmsSaleRate: Number(e.target.value) })}
                        className="w-full bg-brand-black border border-brand-border rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary outline-none text-slate-100"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-300 uppercase">PIS (%)</label>
                        <input 
                          type="number" 
                          step="0.001"
                          value={localSettings.defaultPisSaleRate} 
                          onChange={(e) => setLocalSettings({ ...localSettings, defaultPisSaleRate: Number(e.target.value) })}
                          className="w-full bg-brand-black border border-brand-border rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary outline-none text-slate-100"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-300 uppercase">COFINS (%)</label>
                        <input 
                          type="number" 
                          step="0.001"
                          value={localSettings.defaultCofinsSaleRate} 
                          onChange={(e) => setLocalSettings({ ...localSettings, defaultCofinsSaleRate: Number(e.target.value) })}
                          className="w-full bg-brand-black border border-brand-border rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary outline-none text-slate-100"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-300 uppercase">IRPJ (%)</label>
                        <input 
                          type="number" 
                          step="0.001"
                          value={localSettings.defaultIrpjRate} 
                          onChange={(e) => setLocalSettings({ ...localSettings, defaultIrpjRate: Number(e.target.value) })}
                          className="w-full bg-brand-black border border-brand-border rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary outline-none text-slate-100"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-300 uppercase">CSLL (%)</label>
                        <input 
                          type="number" 
                          step="0.001"
                          value={localSettings.defaultCsllRate} 
                          onChange={(e) => setLocalSettings({ ...localSettings, defaultCsllRate: Number(e.target.value) })}
                          className="w-full bg-brand-black border border-brand-border rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary outline-none text-slate-100"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-brand-border space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Comercial</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-300 uppercase">Outras Despesas (%)</label>
                <input 
                  type="number" 
                  value={localSettings.defaultSaleExpensesRate} 
                  onChange={(e) => setLocalSettings({ ...localSettings, defaultSaleExpensesRate: Number(e.target.value) })}
                  className="w-full bg-brand-black border border-brand-border rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary outline-none text-slate-100"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-300 uppercase">Comissão (%)</label>
                <input 
                  type="number" 
                  value={localSettings.defaultCommissionRate} 
                  onChange={(e) => setLocalSettings({ ...localSettings, defaultCommissionRate: Number(e.target.value) })}
                  className="w-full bg-brand-black border border-brand-border rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary outline-none text-slate-100"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-300 uppercase">Margem de Lucro (%)</label>
                <input 
                  type="number" 
                  value={localSettings.defaultProfitMargin} 
                  onChange={(e) => setLocalSettings({ ...localSettings, defaultProfitMargin: Number(e.target.value) })}
                  className="w-full bg-brand-black border border-brand-border rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-brand-primary outline-none text-slate-100"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-brand-border bg-brand-black flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 bg-brand-muted hover:bg-brand-muted/80 text-slate-300 py-3 rounded-xl font-bold text-[17px] transition-colors border border-brand-border"
          >
            Cancelar
          </button>
          <button 
            onClick={() => onSave(localSettings)}
            disabled={isSaving}
            className="flex-[2] bg-brand-primary hover:bg-brand-primary-hover text-brand-black py-3 rounded-xl font-bold text-[17px] transition-all shadow-lg shadow-brand-primary/20 active:scale-95 flex items-center justify-center gap-2"
          >
            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            SALVAR CONFIGURAÇÕES
            {!isPro && <span className="bg-amber-500 text-white px-1 rounded-[4px] text-[8px]">PRO</span>}
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
  const AUTHORIZED_EMAILS = useMemo(() => [
    'adm.valdemir@gmail.com', 
    'contabil@mgvcontabilidade.com.br',
    'elisriske@gmail.com',
    // Adicione aqui os e-mails das pessoas que participarão dos testes controlados
  ], []);

  const isAdmin = useMemo(() => {
    return user?.email === 'adm.valdemir@gmail.com';
     }, [user]);
  
  const isAuthorized = useMemo(() => {
    if (!user) return false;
    return AUTHORIZED_EMAILS.includes(user.email || '') || isAdmin;
  }, [user, AUTHORIZED_EMAILS, isAdmin]);

  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // State - Upgrade Modal
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isManualAdminModalOpen, setIsManualAdminModalOpen] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [subscriptionAlert, setSubscriptionAlert] = useState<{ isOpen: boolean, days: number }>({ isOpen: false, days: 0 });

  // State - Save Modal
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [productName, setProductName] = useState('');
  const [representativeName, setRepresentativeName] = useState('');

  // State - History Modal
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [savedCalculations, setSavedCalculations] = useState<any[]>([]);
  const [historySearch, setHistorySearch] = useState('');
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
  const [regimeCompra, setRegimeCompra] = useState<'Simples' | 'Presumido' | 'Real'>('Real');
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [freight, setFreight] = useState(0);
  const [ipi, setIpi] = useState(0);
  const [ipiRate, setIpiRate] = useState(0);
  const [otherExpenses, setOtherExpenses] = useState(0);
  const [otherExpensesRate, setOtherExpensesRate] = useState(0);
  
  // State - Tax Credits (Purchase)
  const [icmsPurchaseRate, setIcmsPurchaseRate] = useState(0); // %
  const [icmsFreightRate, setIcmsFreightRate] = useState(0); // %
  const [pisPurchaseRate, setPisPurchaseRate] = useState(0); // %
  const [cofinsPurchaseRate, setCofinsPurchaseRate] = useState(0); // %

  // State - Sale Markup
  const [regimeVenda, setRegimeVenda] = useState<'Simples' | 'Presumido' | 'Real'>('Real');
  const [simplesNacionalRate, setSimplesNacionalRate] = useState(0); // % (SN)
  const [icmsSaleRate, setIcmsSaleRate] = useState(0); // % (i)
  const [pisSaleRate, setPisSaleRate] = useState(1.65); // % (p)
  const [cofinsSaleRate, setCofinsSaleRate] = useState(7.6); // % (c)
  const [irpjRate, setIrpjRate] = useState(1.2); // % (r)
  const [csllRate, setCsllRate] = useState(1.08); // % (s)
  const [saleExpensesRate, setSaleExpensesRate] = useState(0); // % (D)
  const [saleExpensesValue, setSaleExpensesValue] = useState(0); // R$ (Calculated)
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
    contactContent: "Estamos sempre buscando melhorar! Se você tiver alguma pergunta sobre os cálculos ou sugestões de novas funcionalidades, entre em contato conosco.",
    supportEmail: "suporte@nivorconsultoria.com.br"
  });
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [showPurchaseMemo, setShowPurchaseMemo] = useState(false);
  const [showSalesMemo, setShowSalesMemo] = useState(false);

  // Legal Content State
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [isLegalAdminModalOpen, setIsLegalAdminModalOpen] = useState(false);
  const [isExampleModalOpen, setIsExampleModalOpen] = useState(false);
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const [selectedLegalTab, setSelectedLegalTab] = useState<'privacy' | 'terms'>('privacy');
  const [legalConfigs, setLegalConfigs] = useState<Record<string, any>>({
    privacy: { title: 'Política de Privacidade', content: 'Carregando...' },
    terms: { title: 'Termos de Uso', content: 'Carregando...' }
  });
  const [isSavingLegal, setIsSavingLegal] = useState(false);

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
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // User Document Listener (Plan, Expiration, Admin)
  useEffect(() => {
    if (!user) {
      setUserPlan('FREE');
      return;
    }

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      // Special override for master admin and authorized test users
      if (isAdmin || isAuthorized) {
        setUserPlan('PRO');
        return;
      }
      
      if (docSnap.exists()) {
        const userData = docSnap.data();
        
        // Expiration Logic
        const now = new Date();
        const expiresAt = userData.expiresAt?.toDate();
        
        if (expiresAt && expiresAt < now && userData.plan === 'PRO') {
          // Plan expired! Update Firestore and local state
          setUserPlan('FREE');
          updateDoc(userDocRef, { 
            plan: 'FREE',
            expiredAt: Timestamp.now() 
          }).catch(err => console.error("Error downgrading expired user:", err));
          
          showToast("Sua assinatura PRO expirou. Retornando ao plano gratuito.", "info");
        } else {
          // Force FREE if not authorized and not admin, even if DB says PRO
          const finalPlan = (isAdmin || isAuthorized) ? 'PRO' : (userData.plan === 'PRO' ? 'PRO' : 'FREE');
          setUserPlan(finalPlan);
          
          // If the user is NOT authorized/admin but marked as PRO in DB, we still allow PRO (standard subscription)
          // UNLESS you want to STRICTLY only allow those in the list.
          // In this case, we'll follow the logical priority: List > DB.
          
          // Show expiration alert if PRO and not the admin
          if (userData.plan === 'PRO' && !isAdmin && expiresAt) {
            const diffTime = expiresAt.getTime() - now.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays > 0 && diffDays <= 5) {
              setSubscriptionAlert({ isOpen: true, days: diffDays });
            }
          }
        }
      } else {
        // Create user doc if it doesn't exist
        setDoc(userDocRef, {
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          plan: 'FREE',
          createdAt: Timestamp.now()
        }).catch(error => {
          handleFirestoreError(error, OperationType.WRITE, 'users');
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    });

    return () => unsubscribe();
  }, [user, isAdmin, isAuthorized, showToast]);

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
      where('userId', '==', user.uid)
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
        setRegimeCompra(prev => (prev === 'Simples' || !prev) ? (settings.defaultRegimeCompra || 'Real') : prev);
        setIcmsPurchaseRate(prev => prev === 0 ? (settings.defaultIcmsPurchaseRate || 0) : prev);
        setIcmsFreightRate(prev => prev === 0 ? (settings.defaultIcmsFreightRate || 0) : prev);
        setIpiRate(prev => prev === 0 ? (settings.defaultIpi || 0) : prev);
        setPisPurchaseRate(prev => prev === 0 ? (settings.defaultPisPurchaseRate || 0) : prev);
        setCofinsPurchaseRate(prev => prev === 0 ? (settings.defaultCofinsPurchaseRate || 0) : prev);
        setRegimeVenda(settings.defaultRegimeVenda || 'Real');
        setSimplesNacionalRate(prev => prev === 0 ? (settings.defaultSimplesNacionalRate || 0) : prev);
        setIcmsSaleRate(prev => prev === 0 ? (settings.defaultIcmsSaleRate || 0) : prev);
        setPisSaleRate(prev => prev === 1.65 ? (settings.defaultPisSaleRate || 1.65) : prev);
        setCofinsSaleRate(prev => prev === 7.6 ? (settings.defaultCofinsSaleRate || 7.6) : prev);
        setIrpjRate(settings.defaultIrpjRate ?? 1.2);
        setCsllRate(settings.defaultCsllRate ?? 1.08);
        setSaleExpensesRate(prev => prev === 0 ? (settings.defaultSaleExpensesRate || 0) : prev);
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

  // Fetch Legal Content
  useEffect(() => {
    const fetchLegal = async () => {
      const docs = ['privacy', 'terms'];
      const configs: any = {};
      
      for (const id of docs) {
        const docRef = doc(db, 'legal', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          configs[id] = docSnap.data();
        } else {
          // Defaults if not exists
          configs[id] = {
            title: id === 'privacy' ? 'Política de Privacidade' : 'Termos de Uso',
            content: 'O conteúdo será enviado em breve pelo administrador.',
            updatedAt: Timestamp.now()
          };
          if (isAdmin) {
            await setDoc(docRef, configs[id]);
          }
        }
      }
      setLegalConfigs(prev => ({ ...prev, ...configs }));
    };

    fetchLegal();
  }, [isAdmin]);

  const handleSaveLegal = useCallback(async (type: string, data: any) => {
    setIsSavingLegal(true);
    try {
      const docRef = doc(db, 'legal', type);
      await setDoc(docRef, {
        ...data,
        updatedAt: Timestamp.now()
      });
      setLegalConfigs(prev => ({ ...prev, [type]: data }));
      showToast("Conteúdo legal atualizado com sucesso!", "success");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `legal/${type}`);
    } finally {
      setIsSavingLegal(false);
    }
  }, [showToast]);

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
  const { totalCost, icmsCreditValue, pisCreditValue, cofinsCreditValue, totalCreditValue, realCost, pisCofinsCreditBase } = useMemo(() => {
    // Regra: Custo = Produto + IPI + Frete
    const cost = purchasePrice + freight + ipi + otherExpenses;
    
    let creditIcms = 0;
    let creditPis = 0;
    let creditCofins = 0;
    let creditIcmsForBase = 0;

    if (regimeCompra !== 'Simples') {
      creditIcmsForBase = (purchasePrice * (icmsPurchaseRate / 100)) + (freight * (icmsFreightRate / 100));
    }

    // Créditos dependem do Regime do Comprador (Venda) e do Fornecedor (Compra)
    // Se o comprador (user) é Lucro Real, ele tem direito a PIS/COFINS
    if (regimeVenda === 'Real') {
      // Créditos PIS/COFINS
      // Se Fornecedor é Real/Presumido: Subtrai ICMS da base (Tese do Século)
      // Se Fornecedor é Simples: Não subtrai ICMS da base
      
      // Base PIS/COFINS = (Produto + Frete + IPI + Outras) - ICMS Destacado
      const basePisCofins = cost - creditIcmsForBase;
      
      creditPis = basePisCofins * (pisPurchaseRate / 100);
      creditCofins = basePisCofins * (cofinsPurchaseRate / 100);
    }

    // Crédito ICMS (Real ou Presumido)
    if (regimeVenda === 'Real' || regimeVenda === 'Presumido') {
      creditIcms = (purchasePrice * (icmsPurchaseRate / 100)) + (freight * (icmsFreightRate / 100));
    }
    
    const totalCredit = creditIcms + creditPis + creditCofins;
    const rCost = cost - totalCredit;

    return {
      totalCost: cost,
      icmsCreditValue: creditIcms,
      pisCreditValue: creditPis,
      cofinsCreditValue: creditCofins,
      totalCreditValue: totalCredit,
      realCost: rCost,
      pisCofinsCreditBase: regimeVenda === 'Real' ? (cost - creditIcmsForBase) : 0
    };
  }, [purchasePrice, freight, ipi, otherExpenses, icmsPurchaseRate, icmsFreightRate, pisPurchaseRate, cofinsPurchaseRate, regimeCompra, regimeVenda]);

  const { salesPrice, markupMultiplier, deductionsRate } = useMemo(() => {
    const totalBaseCost = realCost;
    let price = 0;
    let percentageDeductions = 0;
    let markup = 0;

    if (totalBaseCost <= 0) return { salesPrice: 0, markupMultiplier: 0, deductionsRate: 0 };

    if (regimeVenda === 'Simples') {
      // PV = custo_real / (1 - (simples + despesas + lucro))
      const totalRates = (simplesNacionalRate + saleExpensesRate + commissionRate + profitMargin) / 100;
      percentageDeductions = totalRates * 100;
      if (totalRates < 1) {
        price = totalBaseCost / (1 - totalRates);
        markup = 1 / (1 - totalRates);
      }
    } else if (regimeVenda === 'Presumido') {
      // PV = custo_real / (1 - (icms + (1 - icms) * (pis + cofins) + irpj + csll + despesas + lucro))
      const i = icmsSaleRate / 100;
      const p = pisSaleRate / 100;
      const c = cofinsSaleRate / 100;
      const r = irpjRate / 100;
      const s = csllRate / 100;
      const d = (saleExpensesRate + commissionRate) / 100;
      const m = profitMargin / 100;
      
      const denominator = 1 - (i + (1 - i) * (p + c) + r + s + d + m);
      percentageDeductions = (1 - denominator) * 100;
      
      if (denominator > 0) {
        price = totalBaseCost / denominator;
        markup = 1 / denominator;
      }
    } else if (regimeVenda === 'Real') {
      // Iterativo conforme nova fórmula fornecida pelo usuário
      const iRate = icmsSaleRate / 100;
      const pRate = pisSaleRate / 100;
      const cRate = cofinsSaleRate / 100;
      const dRate = (saleExpensesRate + commissionRate) / 100;
      const mRate = profitMargin / 100;
      const irRate = irpjRate / 100;
      const csRate = csllRate / 100;
      
      // PV inicial = custo * (1 + despesas + margem)
      let pv = totalBaseCost * (1 + dRate + mRate);
      
      for (let i = 0; i < 100; i++) {
        const ICMS = pv * iRate;
        const PIS = (pv * (1 - iRate)) * pRate;
        const COFINS = (pv * (1 - iRate)) * cRate;
        
        const receita_liquida = pv - ICMS;
        const despesas_valor = pv * dRate;
        const lucro_antes_ir = receita_liquida - totalBaseCost - despesas_valor - PIS - COFINS;
        
        const base_ir = Math.max(lucro_antes_ir, 0);
        const IRPJ = base_ir * irRate;
        const CSLL = base_ir * csRate;
        
        const lucro_liquido = lucro_antes_ir - IRPJ - CSLL;
        const margem_atual = pv > 0 ? lucro_liquido / pv : 0;
        
        const erro = mRate - margem_atual;
        
        const pv_novo = pv * (1 + erro);
        
        if (Math.abs(erro) < 0.0001) {
          pv = pv_novo;
          break;
        }
        pv = pv_novo;
      }
      
      price = pv;
      markup = totalBaseCost > 0 ? price / totalBaseCost : 0;
      percentageDeductions = price > 0 ? ((price - totalBaseCost) / price) * 100 : 0;
    }

    return {
      salesPrice: price,
      markupMultiplier: markup,
      deductionsRate: percentageDeductions
    };
  }, [realCost, icmsSaleRate, pisSaleRate, cofinsSaleRate, saleExpensesRate, commissionRate, profitMargin, regimeVenda, simplesNacionalRate, irpjRate, csllRate]);

  // Derived values for UI display
  const icmsSaleValue = salesPrice * (icmsSaleRate / 100);
  const pisCofinsBase = (regimeVenda === 'Real' || regimeVenda === 'Presumido') 
    ? (salesPrice - icmsSaleValue) 
    : salesPrice;
  
  const detailedLair = useMemo(() => {
    if (regimeVenda !== 'Real') return { revLiq: 0, pisVal: 0, cofinsVal: 0, expensesVal: 0, commissionVal: 0, lair: 0 };
    const revLiq = salesPrice - icmsSaleValue;
    const pisVal = pisCofinsBase * (pisSaleRate / 100);
    const cofinsVal = pisCofinsBase * (cofinsSaleRate / 100);
    const expensesVal = salesPrice * (saleExpensesRate / 100);
    const commissionVal = salesPrice * (commissionRate / 100);
    const lair = Math.max(revLiq - realCost - expensesVal - commissionVal - pisVal - cofinsVal, 0);
    return { revLiq, pisVal, cofinsVal, expensesVal, commissionVal, lair };
  }, [salesPrice, icmsSaleValue, pisCofinsBase, pisSaleRate, cofinsSaleRate, realCost, saleExpensesRate, commissionRate, regimeVenda]);

  const lairValue = detailedLair.lair;

  // Base for IRPJ/CSLL depends on regime
  const irpjCsllBase = regimeVenda === 'Real' ? lairValue : salesPrice;
  const irpjValue = irpjCsllBase * (irpjRate / 100);
  const csllValue = irpjCsllBase * (csllRate / 100);

  const totalDeductionsValue = useMemo(() => {
    if (regimeVenda === 'Simples') {
      return salesPrice * ((simplesNacionalRate + saleExpensesRate + commissionRate) / 100);
    }
    const icms = salesPrice * (icmsSaleRate / 100);
    const pis = pisCofinsBase * (pisSaleRate / 100);
    const cofins = pisCofinsBase * (cofinsSaleRate / 100);
    const irpj = irpjCsllBase * (irpjRate / 100);
    const csll = irpjCsllBase * (csllRate / 100);
    const expenses = salesPrice * (saleExpensesRate / 100);
    const commission = salesPrice * (commissionRate / 100);
    return icms + pis + cofins + irpj + csll + expenses + commission;
  }, [salesPrice, regimeVenda, simplesNacionalRate, saleExpensesRate, commissionRate, icmsSaleRate, pisSaleRate, cofinsSaleRate, irpjRate, csllRate, pisCofinsBase, irpjCsllBase]);

  // Sync saleExpensesValue when salesPrice or saleExpensesRate changes
  useEffect(() => {
    setSaleExpensesValue(salesPrice * (saleExpensesRate / 100));
  }, [salesPrice, saleExpensesRate]);

  // Sync ipi value when purchasePrice or ipiRate changes
  useEffect(() => {
    setIpi(purchasePrice * (ipiRate / 100));
  }, [purchasePrice, ipiRate]);

  // Sync otherExpenses value when purchasePrice or otherExpensesRate changes
  useEffect(() => {
    setOtherExpenses(purchasePrice * (otherExpensesRate / 100));
  }, [purchasePrice, otherExpensesRate]);

  const expensesRate = saleExpensesRate;

  // Suggested Values for Negotiation
  const negotiationResults = useMemo(() => {
    if (targetSalesPrice <= 0) return null;

    // Helper function to calculate sales price for a given purchase price
    const calculateSalesPriceForPurchase = (pPrice: number) => {
      const currentIpi = pPrice * (ipiRate / 100);
      const cost = pPrice + freight + currentIpi + otherExpenses;
      
      let cIcms = 0;
      let cPis = 0;
      let cCofins = 0;

      // ICMS Credit
      if (regimeVenda === 'Real' || regimeVenda === 'Presumido') {
        cIcms = (pPrice * (icmsPurchaseRate / 100)) + (freight * (icmsFreightRate / 100));
      }

      // PIS/COFINS Credit
      if (regimeVenda === 'Real') {
        let creditIcmsForBase = 0;
        if (regimeCompra !== 'Simples') {
          creditIcmsForBase = cIcms;
        }
        const basePisCofins = cost - creditIcmsForBase;
        cPis = basePisCofins * (pisPurchaseRate / 100);
        cCofins = basePisCofins * (cofinsPurchaseRate / 100);
      }
      
      const tCredit = cIcms + cPis + cCofins;
      const rCost = cost - tCredit;

      if (rCost <= 0) return 0;

      let price = 0;
      if (regimeVenda === 'Simples') {
        const totalRates = (simplesNacionalRate + saleExpensesRate + commissionRate + profitMargin) / 100;
        if (totalRates < 1) price = rCost / (1 - totalRates);
      } else if (regimeVenda === 'Presumido') {
        const i = icmsSaleRate / 100;
        const p = pisSaleRate / 100;
        const c = cofinsSaleRate / 100;
        const r = irpjRate / 100;
        const s = csllRate / 100;
        const d = (saleExpensesRate + commissionRate) / 100;
        const m = profitMargin / 100;
        const denominator = 1 - (i + (1 - i) * (p + c) + r + s + d + m);
        if (denominator > 0) price = rCost / denominator;
      } else if (regimeVenda === 'Real') {
        const iRate = icmsSaleRate / 100;
        const pRate = pisSaleRate / 100;
        const cRate = cofinsSaleRate / 100;
        const dRate = (saleExpensesRate + commissionRate) / 100;
        const mRate = profitMargin / 100;
        const irRate = irpjRate / 100;
        const csRate = csllRate / 100;
        let pv = rCost * (1 + dRate + mRate);
        for (let i = 0; i < 100; i++) {
          const ICMS = pv * iRate;
          const PIS = (pv * (1 - iRate)) * pRate;
          const COFINS = (pv * (1 - iRate)) * cRate;
          const receita_liquida = pv - ICMS;
          const despesas_valor = pv * dRate;
          const lucro_antes_ir = receita_liquida - rCost - despesas_valor - PIS - COFINS;
          const base_ir = Math.max(lucro_antes_ir, 0);
          const IRPJ = base_ir * irRate;
          const CSLL = base_ir * csRate;
          const lucro_liquido = lucro_antes_ir - IRPJ - CSLL;
          const margem_atual = pv > 0 ? lucro_liquido / pv : 0;
          const erro = mRate - margem_atual;
          const pv_novo = pv * (1 + erro);
          if (Math.abs(erro) < 0.00001) { pv = pv_novo; break; }
          pv = pv_novo;
        }
        price = pv;
      }
      return price;
    };

    // Case 1: Target Price is LOWER or EQUAL to current calculated price
    // Focus: Negotiation with supplier (Calculate Ideal Purchase Price)
    if (targetSalesPrice <= salesPrice) {
      // Iterative search for the ideal purchase price
      let low = 0;
      let high = targetSalesPrice * 2;
      let idealPurchasePrice = 0;

      for (let i = 0; i < 100; i++) {
        const mid = (low + high) / 2;
        const currentSalesPrice = calculateSalesPriceForPurchase(mid);
        
        if (currentSalesPrice < targetSalesPrice) {
          low = mid;
          idealPurchasePrice = mid;
        } else {
          high = mid;
        }
        
        if (Math.abs(currentSalesPrice - targetSalesPrice) < 0.0001) break;
      }
      
      return {
        type: 'purchase',
        label: 'Preço de Compra Ideal',
        value: idealPurchasePrice
      };
    } 
    
    // Case 2: Target Price is GREATER than current calculated price
    // Focus: Profit Optimization (Calculate Suggested Profit Margin)
    else {
      const totalBaseCost = realCost;
      
      // For profit margin, we can still use a simplified approach or iterative
      // Given the complexity of Lucro Real, let's use iterative for margin too
      let low = 0;
      let high = 100;
      let suggestedMargin = 0;

      const calculateSalesPriceForMargin = (margin: number) => {
        const rCost = realCost;
        let price = 0;
        if (regimeVenda === 'Simples') {
          const totalRates = (simplesNacionalRate + saleExpensesRate + commissionRate + margin) / 100;
          if (totalRates < 1) price = rCost / (1 - totalRates);
        } else if (regimeVenda === 'Presumido') {
          const i = icmsSaleRate / 100;
          const p = pisSaleRate / 100;
          const c = cofinsSaleRate / 100;
          const r = irpjRate / 100;
          const s = csllRate / 100;
          const d = (saleExpensesRate + commissionRate) / 100;
          const m = margin / 100;
          const denominator = 1 - (i + (1 - i) * (p + c) + r + s + d + m);
          if (denominator > 0) price = rCost / denominator;
        } else if (regimeVenda === 'Real') {
          const iRate = icmsSaleRate / 100;
          const pRate = pisSaleRate / 100;
          const cRate = cofinsSaleRate / 100;
          const dRate = (saleExpensesRate + commissionRate) / 100;
          const mRate = margin / 100;
          const irRate = irpjRate / 100;
          const csRate = csllRate / 100;
          let pv = rCost * (1 + dRate + mRate);
          for (let i = 0; i < 50; i++) {
            const ICMS = pv * iRate;
            const PIS = (pv * (1 - iRate)) * pRate;
            const COFINS = (pv * (1 - iRate)) * cRate;
            const receita_liquida = pv - ICMS;
            const despesas_valor = pv * dRate;
            const lucro_antes_ir = receita_liquida - rCost - despesas_valor - PIS - COFINS;
            const base_ir = Math.max(lucro_antes_ir, 0);
            const IRPJ = base_ir * irRate;
            const CSLL = base_ir * csRate;
            const lucro_liquido = lucro_antes_ir - IRPJ - CSLL;
            const margem_atual = pv > 0 ? lucro_liquido / pv : 0;
            const erro = mRate - margem_atual;
            const pv_novo = pv * (1 + erro);
            if (Math.abs(erro) < 0.0001) { pv = pv_novo; break; }
            pv = pv_novo;
          }
          price = pv;
        }
        return price;
      };

      for (let i = 0; i < 50; i++) {
        const mid = (low + high) / 2;
        const currentSalesPrice = calculateSalesPriceForMargin(mid);
        
        if (currentSalesPrice < targetSalesPrice) {
          low = mid;
          suggestedMargin = mid;
        } else {
          high = mid;
        }
        
        if (Math.abs(currentSalesPrice - targetSalesPrice) < 0.01) break;
      }

      return {
        type: 'margin',
        label: 'Margem de Lucro Sugerida',
        value: suggestedMargin
      };
    }
  }, [targetSalesPrice, salesPrice, realCost, freight, otherExpenses, ipi, ipiRate, icmsPurchaseRate, icmsFreightRate, pisPurchaseRate, cofinsPurchaseRate, icmsSaleRate, pisSaleRate, cofinsSaleRate, saleExpensesRate, commissionRate, profitMargin, regimeCompra, regimeVenda, simplesNacionalRate, irpjRate, csllRate]);

  const handleSaleExpensesRateChange = useCallback((newRate: number) => {
    setSaleExpensesRate(newRate);
  }, []);

  const handleSaleExpensesValueChange = useCallback((val: number) => {
    if (salesPrice > 0) {
      setSaleExpensesRate((val / salesPrice) * 100);
    }
  }, [salesPrice]);

  const handleIpiRateChange = useCallback((rate: number) => {
    setIpiRate(rate);
  }, []);

  const handleIpiValueChange = useCallback((val: number) => {
    if (purchasePrice > 0) {
      setIpiRate((val / purchasePrice) * 100);
    } else {
      setIpi(val);
    }
  }, [purchasePrice]);

  const handleOtherExpensesRateChange = useCallback((rate: number) => {
    setOtherExpensesRate(rate);
  }, []);

  const handleOtherExpensesValueChange = useCallback((val: number) => {
    if (purchasePrice > 0) {
      setOtherExpensesRate((val / purchasePrice) * 100);
    } else {
      setOtherExpenses(val);
    }
  }, [purchasePrice]);

  const handleProfitMarginValueChange = useCallback((val: number) => {
    if (salesPrice > 0) {
      let otherRates = 0;
      if (regimeVenda === 'Simples') {
        otherRates = (simplesNacionalRate + saleExpensesRate + commissionRate) / 100;
      } else {
        const i = icmsSaleRate / 100;
        const p = pisSaleRate / 100;
        const c = cofinsSaleRate / 100;
        const r = irpjRate / 100;
        const s = csllRate / 100;
        const d = saleExpensesRate / 100;
        const com = commissionRate / 100;
        otherRates = i + (1 - i) * (p + c) + r + s + d + com;
      }

      const newMarginDecimal = (val * (1 - otherRates)) / (realCost + val);
      setProfitMargin(newMarginDecimal * 100);
    }
  }, [realCost, simplesNacionalRate, saleExpensesRate, commissionRate, icmsSaleRate, pisSaleRate, cofinsSaleRate, irpjRate, csllRate, regimeVenda, salesPrice]);

  const handleReset = useCallback(() => {
    // Não resetar os regimes (Compra e Venda) conforme solicitado
    setPurchasePrice(0);
    setFreight(0);
    setIpi(0);
    setIpiRate(userSettings?.defaultIpi || 0);
    setOtherExpenses(0);
    setOtherExpensesRate(0);
    setIcmsPurchaseRate(userSettings?.defaultIcmsPurchaseRate || 0);
    setIcmsFreightRate(userSettings?.defaultIcmsFreightRate || 0);
    setPisPurchaseRate(userSettings?.defaultPisPurchaseRate || 0);
    setCofinsPurchaseRate(userSettings?.defaultCofinsPurchaseRate || 0);
    setSimplesNacionalRate(userSettings?.defaultSimplesNacionalRate || 0);
    setIcmsSaleRate(userSettings?.defaultIcmsSaleRate || 0);
    setPisSaleRate(userSettings?.defaultPisSaleRate || 1.65);
    setCofinsSaleRate(userSettings?.defaultCofinsSaleRate || 7.6);
    setIrpjRate(userSettings?.defaultIrpjRate || 1.2);
    setCsllRate(userSettings?.defaultCsllRate || 1.08);
    setSaleExpensesRate(userSettings?.defaultSaleExpensesRate || 0);
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
      ...(regimeCompra !== 'Simples' ? [['(+) IPI (R$)', '', formatCurrency(ipi)]] : []),
      ['Outras Despesas (R$)', '', formatCurrency(otherExpenses)],
      ...(regimeVenda === 'Real' || regimeVenda === 'Presumido' ? [
        ['Crédito ICMS Compra (%)', `${icmsPurchaseRate.toFixed(2)}%`, formatCurrency(purchasePrice * (icmsPurchaseRate / 100))],
        ['Crédito ICMS Frete (%)', `${icmsFreightRate.toFixed(2)}%`, formatCurrency(freight * (icmsFreightRate / 100))],
      ] : []),
      ...(regimeVenda === 'Real' ? [
        ['Crédito PIS Compra (%)', `${pisPurchaseRate.toFixed(3)}%`, formatCurrency(pisCreditValue)],
        ['Crédito COFINS Compra (%)', `${cofinsPurchaseRate.toFixed(3)}%`, formatCurrency(cofinsCreditValue)],
      ] : []),
      ['VALOR TOTAL DOS CRÉDITOS (R$)', '', formatCurrency(totalCreditValue)],
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
      ...(regimeVenda === 'Simples' ? [
        ['Simples Nacional (%)', `${simplesNacionalRate.toFixed(2)}%`, formatCurrency(salesPrice * (simplesNacionalRate / 100))]
      ] : [
        ['ICMS sobre Venda (%)', `${icmsSaleRate.toFixed(2)}%`, formatCurrency(salesPrice * (icmsSaleRate / 100))],
        ['PIS sobre Venda (%)', `${pisSaleRate.toFixed(3)}%`, formatCurrency(salesPrice * (pisSaleRate / 100))],
        ['COFINS sobre Venda (%)', `${cofinsSaleRate.toFixed(3)}%`, formatCurrency(salesPrice * (cofinsSaleRate / 100))],
        ['IRPJ (%)', `${irpjRate.toFixed(3)}%`, formatCurrency(salesPrice * (irpjRate / 100))],
        ['CSLL (%)', `${csllRate.toFixed(3)}%`, formatCurrency(salesPrice * (csllRate / 100))],
      ]),
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
      ['(-) Impostos e Comissões', '', `-${formatCurrency(
        regimeVenda === 'Simples'
          ? salesPrice * ((simplesNacionalRate + saleExpensesRate + commissionRate) / 100)
          : salesPrice * ((icmsSaleRate + pisSaleRate + cofinsSaleRate + irpjRate + csllRate + saleExpensesRate + commissionRate) / 100)
      )}`],
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
  }, [salesPrice, realCost, icmsSaleRate, pisSaleRate, cofinsSaleRate, commissionRate, saleExpensesValue, profitMargin, purchasePrice, freight, otherExpenses, totalCreditValue, markupMultiplier, icmsPurchaseRate, icmsFreightRate, pisPurchaseRate, cofinsPurchaseRate, expensesRate, productName, representativeName, regimeCompra, regimeVenda, simplesNacionalRate, irpjRate, csllRate, saleExpensesRate, ipi]);

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
      ...(regimeCompra !== 'Simples' ? [['(+) IPI', '', ipi]] : []),
      ['Outras Despesas', '', otherExpenses],
      ...(regimeVenda === 'Real' || regimeVenda === 'Presumido' ? [
        ['Crédito ICMS Compra (%)', `${icmsPurchaseRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`, purchasePrice * (icmsPurchaseRate / 100)],
        ['Crédito ICMS Frete (%)', `${icmsFreightRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`, freight * (icmsFreightRate / 100)],
      ] : []),
      ...(regimeVenda === 'Real' ? [
        ['Crédito PIS Compra (%)', `${pisPurchaseRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`, pisCreditValue],
        ['Crédito COFINS Compra (%)', `${cofinsPurchaseRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`, cofinsCreditValue],
      ] : []),
      ['Valor Total Créditos', '', totalCreditValue],
      ['CUSTO REAL FINAL', '', realCost],
      [''],
      ['2. FORMAÇÃO DE PREÇO DE VENDA', 'Percentual (%)', 'Valor (R$)'],
      ...(regimeVenda === 'Simples' ? [
        ['Simples Nacional (%)', `${simplesNacionalRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`, salesPrice * (simplesNacionalRate / 100)]
      ] : [
        ['ICMS sobre Venda (%)', `${icmsSaleRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`, salesPrice * (icmsSaleRate / 100)],
        ['PIS sobre Venda (%)', `${pisSaleRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`, salesPrice * (pisSaleRate / 100)],
        ['COFINS sobre Venda (%)', `${cofinsSaleRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`, salesPrice * (cofinsSaleRate / 100)],
        ['IRPJ (%)', `${irpjRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`, salesPrice * (irpjRate / 100)],
        ['CSLL (%)', `${csllRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`, salesPrice * (csllRate / 100)],
      ]),
      ['Outras Despesas (%)', `${expensesRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`, saleExpensesValue],
      ['Comissão de Venda (%)', `${commissionRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`, salesPrice * (commissionRate / 100)],
      ['Margem de Lucro (%)', `${profitMargin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`, salesPrice * (profitMargin / 100)],
      ['Markup Multiplicador', '', markupMultiplier],
      ['PREÇO DE VENDA CALCULADO', '', salesPrice],
      [''],
      ['3. RESUMO FINANCEIRO', '', 'Valor (R$)'],
      ['Faturamento Bruto', '', salesPrice],
      ['Custo Real Mercadoria', '', realCost],
      ['Impostos e Comissões', '', (
        regimeVenda === 'Simples'
          ? salesPrice * ((simplesNacionalRate + saleExpensesRate + commissionRate) / 100)
          : salesPrice * ((icmsSaleRate + pisSaleRate + cofinsSaleRate + irpjRate + csllRate + saleExpensesRate + commissionRate) / 100)
      )],
      ['LUCRO LÍQUIDO', '', (salesPrice * (profitMargin / 100))],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // Formatting currency (basic) - percentages are now strings for reliability
    // Column C (index 2) for currency
    const currencyRows = [];
    for(let i = 0; i < data.length; i++) {
      if (typeof data[i][2] === 'number') {
        currencyRows.push(i + 1);
      }
    }
    
    currencyRows.forEach(row => {
      const cell = ws[XLSX.utils.encode_cell({ r: row - 1, c: 2 })];
      if (cell) cell.z = '"R$ "#,##0.00';
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Análise");
    XLSX.writeFile(wb, `analise-${productName || 'calculo'}.xlsx`);
  }, [productName, representativeName, purchasePrice, freight, otherExpenses, icmsPurchaseRate, icmsFreightRate, pisPurchaseRate, cofinsPurchaseRate, totalCreditValue, realCost, icmsSaleRate, pisSaleRate, cofinsSaleRate, expensesRate, commissionRate, profitMargin, markupMultiplier, salesPrice, saleExpensesValue, regimeCompra, regimeVenda, simplesNacionalRate, irpjRate, csllRate, saleExpensesRate, ipi]);

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
        let items = data.items || manualData;
        
        // IDs of new items to ensure are present
        const requiredIds = ['assinatura-pro', 'regime-fornecedor', 'config-aliquotas', 'glossario-campos'];
        let needsUpdate = false;
        
        requiredIds.forEach(id => {
          if (!items.some((item: any) => item.id === id)) {
            const newItem = manualData.find(i => i.id === id);
            if (newItem) {
              items = [...items, newItem];
              needsUpdate = true;
            }
          }
        });

        if (needsUpdate && isAdmin) {
          updateDoc(manualDocRef, { items }).catch(err => console.error("Error auto-updating manual:", err));
        }

        setManualConfig({
          introTitle: data.introTitle || "Bem-vindo!",
          introContent: data.introContent || "Este guia rápido ajudará você a entender todas as ferramentas disponíveis no aplicativo para otimizar a precificação dos seus produtos.",
          items,
          contactTitle: data.contactTitle || "Dúvidas ou Sugestões?",
          contactContent: data.contactContent || "Estamos sempre buscando melhorar! Se você tiver alguma pergunta sobre os cálculos ou sugestões de novas funcionalidades, entre em contato conosco.",
          supportEmail: data.supportEmail || "suporte@nivorconsultoria.com.br"
        });
      } else if (isAdmin) {
        // Seed initial data if it doesn't exist and user is admin
        setDoc(manualDocRef, { 
          introTitle: "Bem-vindo!",
          introContent: "Este guia rápido ajudará você a entender todas as ferramentas disponíveis no aplicativo para otimizar a precificação dos seus produtos.",
          items: manualData,
          contactTitle: "Dúvidas ou Sugestões?",
          contactContent: "Estamos sempre buscando melhorar! Se você tiver alguma pergunta sobre os cálculos ou sugestões de novas funcionalidades, entre em contato conosco.",
          supportEmail: "suporte@nivorconsultoria.com.br",
          updatedAt: Timestamp.now() 
        }).catch(err => console.error("Error seeding manual:", err));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'config/manual');
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

      if (!response.ok) {
        const text = await response.text();
        console.error('Server Error Response:', text);
        
        // If the response is HTML, it's likely a 404 or 500 page from Vercel/Cloud Run
        if (text.includes('<!DOCTYPE html>') || text.includes('<html') || text.includes('The page cannot be found') || text.includes('Deployment Error')) {
          throw new Error('Erro de Servidor (Vercel/Cloud Run): O backend não está respondendo corretamente. Verifique se o deployment foi concluído com sucesso.');
        }
        
        try {
          const errorData = JSON.parse(text);
          throw new Error(errorData.error || 'Erro ao criar preferência de pagamento');
        } catch (e) {
          // Show the first 100 characters of the response to help debug
          const snippet = text.substring(0, 100);
          throw new Error(`Erro no servidor: ${snippet}... (Verifique o deployment no Vercel)`);
        }
      }

      const data = await response.json();
      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        const errorMsg = data.error || 'Erro ao criar preferência de pagamento';
        if (errorMsg.includes('UNAUTHORIZED') || errorMsg.includes('Settings')) {
          showToast("Erro de configuração: Verifique a chave de acesso do Mercado Pago no menu Secrets.", "error");
        } else {
          throw new Error(errorMsg);
        }
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
            regimeCompra,
            baseCost: purchasePrice,
            ipi,
            ipiRate,
            icmsPurchaseRate,
            icmsFreightRate,
            pisPurchaseRate,
            cofinsPurchaseRate,
            regimeVenda,
            simplesNacionalRate,
            icmsSaleRate,
            pisSaleRate,
            cofinsSaleRate,
            irpjRate,
            csllRate,
            saleExpensesRate,
            commissionRate,
            profitMargin,
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
        regimeCompra,
        purchasePrice,
        freight,
        ipi,
        ipiRate,
        otherExpenses,
        otherExpensesRate,
        icmsPurchaseRate,
        icmsFreightRate,
        pisPurchaseRate,
        cofinsPurchaseRate,
        regimeVenda,
        simplesNacionalRate,
        icmsSaleRate,
        pisSaleRate,
        cofinsSaleRate,
        irpjRate,
        csllRate,
        saleExpensesRate,
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
  }, [user, productName, selectedProductId, products, representativeName, purchasePrice, freight, otherExpenses, otherExpensesRate, icmsPurchaseRate, icmsFreightRate, pisPurchaseRate, cofinsPurchaseRate, icmsSaleRate, saleExpensesRate, saleExpensesValue, commissionRate, profitMargin, salesPrice, realCost, totalCost, totalCreditValue, regimeCompra, regimeVenda, simplesNacionalRate, pisSaleRate, cofinsSaleRate, irpjRate, csllRate, ipi, handleReset]);

  const filteredCalculations = useMemo(() => {
    if (!historySearch) return savedCalculations;
    const search = historySearch.toLowerCase();
    return savedCalculations.filter(calc => 
      calc.productName?.toLowerCase().includes(search) || 
      calc.representativeName?.toLowerCase().includes(search)
    );
  }, [savedCalculations, historySearch]);

  const handleLoadCalculation = useCallback((calc: any) => {
    setProductName(calc.productName || '');
    setRepresentativeName(calc.representativeName || '');
    setRegimeCompra(calc.regimeCompra || 'Real');
    setPurchasePrice(calc.purchasePrice || 0);
    setFreight(calc.freight || 0);
    setIpi(calc.ipi || 0);
    setIpiRate(calc.ipiRate || (calc.purchasePrice > 0 ? (calc.ipi / calc.purchasePrice) * 100 : 0));
    setOtherExpenses(calc.otherExpenses || 0);
    setOtherExpensesRate(calc.otherExpensesRate || (calc.purchasePrice > 0 ? (calc.otherExpenses / calc.purchasePrice) * 100 : 0));
    setIcmsPurchaseRate(calc.icmsPurchaseRate || 0);
    setIcmsFreightRate(calc.icmsFreightRate || 0);
    setPisPurchaseRate(calc.pisPurchaseRate || 0);
    setCofinsPurchaseRate(calc.cofinsPurchaseRate || 0);
    setRegimeVenda(calc.regimeVenda || 'Real');
    setSimplesNacionalRate(calc.simplesNacionalRate || 0);
    setIcmsSaleRate(calc.icmsSaleRate || 0);
    setPisSaleRate(calc.pisSaleRate || 1.65);
    setCofinsSaleRate(calc.cofinsSaleRate || 7.6);
    setIrpjRate(calc.irpjRate || 1.2);
    setCsllRate(calc.csllRate || 1.08);
    setSaleExpensesRate(calc.saleExpensesRate || 0);
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
          regimeCompra: productData.regimeCompra || 'Simples',
          baseCost: productData.baseCost || 0,
          ipi: productData.ipi || 0,
          ipiRate: productData.ipiRate || 0,
          icmsPurchaseRate: productData.icmsPurchaseRate || 0,
          icmsFreightRate: productData.icmsFreightRate || 0,
          pisPurchaseRate: productData.pisPurchaseRate || 0,
          cofinsPurchaseRate: productData.cofinsPurchaseRate || 0,
          regimeVenda: productData.regimeVenda || 'Simples',
          simplesNacionalRate: productData.simplesNacionalRate || 0,
          icmsSaleRate: productData.icmsSaleRate || 0,
          pisSaleRate: productData.pisSaleRate || 1.65,
          cofinsSaleRate: productData.cofinsSaleRate || 7.6,
          irpjRate: productData.irpjRate || 1.2,
          csllRate: productData.csllRate || 1.08,
          saleExpensesRate: productData.saleExpensesRate || 0,
          commissionRate: productData.commissionRate || 0,
          profitMargin: productData.profitMargin || 0,
          updatedAt: Timestamp.now()
        });
      } else {
        // Create
        await addDoc(collection(db, 'products'), {
          userId: user.uid,
          name: productData.name.trim(),
          supplierName: (productData.supplierName || '').trim(),
          regimeCompra: productData.regimeCompra || 'Simples',
          baseCost: productData.baseCost || 0,
          ipi: productData.ipi || 0,
          ipiRate: productData.ipiRate || 0,
          icmsPurchaseRate: productData.icmsPurchaseRate || 0,
          icmsFreightRate: productData.icmsFreightRate || 0,
          pisPurchaseRate: productData.pisPurchaseRate || 0,
          cofinsPurchaseRate: productData.cofinsPurchaseRate || 0,
          regimeVenda: productData.regimeVenda || 'Simples',
          simplesNacionalRate: productData.simplesNacionalRate || 0,
          icmsSaleRate: productData.icmsSaleRate || 0,
          pisSaleRate: productData.pisSaleRate || 1.65,
          cofinsSaleRate: productData.cofinsSaleRate || 7.6,
          irpjRate: productData.irpjRate || 1.2,
          csllRate: productData.csllRate || 1.08,
          saleExpensesRate: productData.saleExpensesRate || 0,
          commissionRate: productData.commissionRate || 0,
          profitMargin: productData.profitMargin || 0,
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
    if (product.pisPurchaseRate !== undefined) setPisPurchaseRate(product.pisPurchaseRate);
    if (product.cofinsPurchaseRate !== undefined) setCofinsPurchaseRate(product.cofinsPurchaseRate);
    if (product.icmsSaleRate !== undefined) setIcmsSaleRate(product.icmsSaleRate);
    if (product.pisSaleRate !== undefined) setPisSaleRate(product.pisSaleRate);
    if (product.cofinsSaleRate !== undefined) setCofinsSaleRate(product.cofinsSaleRate);
    if (product.saleExpensesRate !== undefined) setSaleExpensesRate(product.saleExpensesRate);
    if (product.commissionRate !== undefined) setCommissionRate(product.commissionRate);
    if (product.profitMargin !== undefined) setProfitMargin(product.profitMargin);

    setSelectedProductId(product.id);
    setIsProductsModalOpen(false);
  }, []);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-brand-bg p-4 md:p-8 flex items-center justify-center font-sans">
        <div className="w-full max-w-5xl bg-brand-card rounded-2xl shadow-xl overflow-hidden border border-brand-border">
          
          {/* Header */}
          <div className="bg-brand-black text-white p-4 md:p-6 flex flex-col gap-6">
            {/* Top Row: Title and User */}
            <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-4 sm:gap-0">
              <div className="flex flex-col items-center sm:items-start">
                <h1 className="text-xl md:text-2xl font-black tracking-tighter text-white uppercase italic">
                  NIVOR <span className="text-brand-primary">CALCULADORA</span>
                </h1>
                <div className="h-1 w-12 bg-brand-primary rounded-full mt-1 hidden sm:block"></div>
              </div>
              
              <div className="flex items-center gap-3">
                {user && (
                  <button 
                    onClick={() => setIsManualModalOpen(true)}
                    className="flex items-center gap-1.5 bg-brand-muted hover:bg-brand-muted/80 text-white px-3 py-2 rounded-lg text-[11px] font-black transition-all active:scale-95 border border-brand-border"
                    title="Manual do Usuário"
                  >
                    <HelpCircle className="w-4 h-4 text-brand-primary" />
                    MANUAL
                  </button>
                )}

                {user ? (
                  <div className="flex items-center gap-2 bg-brand-black px-3 py-1.5 rounded-full border border-brand-border">
                    {isPro ? (
                      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-brand-primary rounded-md border border-brand-primary">
                        <Package className="w-3 h-3 text-brand-black" />
                        <span className="text-[10px] font-black text-brand-black uppercase tracking-tighter">PRO</span>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setIsUpgradeModalOpen(true)}
                        className="flex items-center gap-1.5 bg-brand-primary hover:bg-brand-primary-hover text-brand-black px-2.5 py-1 rounded-md text-[11px] font-black transition-all active:scale-95 animate-pulse"
                      >
                        <Package className="w-3 h-3" />
                        SEJA PRO
                      </button>
                    )}

                  {isAdmin && (
                    <button 
                      onClick={() => setIsAdminMenuOpen(true)}
                      className="flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white px-2.5 py-1 rounded-md text-[11px] font-black transition-all active:scale-95 border border-red-700 shadow-lg shadow-red-900/20"
                      title="Painel Administrativo"
                    >
                      <Settings className="w-3 h-3 text-white" />
                      ADMIN
                    </button>
                  )}

                  <div className="w-[1px] h-4 bg-brand-border mx-1"></div>
                  <div className="flex items-center gap-2">
                    <img 
                      src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'User'}`} 
                      alt="User" 
                      className="w-6 h-6 rounded-full border border-brand-border"
                      referrerPolicy="no-referrer"
                    />
                    <span className="text-xs font-medium text-slate-300 hidden sm:inline">{user.displayName?.split(' ')[0]}</span>
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="p-1 text-slate-500 hover:text-red-400 transition-colors ml-1"
                    title="Sair"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleLogin}
                  className="flex items-center gap-2 bg-brand-muted hover:bg-brand-muted/80 text-white px-4 py-2 rounded-lg text-[15px] font-medium transition-colors border border-brand-border active:scale-95"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Entrar</span>
                </button>
              )}
            </div>
          </div>

          {user ? (
            <>
              {/* Bottom Row: Navigation Actions */}
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 justify-center sm:justify-end w-full px-4 md:px-6 py-4 bg-brand-muted/10 border-b border-brand-border">
              <button 
                onClick={() => requirePro(() => setIsDashboardOpen(!isDashboardOpen))}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 md:py-2 rounded-lg text-[11px] md:text-sm font-bold transition-all border active:scale-95 w-full sm:w-auto whitespace-nowrap ${isDashboardOpen ? 'bg-brand-primary border-brand-primary text-brand-black shadow-lg shadow-brand-primary/20' : isPro ? 'bg-brand-muted border-brand-border text-white hover:bg-brand-muted/80' : 'bg-brand-muted/50 border-brand-border/30 text-slate-500 cursor-not-allowed hover:bg-brand-muted/60 opacity-80'}`}
                title={isDashboardOpen ? "Voltar para Calculadora" : "Ver Dashboard"}
              >
                {isDashboardOpen ? <Calculator className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <LayoutDashboard className="w-3.5 h-3.5 md:w-4 md:h-4 text-brand-primary" />}
                <span>{isDashboardOpen ? "Calculadora" : "Dashboard"}</span>
                {!isPro && <Lock className="w-3 h-3 ml-1 text-slate-500" />}
              </button>

              <button 
                onClick={() => requirePro(() => setIsSettingsModalOpen(true))}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 md:py-2 rounded-lg text-[11px] md:text-sm font-bold transition-colors border active:scale-95 w-full sm:w-auto whitespace-nowrap ${isPro ? 'bg-brand-muted border-brand-border text-white hover:bg-brand-muted/80' : 'bg-brand-muted/50 border-brand-border/30 text-slate-500 cursor-not-allowed hover:bg-brand-muted/60 opacity-80'}`}
                title="Configurações Padrão"
              >
                <Settings className="w-3.5 h-3.5 md:w-4 md:h-4 text-brand-primary" />
                <span>Config</span>
                {!isPro && <Lock className="w-3 h-3 ml-1 text-slate-500" />}
              </button>

              <button 
                onClick={() => requirePro(() => setIsProductsModalOpen(true))}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 md:py-2 rounded-lg text-[11px] md:text-sm font-bold transition-colors border active:scale-95 w-full sm:w-auto whitespace-nowrap ${isPro ? 'bg-brand-muted border-brand-border text-white hover:bg-brand-muted/80' : 'bg-brand-muted/50 border-brand-border/30 text-slate-500 cursor-not-allowed hover:bg-brand-muted/60 opacity-80'}`}
                title="Gerenciar Produtos"
              >
                <Package className="w-3.5 h-3.5 md:w-4 md:h-4 text-brand-primary" />
                <span>Produtos</span>
                {!isPro && <Lock className="w-3 h-3 ml-1 text-slate-500" />}
              </button>

              <button 
                onClick={() => requirePro(() => setIsHistoryModalOpen(true))}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 md:py-2 rounded-lg text-[11px] md:text-sm font-bold transition-colors border active:scale-95 w-full sm:w-auto whitespace-nowrap ${isPro ? 'bg-brand-muted border-brand-border text-white hover:bg-brand-muted/80' : 'bg-brand-muted/50 border-brand-border/30 text-slate-500 cursor-not-allowed hover:bg-brand-muted/60 opacity-80'}`}
                title="Ver Histórico"
              >
                <History className="w-3.5 h-3.5 md:w-4 md:h-4 text-brand-primary" />
                <span>Histórico</span>
                {!isPro && <Lock className="w-3 h-3 ml-1 text-slate-500" />}
              </button>

              <button 
                onClick={handleReset}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 md:gap-2 bg-brand-muted hover:bg-brand-muted/80 text-white px-2.5 md:px-3 py-2 md:py-2 rounded-lg text-[11px] md:text-sm font-bold transition-colors border border-brand-border active:scale-95 w-full sm:w-auto whitespace-nowrap"
                title="Reset valores"
              >
                <RotateCcw className="w-3.5 h-3.5 md:w-4 md:h-4 text-brand-primary" />
                <span>Reset</span>
              </button>

              <button 
                onClick={() => setIsFloatingCalculatorOpen(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 md:gap-2 bg-amber-600 hover:bg-amber-500 text-white px-2.5 md:px-3 py-2 md:py-2 rounded-lg text-[11px] md:text-sm font-bold transition-all shadow-md hover:shadow-amber-500/20 active:scale-95 border border-amber-500 w-full sm:w-auto whitespace-nowrap"
                title="Abrir Calculadora"
              >
                <Calculator className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span>CALC</span>
              </button>

              <button 
                onClick={() => requirePro(handleExportPDF)}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 md:py-2 rounded-lg text-[10px] md:text-xs font-bold transition-colors border active:scale-95 w-full sm:w-auto whitespace-nowrap ${isPro ? 'bg-brand-muted border-brand-border text-white hover:bg-brand-muted/80' : 'bg-brand-muted/50 border-brand-border/30 text-slate-500 cursor-not-allowed hover:bg-brand-muted/60 opacity-80'}`}
                title="Exportar PDF"
              >
                <Download className="w-3.5 h-3.5 md:w-4 md:h-4 text-brand-primary" />
                <span>PDF</span>
                {!isPro && <Lock className="w-3 h-3 ml-1 text-slate-500" />}
              </button>

              <button 
                onClick={() => requirePro(handleExportExcel)}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 md:py-2 rounded-lg text-[10px] md:text-xs font-bold transition-colors border active:scale-95 w-full sm:w-auto whitespace-nowrap ${isPro ? 'bg-brand-muted border-brand-border text-white hover:bg-brand-muted/80' : 'bg-brand-muted/50 border-brand-border/30 text-slate-500 cursor-not-allowed hover:bg-brand-muted/60 opacity-80'}`}
                title="Exportar Excel"
              >
                <Download className="w-3.5 h-3.5 md:w-4 md:h-4 text-brand-primary" />
                <span>EXCEL</span>
                {!isPro && <Lock className="w-3 h-3 ml-1 text-slate-500" />}
              </button>
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
              {/* LEFT COLUMN: COMPRA (Refined Dark Mode) */}
              <div className="p-6 bg-brand-muted/30 border-r border-brand-border relative">
            {/* Vertical Label Strip */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary rounded-tl-none"></div>

            <div className="pl-4 space-y-6">
              <div className="space-y-4">
                <h2 className="text-slate-100 font-bold text-lg border-b border-brand-border pb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    Custos de Aquisição
                  </div>
                  {isPro ? (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 bg-brand-muted hover:bg-brand-muted/80 text-slate-200 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all border border-brand-border active:scale-95"
                      title="Importar XML da NFe"
                    >
                      <FileUp className="w-3 h-3" />
                      IMPORTAR XML
                    </button>
                  ) : (
                    <button
                      onClick={() => requirePro(() => fileInputRef.current?.click())}
                      className="flex items-center gap-1.5 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary px-2.5 py-1 rounded-md text-[11px] font-bold transition-all border border-brand-primary/30 active:scale-95 group"
                      title="Funcionalidade PRO"
                    >
                      <FileUp className="w-3 h-3" />
                      IMPORTAR XML
                      <span className="ml-1 bg-brand-primary text-brand-black px-1 rounded-[4px] text-[8px]">PRO</span>
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

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Regime Tributário do Fornecedor</label>
                  <div className="flex gap-2 p-1 bg-brand-black rounded-xl border border-brand-border">
                    {(['Simples', 'Presumido', 'Real'] as const).map((regime) => (
                      <button
                        key={regime}
                        onClick={() => setRegimeCompra(regime)}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                          regimeCompra === regime 
                            ? 'bg-brand-primary text-brand-black' 
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {regime}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wide text-slate-300 px-1">Nome do Produto</label>
                    <div className="relative flex items-center bg-brand-black border border-brand-border rounded-lg shadow-sm focus-within:ring-2 focus-within:ring-brand-primary focus-within:border-brand-primary">
                      <input 
                        type="text"
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        placeholder="Ex: Smartphone Samsung"
                        className="w-full py-1.5 sm:py-2 px-2 sm:px-3 outline-none bg-transparent text-slate-100 font-medium text-[11px] sm:text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wide text-slate-300 px-1">Fornecedor / Representante</label>
                    <div className="relative flex items-center bg-brand-black border border-brand-border rounded-lg shadow-sm focus-within:ring-2 focus-within:ring-brand-primary focus-within:border-brand-primary">
                      <input 
                        type="text"
                        value={representativeName}
                        onChange={(e) => setRepresentativeName(e.target.value)}
                        placeholder="Ex: Distribuidora XYZ"
                        className="w-full py-1.5 sm:py-2 px-2 sm:px-3 outline-none bg-transparent text-slate-100 font-medium text-[11px] sm:text-xs"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <NumberInput 
                    label="(+) Preço Compra" 
                    value={purchasePrice} 
                    onChange={setPurchasePrice} 
                  />
                  <NumberInput 
                    label="(+) Valor Frete" 
                    value={freight} 
                    onChange={setFreight} 
                  />
                  {regimeCompra !== 'Simples' && (
                    <PercentInputRow 
                      label="(+) IPI (%)" 
                      percent={ipiRate} 
                      onChange={handleIpiRateChange} 
                      baseValue={purchasePrice}
                      onValueChange={handleIpiValueChange}
                      className="sm:col-span-2"
                    />
                  )}
                  <div className="sm:col-span-2">
                    <PercentInputRow 
                      label="(+) Outras Despesas" 
                      percent={otherExpensesRate} 
                      onChange={handleOtherExpensesRateChange} 
                      baseValue={purchasePrice}
                      onValueChange={handleOtherExpensesValueChange}
                    />
                  </div>
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

              {((regimeVenda === 'Real' || regimeVenda === 'Presumido')) && (
                <div className="space-y-4 pt-4 border-t border-dashed border-brand-border">
                  <h2 className="text-slate-100 font-bold text-lg border-b border-brand-border pb-2 flex items-center gap-2">
                    <Percent className="w-5 h-5 text-brand-primary" />
                    Créditos de Impostos
                  </h2>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {regimeVenda === 'Real' && (
                      <div className="sm:col-span-2 bg-brand-black/40 rounded-xl border border-brand-border/50 overflow-hidden mb-2">
                        <button 
                          onClick={() => setShowPurchaseMemo(!showPurchaseMemo)}
                          className="w-full flex items-center justify-between p-3 hover:bg-brand-black/60 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-brand-primary" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              Memória de Cálculo: Créditos
                            </span>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${showPurchaseMemo ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence initial={false}>
                          {showPurchaseMemo && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: "easeInOut" }}
                            >
                              <div className="px-3 pb-3 space-y-2 border-t border-brand-border/30 pt-3">
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pb-1 mb-2">
                                  Detalhamento dos Créditos ({regimeCompra === 'Simples' ? 'Fornecedor Simples' : 'Fornecedor Fiscal'})
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                                  <span className="text-slate-400">ICMS (Produto + Frete):</span>
                                  <span className="text-right text-slate-200 font-mono">{formatCurrency(icmsCreditValue)}</span>
                                  
                                  <span className="text-slate-500 text-[10px] leading-tight pr-4">BASE (Produto + Frete + IPI + Outras Despesas) - ICMS Destacado:</span>
                                  <span className="text-right text-slate-400 font-mono text-[10px] italic">{formatCurrency(pisCofinsCreditBase)}</span>
                                  
                                  <span className="text-slate-400">PIS (Base: {formatCurrency(pisCofinsCreditBase)}):</span>
                                  <span className="text-right text-slate-200 font-mono">{formatCurrency(pisCreditValue)}</span>
                                  
                                  <span className="text-slate-400">COFINS (Base: {formatCurrency(pisCofinsCreditBase)}):</span>
                                  <span className="text-right text-slate-200 font-mono">{formatCurrency(cofinsCreditValue)}</span>
                                  
                                  <div className="col-span-2 border-t border-brand-border/30 mt-1 pt-1 flex justify-between font-bold text-brand-primary">
                                    <span>TOTAL CRÉDITOS:</span>
                                    <span>{formatCurrency(totalCreditValue)}</span>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {/* ICMS inputs always available if buyer is not Simples */}
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

                    {/* PIS/COFINS inputs only if buyer is Real */}
                    {regimeVenda === 'Real' && (
                      <>
                        <PercentInputRow 
                          label="(-) PIS Compra (%)" 
                          percent={pisPurchaseRate} 
                          onChange={setPisPurchaseRate} 
                          baseValue={pisCofinsCreditBase}
                        />
                        <PercentInputRow 
                          label="(-) COFINS Compra (%)" 
                          percent={cofinsPurchaseRate} 
                          onChange={setCofinsPurchaseRate} 
                          baseValue={pisCofinsCreditBase}
                        />
                      </>
                    )}
                  </div>

                  <div className="bg-brand-black p-3 rounded-lg border border-brand-border flex justify-between items-center text-sm text-slate-200">
                    <span>Total Créditos Impostos:</span>
                    <span className="font-mono font-bold text-brand-primary">{formatCurrency(totalCreditValue)}</span>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-dashed border-brand-border">
                <div className="bg-brand-black text-white p-4 rounded-xl shadow-lg transform transition-all hover:scale-[1.02] border border-brand-border">
                  <label className="block text-[10px] font-bold uppercase tracking-wider opacity-80 mb-1">(=) Custo Real do Produto</label>
                  <div className="text-3xl font-mono font-bold tracking-tight text-brand-primary">
                    {formatCurrency(realCost)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: VENDA (Refined Dark Mode) */}
          <div className="p-6 bg-brand-card relative">
            {/* Vertical Label Strip */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary/20 lg:hidden"></div> {/* Mobile divider */}
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-brand-primary"></div>

            <div className="pr-0 lg:pr-8 space-y-6">
              <div className="space-y-4">
                <h2 className="text-slate-100 font-bold text-lg border-b border-brand-border pb-2 flex items-center gap-2">
                  Preço Venda (Markup)
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {regimeVenda === 'Simples' ? (
                    <>
                      <PercentInputRow 
                        label="Alíquota Simples (%)" 
                        percent={simplesNacionalRate} 
                        onChange={setSimplesNacionalRate} 
                        baseValue={salesPrice}
                        className="sm:col-span-2"
                      />
                      <PercentInputRow 
                        label="Outras Despesas (%)" 
                        percent={expensesRate} 
                        onChange={handleSaleExpensesRateChange} 
                        baseValue={salesPrice}
                        onValueChange={handleSaleExpensesValueChange}
                        className="sm:col-span-2"
                      />
                      <PercentInputRow 
                        label="Comissão Venda (%)" 
                        percent={commissionRate} 
                        onChange={setCommissionRate} 
                        baseValue={salesPrice}
                        className="sm:col-span-2"
                      />
                      <PercentInputRow 
                        label="Margem de Lucro (%)" 
                        percent={profitMargin} 
                        onChange={setProfitMargin} 
                        baseValue={salesPrice}
                        onValueChange={handleProfitMarginValueChange}
                        className="sm:col-span-2"
                      />
                    </>
                  ) : (
                    <>
                      <PercentInputRow 
                        label="ICMS Venda (%)" 
                        percent={icmsSaleRate} 
                        onChange={setIcmsSaleRate} 
                        baseValue={salesPrice}
                        className="sm:col-span-2"
                      />
                      <PercentInputRow 
                        label="Outras Despesas (%)" 
                        percent={expensesRate} 
                        onChange={handleSaleExpensesRateChange} 
                        baseValue={salesPrice}
                        onValueChange={handleSaleExpensesValueChange}
                        className="sm:col-span-2"
                      />
                      <PercentInputRow 
                        label="PIS Venda (%)" 
                        percent={pisSaleRate} 
                        onChange={setPisSaleRate} 
                        baseValue={pisCofinsBase}
                        className="sm:col-span-2"
                      />
                      <PercentInputRow 
                        label="COFINS Venda (%)" 
                        percent={cofinsSaleRate} 
                        onChange={setCofinsSaleRate} 
                        baseValue={pisCofinsBase}
                        className="sm:col-span-2"
                      />
                      <PercentInputRow 
                        label="Comissão Venda (%)" 
                        percent={commissionRate} 
                        onChange={setCommissionRate} 
                        baseValue={salesPrice}
                        className="sm:col-span-2"
                      />

                      {regimeVenda === 'Real' && (
                        <div className="sm:col-span-2 bg-brand-black/40 rounded-xl border border-brand-border/50 overflow-hidden mb-2">
                          <button 
                            onClick={() => setShowSalesMemo(!showSalesMemo)}
                            className="w-full flex items-center justify-between p-3 hover:bg-brand-black/60 transition-colors text-left"
                          >
                            <div className="flex items-center gap-2">
                              <BookOpen className="w-4 h-4 text-brand-primary" />
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Memória de Cálculo: LAIR
                              </span>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${showSalesMemo ? 'rotate-180' : ''}`} />
                          </button>

                          <AnimatePresence initial={false}>
                            {showSalesMemo && (
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: "easeInOut" }}
                              >
                                <div className="px-3 pb-3 space-y-2 border-t border-brand-border/30 pt-3">
                                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pb-1 mb-2">
                                    Detalhamento da Base IRPJ/CSLL (Lucro Real)
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                                    <span className="text-slate-400">Receita Líquida (PV - ICMS):</span>
                                    <span className="text-right text-slate-200 font-mono">{formatCurrency(detailedLair.revLiq)}</span>
                                    
                                    <span className="text-slate-500 text-[10px] leading-tight pr-4">Lucro Antes do IR = (Rec. Liq - PIS/COFINS - Custo - Comis. - Desp.):</span>
                                    <span className="text-right text-slate-400 font-mono text-[10px] italic">{formatCurrency(lairValue)}</span>
                                    
                                    <span className="text-slate-400">(-) PIS Venda:</span>
                                    <span className="text-right text-slate-200 font-mono">{formatCurrency(detailedLair.pisVal)}</span>
                                    
                                    <span className="text-slate-400">(-) COFINS Venda:</span>
                                    <span className="text-right text-slate-200 font-mono">{formatCurrency(detailedLair.cofinsVal)}</span>

                                    <span className="text-slate-400">(-) Custo Real:</span>
                                    <span className="text-right text-slate-200 font-mono">{formatCurrency(realCost)}</span>

                                    <span className="text-slate-400">(-) Comissão Venda:</span>
                                    <span className="text-right text-slate-200 font-mono">{formatCurrency(detailedLair.commissionVal)}</span>

                                    <span className="text-slate-400">(-) Outras Despesas:</span>
                                    <span className="text-right text-slate-200 font-mono">{formatCurrency(detailedLair.expensesVal)}</span>
                                    
                                    <div className="col-span-2 border-t border-brand-border/30 mt-1 pt-1 flex justify-between font-bold text-brand-primary">
                                      <span>BASE IRPJ / CSLL:</span>
                                      <span>{formatCurrency(lairValue)}</span>
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      <div className="sm:col-span-2 space-y-1">
                        <PercentInputRow 
                          label="IRPJ (%)" 
                          percent={irpjRate} 
                          onChange={setIrpjRate} 
                          baseValue={irpjCsllBase}
                        />
                        {salesPrice > 0 && irpjValue > 0 && (
                          <div className="flex justify-end px-1">
                            <span className="text-[9px] text-slate-100 uppercase tracking-tighter bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                              Impacto Real: {((irpjValue / salesPrice) * 100).toFixed(2)}% sobre a venda
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="sm:col-span-2 space-y-1">
                        <PercentInputRow 
                          label="CSLL (%)" 
                          percent={csllRate} 
                          onChange={setCsllRate} 
                          baseValue={irpjCsllBase}
                        />
                        {salesPrice > 0 && csllValue > 0 && (
                          <div className="flex justify-end px-1">
                            <span className="text-[9px] text-slate-100 uppercase tracking-tighter bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                              Impacto Real: {((csllValue / salesPrice) * 100).toFixed(2)}% sobre a venda
                            </span>
                          </div>
                        )}
                      </div>
                      <PercentInputRow 
                        label="Margem de Lucro (%)" 
                        percent={profitMargin} 
                        onChange={setProfitMargin} 
                        baseValue={salesPrice}
                        onValueChange={handleProfitMarginValueChange}
                        className="sm:col-span-2"
                      />
                    </>
                  )}
                </div>

                <div className="bg-brand-primary/10 p-4 rounded-lg border border-brand-primary/20 space-y-2">
                  <div className="flex justify-between items-center text-sm text-slate-100">
                    <span>Soma das Deduções:</span>
                    <span className="font-mono font-bold text-brand-primary">
                      {formatCurrency(totalDeductionsValue)} ({((totalDeductionsValue / (salesPrice || 1)) * 100).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-brand-primary/20 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${deductionsRate > 100 ? 'bg-red-500' : 'bg-brand-primary'}`}
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
                  <div className="bg-brand-primary text-brand-black p-6 rounded-xl shadow-lg transform transition-all hover:scale-[1.02] border border-brand-primary">
                    <div className="flex justify-between items-end mb-2">
                      <label className="block text-[10px] font-bold uppercase tracking-wider opacity-90 text-brand-black">Valor Total de Venda</label>
                      <span className="text-xs bg-brand-primary/80 px-2 py-1 rounded text-brand-black font-mono border border-brand-primary">
                        Markup: {markupMultiplier.toFixed(4)}x
                      </span>
                    </div>
                    <div className="text-4xl font-mono font-bold tracking-tight text-brand-black">
                      {deductionsRate >= 100 ? "Erro" : formatCurrency(salesPrice)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary Table */}
              <div className="bg-brand-black rounded-lg border border-brand-border p-4 shadow-sm mb-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Resumo da Operação</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-brand-border pb-1">
                    <span className="text-slate-400">Preço Venda</span>
                    <span className="font-mono font-bold text-slate-100">{formatCurrency(salesPrice)}</span>
                  </div>
                  <div className="flex justify-between border-b border-brand-border pb-1 text-red-400">
                    <span>(-) Custo Real</span>
                    <span className="font-mono">{realCost > 0 ? '-' : ''}{formatCurrency(realCost)}</span>
                  </div>
                  <div className="flex justify-between border-b border-brand-border pb-1 text-red-400">
                    <span>(-) Impostos/Comissões</span>
                    <span className="font-mono">
                      {(totalDeductionsValue > 0 ? '-' : '') + formatCurrency(totalDeductionsValue)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 text-brand-primary font-bold">
                    <span>(=) Lucro Líquido</span>
                    <span className="font-mono">{formatCurrency(salesPrice * (profitMargin / 100))}</span>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  <button
                    onClick={handleSaveCalculation}
                    disabled={isSaving}
                    className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 border ${
                      saveSuccess 
                        ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                        : 'bg-brand-primary text-brand-black border-brand-primary hover:bg-brand-primary-hover'
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
                        labelClassName="text-slate-300"
                      />
                    </div>
                    <div className="w-full">
                      <div className="flex flex-col gap-1 bg-zinc-800 rounded-lg p-1">
                        <label className="text-[9px] font-bold text-slate-300 uppercase tracking-wide px-1">
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

      {/* Footer with Legal Links */}
      <footer className="mt-12 py-8 border-t border-brand-border flex flex-col md:flex-row items-center justify-between gap-6 px-6">
        <div className="flex flex-col gap-1.5 items-center md:items-start text-center md:text-left">
          <h4 className="text-white font-black text-xs uppercase tracking-tighter italic">
            NIVOR <span className="text-brand-primary">SOLUTION</span>
          </h4>
          <p className="text-slate-500 text-[10px] font-medium uppercase tracking-widest">
            © {new Date().getFullYear()} NIVOR CONSULTORIA EM CONTROLES E PROCESSOS
          </p>
        </div>
        
        <div className="flex items-center gap-6">
          <button 
            onClick={() => {
              setSelectedLegalTab('privacy');
              setIsLegalModalOpen(true);
            }}
            className="text-[10px] font-bold text-slate-400 hover:text-brand-primary uppercase tracking-widest transition-colors"
          >
            POLÍTICA DE PRIVACIDADE
          </button>
          <div className="w-1 h-1 bg-brand-border rounded-full"></div>
          <button 
            onClick={() => {
              setSelectedLegalTab('terms');
              setIsLegalModalOpen(true);
            }}
            className="text-[10px] font-bold text-slate-400 hover:text-brand-primary uppercase tracking-widest transition-colors"
          >
            TERMOS DE USO
          </button>
        </div>
      </footer>

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
                    <div className="text-[10px] font-bold text-slate-300 uppercase mb-1">Item #{index + 1}</div>
                    <h4 className="font-bold text-zinc-900 group-hover:text-amber-700 transition-colors truncate">{item.name}</h4>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-300 uppercase font-bold">Preço Unit.</span>
                        <span className="text-sm font-mono font-bold text-zinc-700">{formatCurrency(item.price)}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-300 uppercase font-bold">ICMS</span>
                        <span className="text-sm font-mono font-bold text-zinc-700">{item.icms}%</span>
                      </div>
                      {item.freight > 0 && (
                        <div className="flex flex-col">
                          <span className="text-[9px] text-slate-300 uppercase font-bold">Frete Item</span>
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
      {/* Subscription Alert */}
      {subscriptionAlert.isOpen && (
        <SubscriptionAlert 
          days={subscriptionAlert.days} 
          onClose={() => setSubscriptionAlert({ ...subscriptionAlert, isOpen: false })} 
        />
      )}

      {/* Upgrade Modal */}
      {isUpgradeModalOpen && (
        <div className="fixed inset-0 bg-brand-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[110] animate-in fade-in duration-300">
          <div className="bg-brand-card rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-brand-border flex flex-col">
            <div className="relative h-48 bg-brand-black flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 opacity-20">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,var(--color-brand-primary)_0%,transparent_50%)]"></div>
              </div>
              <div className="relative z-10 text-center">
                <div className="inline-flex p-3 bg-brand-primary rounded-2xl shadow-xl shadow-brand-primary/20 mb-4">
                  <Package className="w-8 h-8 text-brand-black" />
                </div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Seja NIVOR PRO</h3>
                <p className="text-brand-primary font-bold text-sm">Desbloqueie o potencial máximo da sua empresa</p>
              </div>
              <button 
                onClick={() => setIsUpgradeModalOpen(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors p-2"
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
                    <div className="bg-brand-primary/10 p-2 rounded-lg text-brand-primary shrink-0">
                      {item.icon}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-100 text-sm">{item.title}</h4>
                      <p className="text-slate-500 text-xs leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between p-4 bg-brand-black rounded-2xl border border-brand-border">
                    <div>
                      <span className="text-2xl font-black text-slate-100">R$ 36,90</span>
                      <span className="text-slate-500 text-xs font-medium"> / mês</span>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">Assinatura Mensal</span>
                    </div>
                    <button
                      onClick={() => handleUpgrade('monthly')}
                      disabled={isUpgrading}
                      className="bg-brand-primary hover:bg-brand-primary-hover text-brand-black px-6 py-2.5 rounded-xl font-bold text-xs transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isUpgrading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'ASSINAR MENSAL'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-brand-primary/10 rounded-2xl border border-brand-primary/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 bg-brand-primary text-brand-black text-[8px] font-black px-2 py-0.5 rounded-bl-lg uppercase tracking-tighter">Melhor Valor</div>
                    <div>
                      <span className="text-2xl font-black text-slate-100">R$ 360,00</span>
                      <span className="text-slate-500 text-xs font-medium"> / ano</span>
                      <span className="block text-[10px] font-bold text-brand-primary uppercase">Plano Anual à Vista</span>
                    </div>
                    <button
                      onClick={() => handleUpgrade('annual')}
                      disabled={isUpgrading}
                      className="bg-brand-primary hover:bg-brand-primary-hover text-brand-black px-6 py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg shadow-brand-primary/20 active:scale-95 disabled:opacity-50"
                    >
                      {isUpgrading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'ASSINAR ANUAL'}
                    </button>
                  </div>
                </div>
            </div>
          </div>
        </div>
      )}

      {/* Legal Modal */}
      {isLegalModalOpen && (
        <div className="fixed inset-0 bg-brand-black/90 backdrop-blur-md flex items-center justify-center p-4 z-[120] animate-in fade-in duration-300">
          <div className="bg-brand-card rounded-3xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden border border-brand-border flex flex-col">
            <div className="bg-brand-black p-6 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-brand-primary p-2 rounded-xl">
                  <Shield className="w-6 h-6 text-brand-black" />
                </div>
                <div>
                  <h3 className="text-xl font-bold uppercase tracking-tighter">{legalConfigs[selectedLegalTab].title}</h3>
                  <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Calculadora NIVOR • Informações Legais</p>
                </div>
              </div>
              <button 
                onClick={() => setIsLegalModalOpen(false)}
                className="text-slate-500 hover:text-white transition-colors p-2"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 prose prose-invert max-w-none prose-p:text-slate-300 prose-p:text-sm prose-p:leading-relaxed prose-headings:text-brand-primary prose-headings:uppercase prose-headings:tracking-tighter prose-strong:text-white prose-li:text-slate-300 prose-li:text-sm">
              <div className="whitespace-pre-wrap font-sans text-slate-300 leading-relaxed">
                {legalConfigs[selectedLegalTab].content}
              </div>
            </div>

            <div className="p-6 bg-brand-black/50 border-t border-brand-border flex justify-between items-center">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                Última atualização: {legalConfigs[selectedLegalTab].updatedAt?.toDate ? new Date(legalConfigs[selectedLegalTab].updatedAt.toDate()).toLocaleDateString('pt-BR') : 'Recentemente'}
              </span>
              <button 
                onClick={() => setIsLegalModalOpen(false)}
                className="bg-brand-primary hover:bg-brand-primary-hover text-brand-black px-8 py-2.5 rounded-xl font-bold text-xs transition-all active:scale-95"
              >
                FECHAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legal Admin Modal */}
      {isLegalAdminModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-brand-black/90 backdrop-blur-md flex items-center justify-center p-4 z-[130] animate-in fade-in duration-300">
          <div className="bg-brand-card rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-brand-border flex flex-col">
            <div className="bg-brand-black p-6 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-brand-primary p-2 rounded-xl">
                  <Settings className="w-6 h-6 text-brand-black" />
                </div>
                <div>
                  <h3 className="text-xl font-bold uppercase tracking-tighter italic">Painel Administrativo Legal</h3>
                  <p className="text-brand-primary text-[10px] font-bold uppercase tracking-widest">Gestão de Textos Jurídicos</p>
                </div>
              </div>
              <button 
                onClick={() => setIsLegalAdminModalOpen(false)}
                className="text-slate-500 hover:text-white transition-colors p-2"
              >
                <RotateCcw className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex border-b border-brand-border bg-brand-black/30">
                <button 
                  onClick={() => setSelectedLegalTab('privacy')}
                  className={`flex-1 py-4 text-xs font-black uppercase tracking-widest transition-all ${selectedLegalTab === 'privacy' ? 'text-brand-primary border-b-2 border-brand-primary bg-brand-primary/5' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Política de Privacidade
                </button>
                <button 
                  onClick={() => setSelectedLegalTab('terms')}
                  className={`flex-1 py-4 text-xs font-black uppercase tracking-widest transition-all ${selectedLegalTab === 'terms' ? 'text-brand-primary border-b-2 border-brand-primary bg-brand-primary/5' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Termos de Uso
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Título do Documento</label>
                    <input 
                      type="text"
                      value={legalConfigs[selectedLegalTab].title}
                      onChange={(e) => setLegalConfigs({
                        ...legalConfigs,
                        [selectedLegalTab]: { ...legalConfigs[selectedLegalTab], title: e.target.value }
                      })}
                      className="w-full bg-brand-black border border-brand-border rounded-xl py-3 px-4 text-sm text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Conteúdo do Documento (Markdown/Texto)</label>
                     <textarea 
                      value={legalConfigs[selectedLegalTab].content}
                      onChange={(e) => setLegalConfigs({
                        ...legalConfigs,
                        [selectedLegalTab]: { ...legalConfigs[selectedLegalTab], content: e.target.value }
                      })}
                      rows={15}
                      className="w-full bg-brand-black border border-brand-border rounded-xl py-3 px-4 text-sm text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all resize-none font-sans leading-relaxed"
                     />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 bg-brand-black border-t border-brand-border flex justify-end gap-4">
              <button 
                onClick={() => setIsLegalAdminModalOpen(false)}
                className="px-8 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-widest"
              >
                CANCELAR
              </button>
              <button 
                onClick={() => handleSaveLegal(selectedLegalTab, legalConfigs[selectedLegalTab])}
                disabled={isSavingLegal}
                className="bg-brand-primary hover:bg-brand-primary-hover text-brand-black px-10 py-3 rounded-xl font-black text-xs transition-all active:scale-95 shadow-xl shadow-brand-primary/20 flex items-center gap-2 uppercase tracking-widest disabled:opacity-50"
              >
                {isSavingLegal ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                SALVAR DOCUMENTO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Administrative Menu Modal */}
      {isAdminMenuOpen && isAdmin && (
        <div className="fixed inset-0 bg-brand-black/90 backdrop-blur-md flex items-center justify-center p-4 z-[200] animate-in fade-in duration-300">
          <div className="bg-brand-card rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-brand-border flex flex-col">
            <div className="bg-brand-black p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-brand-primary p-2 rounded-xl">
                  <Settings className="w-6 h-6 text-brand-black" />
                </div>
                <h3 className="text-xl font-bold uppercase tracking-tighter italic">Painel Admin</h3>
              </div>
              <button 
                onClick={() => setIsAdminMenuOpen(false)}
                className="text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <button 
                onClick={() => {
                  setIsAdminMenuOpen(false);
                  setIsManualAdminModalOpen(true);
                }}
                className="w-full flex items-center gap-4 bg-brand-muted hover:bg-brand-muted/80 p-4 rounded-2xl border border-brand-border transition-all group"
              >
                <div className="bg-brand-primary/10 p-3 rounded-xl text-brand-primary group-hover:bg-brand-primary group-hover:text-brand-black transition-colors">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <div className="text-white font-bold text-sm uppercase tracking-tight">Manual do Usuário</div>
                  <div className="text-slate-500 text-[10px] font-medium uppercase tracking-widest">Editar introdução e itens</div>
                </div>
              </button>

              <button 
                onClick={() => {
                  setIsAdminMenuOpen(false);
                  setIsLegalAdminModalOpen(true);
                }}
                className="w-full flex items-center gap-4 bg-brand-muted hover:bg-brand-muted/80 p-4 rounded-2xl border border-brand-border transition-all group"
              >
                <div className="bg-brand-primary/10 p-3 rounded-xl text-brand-primary group-hover:bg-brand-primary group-hover:text-brand-black transition-colors">
                  <Shield className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <div className="text-white font-bold text-sm uppercase tracking-tight">Jurídico & Legal</div>
                  <div className="text-slate-500 text-[10px] font-medium uppercase tracking-widest">Privacidade e Termos</div>
                </div>
              </button>
            </div>
            <div className="p-6 bg-brand-black/50 border-t border-brand-border">
              <button 
                onClick={() => setIsAdminMenuOpen(false)}
                className="w-full bg-brand-muted hover:bg-brand-muted/80 text-white py-3 rounded-xl font-bold text-xs transition-all border border-brand-border uppercase tracking-widest"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Calculation Example Memorial Modal */}
      {isExampleModalOpen && (
        <div className="fixed inset-0 bg-brand-black/95 backdrop-blur-xl flex items-center justify-center sm:p-4 z-[120] animate-in fade-in duration-300">
          <div className="bg-brand-card sm:rounded-3xl shadow-2xl w-full h-full sm:h-auto sm:max-w-4xl sm:max-h-[90vh] overflow-hidden border-0 sm:border border-brand-border flex flex-col">
            <div className="bg-brand-black p-4 sm:p-6 text-white flex items-center justify-between shrink-0 border-b border-brand-border">
              <div className="flex items-center gap-3">
                <div className="bg-brand-primary p-2 rounded-xl text-brand-black">
                  <Calculator className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter">Memorial de Prática de Cálculos</h3>
                  <p className="text-brand-primary text-[10px] font-bold uppercase tracking-widest italic">Exemplo Educativo: Validação Passo a Passo</p>
                </div>
              </div>
              <button 
                onClick={() => setIsExampleModalOpen(false)}
                className="text-slate-500 hover:text-white transition-colors p-2 hover:bg-brand-muted rounded-full"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 bg-slate-900/50">
              <div className="bg-brand-primary/5 border border-brand-primary/20 p-4 rounded-xl text-slate-300 text-xs leading-relaxed">
                Este memorial serve para validar a lógica matemática do sistema. Abaixo, detalhamos cada etapa do cálculo utilizando valores fixos para facilitar o entendimento do Lucro Antes do IR (LAIR) e a formação do Markup.
              </div>

              {/* Step 1 & 2: Acquisition and Credits */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-brand-primary uppercase tracking-widest flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-brand-primary text-brand-black flex items-center justify-center text-[10px]">1</span>
                    Entrada e Custos
                  </h4>
                  <div className="bg-brand-black/40 rounded-xl border border-brand-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-brand-muted text-slate-400">
                          <th className="px-4 py-2 text-left font-bold uppercase tracking-tighter">Descrição</th>
                          <th className="px-4 py-2 text-right font-bold uppercase tracking-tighter">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-border">
                        <tr>
                          <td className="px-4 py-3 text-slate-300">Preço do Produto</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-white">R$ 1.000,00</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 text-slate-300">Frete / IPI / Outras Desp.</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-400">R$ 0,00</td>
                        </tr>
                        <tr className="bg-brand-primary/5">
                          <td className="px-4 py-3 font-bold text-brand-primary">TOTAL NF COMPRA</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-brand-primary">R$ 1.000,00</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-500 text-emerald-950 flex items-center justify-center text-[10px]">2</span>
                    Créditos e Custo Real
                  </h4>
                  <div className="bg-brand-black/40 rounded-xl border border-brand-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-brand-muted text-slate-400">
                          <th className="px-4 py-2 text-left font-bold uppercase tracking-tighter">Imposto Recuperável</th>
                          <th className="px-4 py-2 text-right font-bold uppercase tracking-tighter">Crédito</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-border">
                        <tr>
                          <td className="px-4 py-3 text-slate-300">ICMS Compra (12%)</td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-400">R$ 120,00</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 text-slate-300">PIS Compra (1,65%)</td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-400">R$ 16,50</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 text-slate-300">COFINS Compra (7,6%)</td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-400">R$ 76,00</td>
                        </tr>
                        <tr className="bg-emerald-500/10">
                          <td className="px-4 py-3 font-bold text-emerald-400">CUSTO REAL LÍQUIDO</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400 underline decoration-double">R$ 787,50</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Step 3: Sales Formation */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-amber-500 text-amber-950 flex items-center justify-center text-[10px]">3</span>
                  Formação do Preço e Resultados (Lucro Real)
                </h4>
                <div className="bg-brand-black/40 rounded-2xl border border-brand-border overflow-hidden shadow-2xl">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-brand-muted text-slate-300">
                        <th className="px-6 py-4 text-left font-bold uppercase tracking-wider">Item do Cálculo</th>
                        <th className="px-6 py-4 text-center font-bold uppercase tracking-wider">%</th>
                        <th className="px-6 py-4 text-right font-bold uppercase tracking-wider">Valor R$</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border">
                      <tr className="bg-brand-primary/5">
                        <td className="px-6 py-4 font-bold text-brand-primary uppercase">PREÇO DE VENDA (100%)</td>
                        <td className="px-6 py-4 text-center font-mono text-brand-primary">100,00%</td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-brand-primary text-lg">R$ 1.381,26</td>
                      </tr>
                      <tr>
                        <td className="px-6 py-4 text-slate-300">(-) Custo Real do Produto</td>
                        <td className="px-6 py-4 text-center font-mono text-slate-500">57,01%</td>
                        <td className="px-6 py-4 text-right font-mono text-red-400">R$ 787,50</td>
                      </tr>
                      <tr>
                        <td className="px-6 py-4 text-slate-300">(-) ICMS Venda</td>
                        <td className="px-6 py-4 text-center font-mono text-slate-500">12,00%</td>
                        <td className="px-6 py-4 text-right font-mono text-red-500">R$ 165,75</td>
                      </tr>
                      <tr>
                        <td className="px-6 py-4 text-slate-300">(-) PIS / COFINS Venda</td>
                        <td className="px-6 py-4 text-center font-mono text-slate-500">9,25%</td>
                        <td className="px-6 py-4 text-right font-mono text-red-500">R$ 127,77</td>
                      </tr>
                      <tr>
                        <td className="px-6 py-4 text-slate-300">(-) Comissão Venda</td>
                        <td className="px-6 py-4 text-center font-mono text-slate-500">2,00%</td>
                        <td className="px-6 py-4 text-right font-mono text-red-500">R$ 27,63</td>
                      </tr>
                      <tr className="bg-brand-muted/30">
                        <td className="px-6 py-4 font-bold text-amber-500 underline uppercase italic">(=) LUCRO ANTES IR/CSLL (LAIR)</td>
                        <td className="px-6 py-4 text-center font-mono text-amber-500 font-bold">19,74%</td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-amber-500">R$ 272,61</td>
                      </tr>
                      <tr>
                        <td className="px-6 py-4 text-slate-400 pl-8 italic">(-) IRPJ sobre Lucro (15%)</td>
                        <td className="px-6 py-4 text-center font-mono text-slate-600">2,96%</td>
                        <td className="px-6 py-4 text-right font-mono text-red-500/70">R$ 40,89</td>
                      </tr>
                      <tr>
                        <td className="px-6 py-4 text-slate-400 pl-8 italic">(-) CSLL sobre Lucro (9%)</td>
                        <td className="px-6 py-4 text-center font-mono text-slate-600">1,78%</td>
                        <td className="px-6 py-4 text-right font-mono text-red-500/70">R$ 24,53</td>
                      </tr>
                      <tr className="bg-emerald-500/20">
                        <td className="px-6 py-5 font-black text-emerald-400 uppercase tracking-widest">(=) LUCRO LÍQUIDO FINAL</td>
                        <td className="px-6 py-5 text-center font-mono font-black text-emerald-400">15,00%</td>
                        <td className="px-6 py-5 text-right font-mono font-black text-emerald-400 text-xl border-t-2 border-emerald-500">R$ 207,19</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-brand-black p-4 rounded-xl border border-brand-border text-[9px] text-slate-500 uppercase tracking-widest text-center">
                Nota: O cálculo acima utiliza a metodologia de Markup Divisor para garantir a margem líquida exata após todos os impostos variáveis e impostos sobre o lucro (Lucro Real).
              </div>
            </div>

            <div className="p-6 bg-brand-black border-t border-brand-border flex justify-end gap-4 shrink-0">
              <button 
                onClick={() => setIsExampleModalOpen(false)}
                className="bg-brand-primary text-brand-black px-8 py-3 rounded-xl font-black text-xs transition-all border border-brand-primary uppercase tracking-widest hover:bg-brand-primary-hover shadow-[0_0_20px_rgba(0,240,255,0.2)]"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-brand-black/95 backdrop-blur-xl flex items-center justify-center sm:p-4 z-[110] animate-in fade-in duration-300">
          <div className="bg-brand-card sm:rounded-3xl shadow-2xl w-full h-full sm:h-auto sm:max-w-4xl sm:max-h-[90vh] overflow-hidden border-0 sm:border border-brand-border flex flex-col">
            <div className="bg-brand-black p-4 sm:p-6 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-brand-primary p-2 rounded-xl">
                  <HelpCircle className="w-6 h-6 text-brand-black" />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter">Manual do Usuário</h3>
                  <p className="text-brand-primary text-[10px] font-bold uppercase tracking-widest">NIVOR Calculadora</p>
                </div>
              </div>
              <button 
                onClick={() => setIsManualModalOpen(false)}
                className="text-slate-500 hover:text-white transition-colors p-2 hover:bg-brand-muted rounded-full"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Introduction */}
              <div className="space-y-2">
                <h4 className="text-lg font-black text-slate-100 uppercase tracking-tight border-b-2 border-brand-primary inline-block">{manualConfig.introTitle}</h4>
                <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-wrap">
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
                    href={`mailto:${manualConfig.supportEmail || 'suporte@nivorconsultoria.com.br'}`}
                    className="flex items-center gap-2 bg-zinc-950 hover:bg-zinc-800 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-lg shadow-zinc-950/20"
                  >
                    <Mail className="w-4 h-4 text-amber-500" />
                    ENVIAR E-MAIL
                  </a>
                  <a 
                    href={`https://mail.google.com/mail/?view=cm&fs=1&to=${manualConfig.supportEmail || 'suporte@nivorconsultoria.com.br'}`}
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

            <div className="p-6 bg-zinc-50 border-t border-zinc-200 flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={() => {
                  setIsManualModalOpen(false);
                  setIsExampleModalOpen(true);
                }}
                className="bg-brand-primary text-brand-black px-6 py-2.5 rounded-xl font-black text-[10px] transition-all active:scale-95 flex items-center justify-center gap-2 border border-brand-primary uppercase tracking-widest hover:bg-brand-primary-hover shadow-lg"
              >
                <BookOpen className="w-4 h-4" />
                VER MEMORIAL DE PRÁTICA (EXEMPLO)
              </button>
              {isAdmin && (
                <button 
                  onClick={() => {
                    setIsManualModalOpen(false);
                    setIsManualAdminModalOpen(true);
                  }}
                  className="bg-red-600 hover:bg-red-500 text-white px-6 py-2.5 rounded-xl font-bold text-[10px] transition-all active:scale-95 flex items-center justify-center gap-2 uppercase tracking-widest"
                >
                  <Edit2 className="w-4 h-4" />
                  EDITAR MANUAL
                </button>
              )}
              <button 
                onClick={() => setIsManualModalOpen(false)}
                className="bg-zinc-950 hover:bg-zinc-800 text-white px-8 py-2.5 rounded-xl font-bold text-[10px] transition-all active:scale-95 uppercase tracking-widest"
              >
                FECHAR
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
                    <label className="text-[10px] font-bold text-black uppercase">Título da Introdução</label>
                    <input 
                      type="text"
                      value={manualConfig.introTitle}
                      onChange={(e) => setManualConfig({ ...manualConfig, introTitle: e.target.value })}
                      className="w-full bg-white border border-zinc-200 rounded-xl py-2 px-3 text-sm text-black focus:ring-2 focus:ring-red-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-black uppercase">Texto de Boas-vindas</label>
                    <textarea 
                      value={manualConfig.introContent}
                      onChange={(e) => setManualConfig({ ...manualConfig, introContent: e.target.value })}
                      rows={3}
                      className="w-full bg-white border border-zinc-200 rounded-xl py-2 px-3 text-sm text-black focus:ring-2 focus:ring-red-500 outline-none resize-none"
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
                          <label className="text-[10px] font-bold text-black uppercase">Título</label>
                          <input 
                            type="text"
                            value={item.title}
                            onChange={(e) => {
                              const newItems = [...manualConfig.items];
                              newItems[index].title = e.target.value;
                              setManualConfig({ ...manualConfig, items: newItems });
                            }}
                            className="w-full bg-white border border-zinc-200 rounded-xl py-2 px-3 text-sm text-black focus:ring-2 focus:ring-red-500 outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-black uppercase">Ícone (Lucide Name)</label>
                          <select 
                            value={item.icon}
                            onChange={(e) => {
                              const newItems = [...manualConfig.items];
                              newItems[index].icon = e.target.value;
                              setManualConfig({ ...manualConfig, items: newItems });
                            }}
                            className="w-full bg-white border border-zinc-200 rounded-xl py-2 px-3 text-sm text-black focus:ring-2 focus:ring-red-500 outline-none"
                          >
                            <option value="Calculator">Calculadora</option>
                            <option value="LayoutDashboard">Dashboard</option>
                            <option value="Settings">Configurações</option>
                            <option value="Package">Produtos</option>
                            <option value="History">Histórico</option>
                            <option value="FileUp">Importação</option>
                            <option value="Download">Exportação</option>
                            <option value="RotateCcw">Resetar</option>
                            <option value="Percent">Porcentagem</option>
                            <option value="BookOpen">Glossário</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-black uppercase">Descrição</label>
                        <textarea 
                          value={item.description}
                          onChange={(e) => {
                            const newItems = [...manualConfig.items];
                            newItems[index].description = e.target.value;
                            setManualConfig({ ...manualConfig, items: newItems });
                          }}
                          rows={3}
                          className="w-full bg-white border border-zinc-200 rounded-xl py-2 px-3 text-sm text-black focus:ring-2 focus:ring-red-500 outline-none resize-none"
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
                    <label className="text-[10px] font-bold text-black uppercase">Título do Contato</label>
                    <input 
                      type="text"
                      value={manualConfig.contactTitle}
                      onChange={(e) => setManualConfig({ ...manualConfig, contactTitle: e.target.value })}
                      className="w-full bg-white border border-amber-200 rounded-xl py-2 px-3 text-sm text-black focus:ring-2 focus:ring-red-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-black uppercase">Mensagem de Suporte</label>
                    <textarea 
                      value={manualConfig.contactContent}
                      onChange={(e) => setManualConfig({ ...manualConfig, contactContent: e.target.value })}
                      rows={3}
                      className="w-full bg-white border border-amber-200 rounded-xl py-2 px-3 text-sm text-black focus:ring-2 focus:ring-red-500 outline-none resize-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-black uppercase">E-mail de Suporte</label>
                    <input 
                      type="email"
                      value={manualConfig.supportEmail}
                      onChange={(e) => setManualConfig({ ...manualConfig, supportEmail: e.target.value })}
                      placeholder="exemplo@email.com"
                      className="w-full bg-white border border-amber-200 rounded-xl py-2 px-3 text-sm text-black focus:ring-2 focus:ring-red-500 outline-none"
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
                <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wide">Descrição do Produto</label>
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
                <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wide">Nome do Representante / Fornecedor</label>
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
                  className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 py-2 rounded-lg font-bold text-[15px] transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleConfirmSave}
                  disabled={!productName || isSaving}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-lg font-bold text-[15px] transition-colors shadow-lg shadow-amber-600/20"
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
        <div className="fixed inset-0 bg-brand-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-brand-card rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden border border-brand-border flex flex-col">
            <div className="bg-brand-black p-4 text-white flex items-center justify-between shrink-0">
              <h3 className="font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                <History className="w-4 h-4 text-brand-primary" />
                Histórico de Simulações
              </h3>
              <div className="flex items-center gap-4">
                {isPro && user && (
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text"
                      placeholder="Buscar produto ou fornecedor..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className="bg-brand-muted border border-brand-border rounded-lg pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-brand-primary w-64 transition-all"
                    />
                  </div>
                )}
                <button 
                  onClick={() => {
                    setHistorySearch('');
                    setIsHistoryModalOpen(false);
                  }}
                  className="text-slate-500 hover:text-white transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto p-6 bg-brand-black/20">
              {!isPro ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-6">
                  <div className="bg-brand-primary/10 p-6 rounded-3xl">
                    <History className="w-16 h-16 text-brand-primary" />
                  </div>
                  <div className="max-w-md space-y-2">
                    <h3 className="text-2xl font-black text-slate-100 uppercase tracking-tighter">Histórico de Simulações PRO</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">
                      Acesse todos os seus cálculos salvos, compare simulações e mantenha um registro completo das suas operações.
                    </p>
                  </div>
                  <button 
                    onClick={() => setIsUpgradeModalOpen(true)}
                    className="bg-brand-primary hover:bg-brand-primary-hover text-brand-black px-8 py-4 rounded-2xl font-bold transition-all shadow-xl shadow-brand-primary/20 active:scale-95 flex items-center gap-3"
                  >
                    <Package className="w-5 h-5" />
                    DESBLOQUEAR AGORA
                  </button>
                </div>
              ) : !user ? (
                <div className="text-center py-12">
                  <History className="w-12 h-12 text-slate-700 mx-auto mb-4 animate-pulse" />
                  <p className="text-slate-400 font-bold">Identificando usuário...</p>
                </div>
              ) : filteredCalculations.length === 0 ? (
                <div className="text-center py-20 bg-brand-black/40 rounded-2xl border border-brand-border">
                  <History className="w-16 h-16 text-slate-700 mx-auto mb-6 opacity-20" />
                  <p className="text-slate-300 font-bold text-lg">Nenhum cálculo encontrado</p>
                  <p className="text-slate-500 text-sm mt-1 max-w-xs mx-auto">
                    {historySearch ? `Nenhum resultado para "${historySearch}"` : 'Você ainda não realizou nenhuma simulação.'}
                  </p>
                  {historySearch && (
                    <button 
                      onClick={() => setHistorySearch('')}
                      className="mt-6 text-brand-primary hover:underline text-sm font-bold"
                    >
                      Limpar busca
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredCalculations.map((calc) => (
                    <div key={calc.id} className="bg-brand-black border border-brand-border rounded-xl p-4 hover:border-brand-primary/50 transition-all group">
                      <div className="flex justify-between items-start mb-3">
                        <div className="space-y-1">
                          <h4 className="font-bold text-slate-100 line-clamp-1">{calc.productName}</h4>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 uppercase font-bold">
                            <Calendar className="w-3 h-3" />
                            {calc.createdAt?.toDate().toLocaleDateString('pt-BR')} {calc.createdAt?.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {deletingId === calc.id ? (
                            <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
                              <button 
                                onClick={() => setDeletingId(null)}
                                className="text-[10px] font-bold text-slate-500 hover:text-slate-300 px-2 py-1"
                              >
                                Cancelar
                              </button>
                              <button 
                                onClick={() => handleDeleteCalculation(calc.id)}
                                className="text-[10px] font-bold bg-red-500/10 text-red-500 hover:bg-red-500/20 px-2 py-1 rounded"
                              >
                                Confirmar Exclusão
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setDeletingId(calc.id)}
                              className="text-slate-500 hover:text-red-500 p-1 transition-colors"
                              title="Excluir cálculo"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-brand-muted p-2 rounded border border-brand-border">
                          <div className="text-[9px] text-slate-400 uppercase font-bold">Venda</div>
                          <div className="text-sm font-mono font-bold text-slate-100">{formatCurrency(calc.salesPrice)}</div>
                        </div>
                        <div className="bg-brand-muted p-2 rounded border border-brand-border">
                          <div className="text-[9px] text-slate-400 uppercase font-bold">Margem</div>
                          <div className="text-sm font-mono font-bold text-brand-primary">{calc.profitMargin.toFixed(2)}%</div>
                        </div>
                      </div>

                      {calc.representativeName && (
                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-4 bg-brand-muted/50 p-2 rounded">
                          <UserIcon className="w-3 h-3 text-slate-500" />
                          <span className="line-clamp-1">{calc.representativeName}</span>
                        </div>
                      )}

                      <button 
                        onClick={() => handleLoadCalculation(calc)}
                        className="w-full bg-brand-primary text-brand-black py-2 rounded-lg text-xs font-bold hover:bg-brand-primary-hover transition-colors flex items-center justify-center gap-2"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Carregar Simulação
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-brand-border bg-brand-black shrink-0">
              <button 
                onClick={() => setIsHistoryModalOpen(false)}
                className="w-full bg-brand-muted hover:bg-brand-muted/80 text-slate-300 py-2 rounded-lg font-bold text-sm transition-colors border border-brand-border"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Products Management Modal */}
      {isProductsModalOpen && (
        <div className="fixed inset-0 bg-brand-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-brand-card rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden border border-brand-border flex flex-col">
            <div className="bg-brand-black p-4 text-white flex items-center justify-between shrink-0">
              <h3 className="font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                <Package className="w-4 h-4 text-brand-primary" />
                Gestão de Produtos
              </h3>
              <button 
                onClick={() => {
                  setIsProductsModalOpen(false);
                  setEditingProduct(null);
                }}
                className="text-slate-500 hover:text-white transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              {!isPro ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-6">
                  <div className="bg-brand-primary/10 p-6 rounded-3xl">
                    <Package className="w-16 h-16 text-brand-primary" />
                  </div>
                  <div className="max-w-md space-y-2">
                    <h3 className="text-2xl font-black text-slate-100 uppercase tracking-tighter">Gestão de Produtos PRO</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">
                      Cadastre seus produtos, gerencie estoques e tenha acesso rápido aos custos de aquisição para agilizar seus cálculos.
                    </p>
                  </div>
                  <button 
                    onClick={() => setIsUpgradeModalOpen(true)}
                    className="bg-brand-primary hover:bg-brand-primary-hover text-brand-black px-8 py-4 rounded-2xl font-bold transition-all shadow-xl shadow-brand-primary/20 active:scale-95 flex items-center gap-3"
                  >
                    <Package className="w-5 h-5" />
                    DESBLOQUEAR AGORA
                  </button>
                </div>
              ) : !user ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                  <p className="text-slate-500">Faça login para gerenciar seus produtos.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Add/Edit Form */}
                  <div className="bg-brand-black border border-brand-border rounded-xl p-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      {editingProduct?.id ? <Edit2 className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                      {editingProduct?.id ? 'Editar Produto' : 'Novo Produto'}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-300 uppercase">Nome do Produto</label>
                        <input 
                          type="text"
                          value={editingProduct?.name || ''}
                          onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                          placeholder="Ex: Fertilizante 07-28-14"
                          className="w-full bg-brand-muted border border-brand-border rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-brand-primary text-sm text-slate-100"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-300 uppercase">Fornecedor</label>
                        <input 
                          type="text"
                          value={editingProduct?.supplierName || ''}
                          onChange={(e) => setEditingProduct({ ...editingProduct, supplierName: e.target.value })}
                          placeholder="Ex: Fertipar"
                          className="w-full bg-brand-muted border border-brand-border rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-brand-primary text-sm text-slate-100"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-300 uppercase">Custo Base (R$)</label>
                        <input 
                          type="text"
                          value={editingProduct?.baseCost ? formatCurrency(editingProduct.baseCost).replace('R$ ', '') : ''}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            setEditingProduct({ ...editingProduct, baseCost: Number(val) / 100 });
                          }}
                          placeholder="0,00"
                          className="w-full bg-brand-muted border border-brand-border rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-brand-primary text-sm font-mono text-slate-100"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleSaveProduct(editingProduct)}
                          disabled={!editingProduct?.name || isSavingProduct}
                          className="flex-1 bg-brand-primary hover:bg-brand-primary-hover disabled:opacity-50 text-brand-black py-2 rounded-lg font-bold text-sm transition-colors"
                        >
                          {isSavingProduct ? 'Salvando...' : editingProduct?.id ? 'Atualizar' : 'Cadastrar'}
                        </button>
                        {editingProduct && (
                          <button 
                            onClick={() => setEditingProduct(null)}
                            className="bg-brand-muted hover:bg-brand-muted/80 text-slate-300 px-4 py-2 rounded-lg font-bold text-sm transition-colors border border-brand-border"
                          >
                            Limpar
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-4 pt-4 border-t border-brand-border">
                      <div className="space-y-1">
                        <label className="text-[8px] font-bold text-slate-300 uppercase">ICMS Compra (%)</label>
                        <input 
                          type="number"
                          value={editingProduct?.icmsPurchaseRate || 0}
                          onChange={(e) => setEditingProduct({ ...editingProduct, icmsPurchaseRate: Number(e.target.value) })}
                          className="w-full bg-brand-muted border border-brand-border rounded-lg py-1.5 px-3 outline-none focus:ring-2 focus:ring-brand-primary text-sm text-slate-100"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-bold text-slate-300 uppercase">ICMS Frete (%)</label>
                        <input 
                          type="number"
                          value={editingProduct?.icmsFreightRate || 0}
                          onChange={(e) => setEditingProduct({ ...editingProduct, icmsFreightRate: Number(e.target.value) })}
                          className="w-full bg-brand-muted border border-brand-border rounded-lg py-1.5 px-3 outline-none focus:ring-2 focus:ring-brand-primary text-sm text-slate-100"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-bold text-slate-300 uppercase">PIS Compra (%)</label>
                        <input 
                          type="number"
                          step="0.001"
                          value={editingProduct?.pisPurchaseRate || 0}
                          onChange={(e) => setEditingProduct({ ...editingProduct, pisPurchaseRate: Number(e.target.value) })}
                          className="w-full bg-brand-muted border border-brand-border rounded-lg py-1.5 px-3 outline-none focus:ring-2 focus:ring-brand-primary text-sm text-slate-100"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-bold text-slate-300 uppercase">COFINS Compra (%)</label>
                        <input 
                          type="number"
                          step="0.001"
                          value={editingProduct?.cofinsPurchaseRate || 0}
                          onChange={(e) => setEditingProduct({ ...editingProduct, cofinsPurchaseRate: Number(e.target.value) })}
                          className="w-full bg-brand-muted border border-brand-border rounded-lg py-1.5 px-3 outline-none focus:ring-2 focus:ring-brand-primary text-sm text-slate-100"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-bold text-slate-300 uppercase">ICMS Venda (%)</label>
                        <input 
                          type="number"
                          value={editingProduct?.icmsSaleRate || 0}
                          onChange={(e) => setEditingProduct({ ...editingProduct, icmsSaleRate: Number(e.target.value) })}
                          className="w-full bg-brand-muted border border-brand-border rounded-lg py-1.5 px-3 outline-none focus:ring-2 focus:ring-brand-primary text-sm text-slate-100"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-bold text-slate-300 uppercase">PIS Venda (%)</label>
                        <input 
                          type="number"
                          step="0.001"
                          value={editingProduct?.pisSaleRate || 1.65}
                          onChange={(e) => setEditingProduct({ ...editingProduct, pisSaleRate: Number(e.target.value) })}
                          className="w-full bg-brand-muted border border-brand-border rounded-lg py-1.5 px-3 outline-none focus:ring-2 focus:ring-brand-primary text-sm text-slate-100"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-bold text-slate-300 uppercase">COFINS Venda (%)</label>
                        <input 
                          type="number"
                          step="0.001"
                          value={editingProduct?.cofinsSaleRate || 7.6}
                          onChange={(e) => setEditingProduct({ ...editingProduct, cofinsSaleRate: Number(e.target.value) })}
                          className="w-full bg-brand-muted border border-brand-border rounded-lg py-1.5 px-3 outline-none focus:ring-2 focus:ring-brand-primary text-sm text-slate-100"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-bold text-slate-300 uppercase">IPI (%)</label>
                        <input 
                          type="number"
                          value={editingProduct?.ipiRate || 0}
                          onChange={(e) => {
                            const rate = Number(e.target.value);
                            const val = (editingProduct?.baseCost || 0) * (rate / 100);
                            setEditingProduct({ ...editingProduct, ipiRate: rate, ipi: val });
                          }}
                          className="w-full bg-brand-muted border border-brand-border rounded-lg py-1.5 px-3 outline-none focus:ring-2 focus:ring-brand-primary text-sm text-slate-100"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-bold text-slate-300 uppercase">IPI (R$)</label>
                        <input 
                          type="number"
                          value={editingProduct?.ipi || 0}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const rate = (editingProduct?.baseCost || 0) > 0 ? (val / editingProduct.baseCost) * 100 : 0;
                            setEditingProduct({ ...editingProduct, ipi: val, ipiRate: rate });
                          }}
                          className="w-full bg-brand-muted border border-brand-border rounded-lg py-1.5 px-3 outline-none focus:ring-2 focus:ring-brand-primary text-sm text-slate-100"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Products List */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {products.length === 0 ? (
                      <div className="col-span-full text-center py-8 text-slate-500 text-sm italic">
                        Nenhum produto cadastrado no catálogo.
                      </div>
                    ) : (
                      products.map((product) => (
                        <div key={product.id} className="bg-brand-black border border-brand-border rounded-xl p-4 hover:border-brand-primary/50 transition-all group relative">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-slate-100 line-clamp-1 pr-8">{product.name}</h4>
                            <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => setEditingProduct(product)}
                                className="text-slate-500 hover:text-brand-primary p-1"
                                title="Editar"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => setDeletingProductId(product.id)}
                                className="text-slate-500 hover:text-red-500 p-1"
                                title="Excluir"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-1 mb-4">
                            <div className="text-xs font-mono font-bold text-slate-400">
                              Custo: <span className="text-slate-100">{formatCurrency(product.baseCost || 0)}</span>
                            </div>
                            {product.supplierName && (
                              <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                <UserIcon className="w-3 h-3" />
                                <span className="font-medium">{product.supplierName}</span>
                              </div>
                            )}
                          </div>

                          {deletingProductId === product.id ? (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                              <button 
                                onClick={() => handleDeleteProduct(product.id)}
                                className="flex-1 bg-red-500/10 text-red-500 py-1.5 rounded-lg text-[11px] font-bold hover:bg-red-500/20"
                              >
                                Confirmar
                              </button>
                              <button 
                                onClick={() => setDeletingProductId(null)}
                                className="flex-1 bg-brand-muted text-slate-500 py-1.5 rounded-lg text-[11px] font-bold hover:bg-brand-muted/80 border border-brand-border"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => handleSelectProductForCalculator(product)}
                              className="w-full bg-brand-primary text-brand-black py-2 rounded-lg text-[11px] font-bold hover:bg-brand-primary-hover transition-colors flex items-center justify-center gap-2"
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
            
            <div className="p-4 border-t border-brand-border bg-brand-black shrink-0">
              <button 
                onClick={() => {
                  setIsProductsModalOpen(false);
                  setEditingProduct(null);
                }}
                className="w-full bg-brand-muted hover:bg-brand-muted/80 text-slate-300 py-2 rounded-lg font-bold text-sm transition-colors border border-brand-border"
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
      </>
    ) : (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="bg-brand-muted/20 p-10 rounded-3xl mb-10 border border-brand-border shadow-inner relative overflow-hidden group">
        <div className="absolute inset-0 bg-brand-primary/5 group-hover:bg-brand-primary/10 transition-colors"></div>
        <Lock className="w-20 h-20 text-brand-primary lg:w-24 lg:h-24 relative z-10 animate-in slide-in-from-bottom-4 duration-700" />
      </div>
      <h2 className="text-4xl lg:text-5xl font-black text-white mb-4 uppercase tracking-tighter italic">
        NIVOR <span className="text-brand-primary">SECURE</span>
      </h2>
      <p className="text-slate-400 max-w-sm mb-12 leading-relaxed text-sm lg:text-base">
        Precificação estratégica com inteligência tributária. Acesse sua conta para começar.
      </p>
      <button 
        onClick={handleLogin}
        className="flex items-center gap-4 bg-brand-primary hover:bg-brand-primary-hover text-brand-black px-12 py-5 rounded-2xl text-xl font-black transition-all shadow-2xl shadow-brand-primary/10 active:scale-95 group"
      >
        <LogIn className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
        <span>ENTRAR NO SISTEMA</span>
      </button>
    </div>
  )}

  {/* Modals and Toast UI below */}
        </div>
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

  const handlePercent = useCallback(() => {
    setDisplay(prev => {
      const val = parseFloat(prev.replace(',', '.'));
      if (isNaN(val)) return prev;
      return String(val / 100).replace('.', ',');
    });
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
      // Percent
      else if (e.key === '%') {
        handlePercent();
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
      <div className="bg-brand-black border border-brand-border rounded-2xl shadow-2xl w-72 overflow-hidden flex flex-col">
        <div className="bg-brand-muted p-3 flex items-center justify-between border-b border-brand-border">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-brand-primary" />
            <span className="text-white text-xs font-bold uppercase tracking-wider">Calculadora</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 bg-brand-black text-right">
          <div className="text-slate-500 text-[10px] h-4 mb-1 font-mono">{equation}</div>
          <div className="text-white text-3xl font-mono font-bold truncate">{display}</div>
        </div>

        <div className="p-2 grid grid-cols-4 gap-1 bg-brand-black">
          <button onClick={clear} className="p-3 bg-brand-muted text-brand-primary rounded-lg font-bold hover:bg-brand-muted/80 transition-colors">AC</button>
          <button onClick={handlePercent} className="p-3 bg-brand-muted text-brand-primary rounded-lg font-bold hover:bg-brand-muted/80 transition-colors">%</button>
          <button onClick={() => handleOperator('/')} className="p-3 bg-brand-muted text-brand-primary rounded-lg font-bold hover:bg-brand-muted/80 transition-colors">÷</button>
          <button onClick={() => handleOperator('*')} className="p-3 bg-brand-muted text-brand-primary rounded-lg font-bold hover:bg-brand-muted/80 transition-colors">×</button>

          {[7, 8, 9].map(n => (
            <button key={n} onClick={() => handleNumber(String(n))} className="p-3 bg-brand-muted text-white rounded-lg font-bold hover:bg-brand-muted/80 transition-colors">{n}</button>
          ))}
          <button onClick={() => handleOperator('-')} className="p-3 bg-brand-muted text-brand-primary rounded-lg font-bold hover:bg-brand-muted/80 transition-colors">−</button>

          {[4, 5, 6].map(n => (
            <button key={n} onClick={() => handleNumber(String(n))} className="p-3 bg-brand-muted text-white rounded-lg font-bold hover:bg-brand-muted/80 transition-colors">{n}</button>
          ))}
          <button onClick={() => handleOperator('+')} className="p-3 bg-brand-muted text-brand-primary rounded-lg font-bold hover:bg-brand-muted/80 transition-colors">+</button>

          {[1, 2, 3].map(n => (
            <button key={n} onClick={() => handleNumber(String(n))} className="p-3 bg-brand-muted text-white rounded-lg font-bold hover:bg-brand-muted/80 transition-colors">{n}</button>
          ))}
          <button onClick={calculate} className="row-span-2 p-3 bg-brand-primary text-brand-black rounded-lg font-bold hover:bg-brand-primary-hover transition-colors shadow-lg shadow-brand-primary/20">=</button>

          <button onClick={() => handleNumber('0')} className="col-span-2 p-3 bg-brand-muted text-white rounded-lg font-bold hover:bg-brand-muted/80 transition-colors">0</button>
          <button onClick={() => handleNumber(',')} className="p-3 bg-brand-muted text-white rounded-lg font-bold hover:bg-brand-muted/80 transition-colors">,</button>
        </div>
      </div>
    </div>
  );
});
