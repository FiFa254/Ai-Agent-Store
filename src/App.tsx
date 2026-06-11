import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShoppingBag, 
  BarChart2, 
  FileSpreadsheet, 
  MessageSquare, 
  Sparkles, 
  Bell, 
  Clock, 
  VolumeX,
  BadgeAlert
} from 'lucide-react';
import { Product, SalesLog, StockAlert } from './types';
import CustomerStore from './components/CustomerStore';
import AdminPanel from './components/AdminPanel';
import OnlineSheet from './components/OnlineSheet';
import LineSimulator from './components/LineSimulator';

export default function App() {
  const [activeTab, setActiveTab] = useState<'shop' | 'line' | 'admin' | 'sheets'>('shop');
  
  // Real-time server state holders
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SalesLog[]>([]);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Client notifications/toasts state
  const [notifications, setNotifications] = useState<{ id: string; msg: string; type: 'success' | 'warning' }[]>([]);

  // Function to add dynamic floating banners/toast notifications
  const addNotification = (msg: string, type: 'success' | 'warning' = 'success') => {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    setNotifications(prev => [...prev, { id, msg, type }]);
    
    // Auto remove after 4.5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4500);
  };

  // Synchronizers
  const fetchProducts = async () => {
    try {
      const r = await fetch('/api/products');
      if (r.ok) {
        const data = await r.ok ? await r.json() : [];
        setProducts(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSalesAndAlerts = async () => {
    try {
      const [resSales, resAlerts] = await Promise.all([
        fetch('/api/sales'),
        fetch('/api/alerts')
      ]);

      if (resSales.ok) {
        const salesData = await resSales.json();
        setSales(salesData);
      }

      if (resAlerts.ok) {
        const alertsData = await resAlerts.json();
        setAlerts(alertsData);

        // Notify if there is an active unresolved low stock alert that was just loaded
        const unresolvedAlert = alertsData.filter((a: any) => !a.resolved);
        if (unresolvedAlert.length > 0) {
          // Play a silent notification or trigger warning banner logs
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const syncAllData = async () => {
    await Promise.all([fetchProducts(), fetchSalesAndAlerts()]);
    setIsLoading(false);
  };

  useEffect(() => {
    syncAllData();
    
    // Low cost automatic polling every 8 seconds to guarantee real-time feel between tabs
    const pollInterval = setInterval(() => {
      syncAllData();
    }, 8000);

    return () => clearInterval(pollInterval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col justify-between">
      
      {/* Top Header Navigation Panel */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 select-none shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Logo & Status branding */}
          <div className="flex flex-wrap items-center justify-between sm:justify-start gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8.5 h-8.5 bg-blue-500 rounded-lg flex items-center justify-center font-black text-white shadow-sm">
                GA
              </div>
              <div>
                <h1 className="font-extrabold text-base tracking-wide text-slate-900 flex items-center gap-1.5">
                  GrocerAI
                  <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded">
                    v2.0 Real-time
                  </span>
                </h1>
                <p className="text-[11px] text-slate-500 mt-0.5">ระบบจัดการร้านและวิเคราะห์สต็อกอัจฉริยะด้วย AI Live Agent</p>
              </div>
            </div>

            {/* Status Pill matching 'Sleek Interface' Design */}
            <div className="flex items-center gap-1.5 bg-[#dcfce7] border border-emerald-200/50 text-[#166534] px-3 py-1.5 rounded-full text-[11px] font-bold">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse inline-block"></span>
              AI Agent: กำลังทำงาน
            </div>
          </div>

          {/* Tab Button Panel */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 overflow-x-auto scrollbar-none font-medium text-xs border border-slate-200/50 self-start md:self-auto">
            <button
              id="tab-shop"
              onClick={() => setActiveTab('shop')}
              className={`px-3.5 py-2 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all duration-200 ${
                activeTab === 'shop'
                  ? 'bg-slate-900 text-white shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <ShoppingBag size={14} />
              หน้าร้าน & คุยกับ AI
            </button>

            <button
              id="tab-line"
              onClick={() => setActiveTab('line')}
              className={`px-3.5 py-2 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all duration-200 ${
                activeTab === 'line'
                  ? 'bg-slate-900 text-white shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <MessageSquare size={14} />
              ระบบจำลอง LINE OA
            </button>

            <button
              id="tab-admin"
              onClick={() => setActiveTab('admin')}
              className={`px-3.5 py-2 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all duration-200 relative ${
                activeTab === 'admin'
                  ? 'bg-slate-900 text-white shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <BarChart2 size={14} />
              จัดการสต็อก & แดชบอร์ด
              {alerts.some(a => !a.resolved) && (
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center font-bold font-mono">
                  !
                </span>
              )}
            </button>

            <button
              id="tab-sheets"
              onClick={() => setActiveTab('sheets')}
              className={`px-3.5 py-2 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all duration-200 ${
                activeTab === 'sheets'
                  ? 'bg-slate-900 text-white shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <FileSpreadsheet size={14} />
              วิเคราะห์วิเคราะห์ Google Sheets
            </button>
          </div>
        </div>
      </header>

      {/* Main Container Stage */}
      <main className="flex-1 py-6 relative">
        {isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3">
            <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs text-slate-400">กำลังเชื่อมต่อฐานข้อมูลสต็อกอิจฉริยะ...</p>
          </div>
        ) : (
          <div className="h-full">
            <AnimatePresence mode="wait">
              {activeTab === 'shop' && (
                <motion.div
                  key="shop"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  <CustomerStore 
                    products={products} 
                    refreshProducts={fetchProducts} 
                    onNewSale={syncAllData} 
                    addNotification={addNotification} 
                  />
                </motion.div>
              )}

              {activeTab === 'line' && (
                <motion.div
                  key="line"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  <LineSimulator 
                    products={products} 
                    refreshData={syncAllData} 
                    addNotification={addNotification} 
                  />
                </motion.div>
              )}

              {activeTab === 'admin' && (
                <motion.div
                  key="admin"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  <AdminPanel 
                    products={products} 
                    sales={sales} 
                    alerts={alerts} 
                    refreshData={syncAllData} 
                    addNotification={addNotification} 
                  />
                </motion.div>
              )}

              {activeTab === 'sheets' && (
                <motion.div
                  key="sheets"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  <OnlineSheet 
                    products={products} 
                    sales={sales} 
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Floating System Warnings or Success Alerts Stack */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none select-none font-sans">
        <AnimatePresence>
          {notifications.map((notif) => (
            <motion.div
              layout
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              id={`toaster-notif-${notif.id}`}
              key={notif.id}
              className={`p-3.5 rounded-2xl shadow-xl border flex items-start gap-2.5 pointer-events-auto ${
                notif.type === 'warning'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-slate-900 border-slate-800 text-white'
              }`}
            >
              {notif.type === 'warning' ? (
                <BadgeAlert size={18} className="text-rose-600 flex-shrink-0 mt-0.5" />
              ) : (
                <Sparkles size={18} className="text-[#fbbf24] flex-shrink-0 mt-0.5" />
              )}
              
              <div className="text-xs leading-relaxed">
                {notif.type === 'warning' && <span className="font-extrabold block mb-0.5">แจ้งเตือนระดับวิกฤต!</span>}
                {notif.msg}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Footer Branding strip */}
      <footer className="bg-slate-900 text-slate-500 text-[10px] text-center py-4 border-t border-slate-800 select-none">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <span>© 2026 ระบบร้านขายของชำอัจฉริยะ พี่ชำใจดี AI Agent. รักษาความปลอดภัยและปกป้องข้อมูลคลาวด์ 🛡️</span>
          <span>พัฒนาด้วย React 19 + Express + Gemini 3.5 Flash</span>
        </div>
      </footer>

    </div>
  );
}
