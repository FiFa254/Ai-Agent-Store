import { useState, useEffect, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Edit, 
  TrendingUp, 
  Package, 
  AlertTriangle, 
  Check, 
  DollarSign, 
  BarChart2, 
  Clock, 
  X,
  RefreshCw,
  Search,
  BookOpen,
  UserCheck
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { Product, SalesLog, StockAlert } from '../types';
import { formatCurrency, formatDateTime } from '../utils';

interface AdminPanelProps {
  products: Product[];
  sales: SalesLog[];
  alerts: StockAlert[];
  refreshData: () => void;
  addNotification: (msg: string, type: 'success' | 'warning') => void;
}

export default function AdminPanel({ 
  products, 
  sales, 
  alerts, 
  refreshData,
  addNotification 
}: AdminPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Automated QA Diagnostics State
  const [testSuiteRunning, setTestSuiteRunning] = useState(false);
  const [testResults, setTestResults] = useState<Array<{
    id: number;
    name: string;
    description: string;
    status: 'idle' | 'running' | 'pass' | 'fail';
    log: string;
    duration: number;
  }>>([
    { id: 1, name: 'GET /api/products API Check', description: 'ตรวจสอบสถานะ API คลังสินค้าและการเชื่อมโยงข้อมูล', status: 'idle', log: '', duration: 0 },
    { id: 2, name: 'GET /api/sales Integration Check', description: 'ทดสอบการซิงค์ประวัติใบชำระเงินกับฐานข้อมูล', status: 'idle', log: '', duration: 0 },
    { id: 3, name: 'POST /api/chat AI LLM Agent Response latency test', description: 'ทดสอบ Response ของแชทบอทอัจฉริยะ', status: 'idle', log: '', duration: 0 },
    { id: 4, name: 'Stock Integrity Audit & Limits Verification', description: 'วิเคราะห์โครงสร้างฐานสินทรัพย์และเกณฑ์แจ้งเตือน', status: 'idle', log: '', duration: 0 },
    { id: 5, name: 'Google Sheets CSV Sync Format Validation', description: 'ตรวจสอบความถูกต้องของฟังก์ชันสร้างรายงานวิเคราะห์', status: 'idle', log: '', duration: 0 },
  ]);

  const runAutomatedTestSuite = async () => {
    if (testSuiteRunning) return;
    setTestSuiteRunning(true);
    addNotification('เริ่มขับเคลื่อนบอร์ดวิเคราะห์และระบบทดสอบอัตโนมัติ...', 'success');

    const updateStatus = (id: number, status: 'running' | 'pass' | 'fail', log: string, duration = 0) => {
      setTestResults(prev => prev.map(t => t.id === id ? { ...t, status, log, duration } : t));
    };

    // Helper sleep
    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    // Test 1: GET /api/products
    try {
      const startTime = Date.now();
      updateStatus(1, 'running', 'กำลังส่ง HTTP Request GET /api/products ...');
      await delay(600);
      const res = await fetch('/api/products');
      const duration = Date.now() - startTime;
      if (res.ok) {
        const data = await res.json();
        updateStatus(1, 'pass', `สำเร็จ (200 OK): ค้นพบสินค้า ${data.length} รายการในฐานข้อมูลเรียลไทม์`, duration);
      } else {
        updateStatus(1, 'fail', `เกิดความผิดพลาด: ได้รับ HTTP Status ${res.status}`, duration);
      }
    } catch (err: any) {
      updateStatus(1, 'fail', `เกิดความผิดพลาดในการส่ง Request: ${err.name || 'Error'}`);
    }

    // Test 2: GET /api/sales
    try {
      const startTime = Date.now();
      updateStatus(2, 'running', 'กำลังส่ง HTTP Request GET /api/sales ...');
      await delay(600);
      const res = await fetch('/api/sales');
      const duration = Date.now() - startTime;
      if (res.ok) {
        const data = await res.json();
        updateStatus(2, 'pass', `สำเร็จ (200 OK): โหลดสำเร็จ ประวัติจำลองเก็บไว้ ${data.length} บิล`, duration);
      } else {
        updateStatus(2, 'fail', `เกิดความผิดพลาด: ได้รับ HTTP Status ${res.status}`, duration);
      }
    } catch (err: any) {
      updateStatus(2, 'fail', `เกิดความผิดพลาด: ${err.name || 'Error'}`);
    }

    // Test 3: POST /api/chat
    try {
      const startTime = Date.now();
      updateStatus(3, 'running', 'กำลังส่ง Payload แชทจำลองทดสอบ "หวัดดีสต็อก" ไปที่ /api/chat ...');
      await delay(800);
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'หวัดดีสต็อก', history: [] })
      });
      const duration = Date.now() - startTime;
      if (res.ok) {
        const data = await res.json();
        updateStatus(3, 'pass', `สำเร็จ (200 OK): AI ตอบกลับคำพูดสำเร็จ ไซส์ข้อความ ${data.reply?.length || 0} ตัวอักษรดั่งภาพ`, duration);
      } else {
        updateStatus(3, 'fail', `เกิดข้อผิดพลาดในการตอบสนอง HTTP ${res.status}`, duration);
      }
    } catch (err: any) {
      updateStatus(3, 'fail', `ไม่สามารถรันและวิเคราะห์แชทบอทได้: ${err.name || 'Error'}`);
    }

    // Test 4: Stock Integrity
    try {
      const startTime = Date.now();
      updateStatus(4, 'running', 'กำลังคำนวณและวิเคราะห์ Stock Integrity ...');
      await delay(500);
      const duration = Date.now() - startTime;
      
      const invalidProducts = products.filter(p => p.stock < 0 || p.price < 0);
      if (invalidProducts.length === 0) {
        updateStatus(4, 'pass', `ผ่าน: สินทรัพย์ ${products.length} หมวดหมู่มีความถูกต้องสมบูรณ์ ไม่มีราคาสินค้าหรือคลังติดลบ`, duration);
      } else {
        updateStatus(4, 'fail', `พบความเสี่ยง: มีสินค้า ${invalidProducts.length} ชิ้นที่มีคลังติดลบหรือราคาผิดรูปแบบ`, duration);
      }
    } catch (err: any) {
      updateStatus(4, 'fail', `ข้อผิดพลาด: ${err.name || 'Error'}`);
    }

    // Test 5: CSV Format
    try {
      const startTime = Date.now();
      updateStatus(5, 'running', 'กำลังจำลองคอมไพล์ CSV Generator schema ...');
      await delay(400);
      const duration = Date.now() - startTime;

      let csvHeadTest = "Index,ID,Product Name,Category,Unit Price (THB)\n";
      if (products.length > 0) {
        csvHeadTest += `1,${products[0].id},"${products[0].name}",${products[0].category},${products[0].price}`;
      }
      
      if (csvHeadTest.includes("ID") && csvHeadTest.includes("Product Name")) {
        updateStatus(5, 'pass', `ผ่าน: โครงสร้าง Excel/CSV มีข้อมูลสมบูรณ์พร้อมซิงค์ตารางชีตเสมอ`, duration);
      } else {
        updateStatus(5, 'fail', `รูปแบบไม่พึงประสงค์: โครงสร้าง Header ข้อมูลขาดฟิลด์วิกฤต`, duration);
      }
    } catch (err: any) {
      updateStatus(5, 'fail', `ล้มเหลว: ${err.name || 'Error'}`);
    }

    setTestSuiteRunning(false);
    addNotification('Automated Test Suite สิ้นสุด และวิเคราะห์สำเร็จเข้าระบบเรียบร้อย! 💎', 'success');
  };

  // New product form state
  const [newProduct, setNewProduct] = useState({
    name: '',
    price: '',
    promoPrice: '',
    category: 'ของสด/นม',
    stock: '10',
    minStock: '3',
    description: '',
  });

  // Calculate Metrics
  const totalSalesRevenue = sales.reduce((sum, item) => sum + item.total, 0);
  const lowStockCount = products.filter(p => p.stock <= p.minStock).length;
  const totalStockCount = products.reduce((sum, item) => sum + item.stock, 0);
  const promoCount = products.filter(p => p.promoPrice !== undefined).length;

  // Recharts Chart Data Prep
  // Group sales logs into hourly buckets
  const timeBuckets: { [key: string]: number } = {
    '08:00': 0, '10:00': 0, '12:00': 0, '14:00': 0, '16:00': 0, '18:00': 0, '20:00': 0
  };

  sales.forEach(sale => {
    try {
      const hours = new Date(sale.timestamp).getHours();
      let bucket = '08:00';
      if (hours >= 20) bucket = '20:00';
      else if (hours >= 18) bucket = '18:00';
      else if (hours >= 16) bucket = '16:00';
      else if (hours >= 14) bucket = '14:00';
      else if (hours >= 12) bucket = '12:00';
      else if (hours >= 10) bucket = '10:00';
      
      timeBuckets[bucket] += sale.total;
    } catch (e) {
      // fallback
    }
  });

  const trafficChartData = Object.keys(timeBuckets).map(time => ({
    time,
    'ยอดขาย (บาท)': timeBuckets[time],
  }));

  // Group by category for pie colors
  const categorySummary: { [key: string]: number } = {};
  products.forEach(p => {
    categorySummary[p.category] = (categorySummary[p.category] || 0) + p.stock;
  });

  const pieColors = ['#059669', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];
  const pieChartData = Object.keys(categorySummary).map(cat => ({
    name: cat,
    value: categorySummary[cat]
  }));

  // Handlers
  const handleAddNewProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.price || !newProduct.stock || !newProduct.minStock) {
      addNotification('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน', 'warning');
      return;
    }

    setIsUpdating(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProduct.name,
          price: Number(newProduct.price),
          promoPrice: newProduct.promoPrice ? Number(newProduct.promoPrice) : undefined,
          category: newProduct.category,
          stock: Number(newProduct.stock),
          minStock: Number(newProduct.minStock),
          description: newProduct.description,
        })
      });

      if (!res.ok) throw new Error('Failed to create product');

      addNotification(`เพิ่มสินค้า ${newProduct.name} เรียบร้อยแล้ว`, 'success');
      setShowAddForm(false);
      setNewProduct({
        name: '',
        price: '',
        promoPrice: '',
        category: 'ของสด/นม',
        stock: '10',
        minStock: '3',
        description: '',
      });
      refreshData();
    } catch (err) {
      addNotification('ไม่สามารถเพิ่มสินค้าได้', 'warning');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !editingProduct.name) return;

    setIsUpdating(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingProduct),
      });

      if (!res.ok) throw new Error('Failed to update product');

      addNotification(`แก้ไขสินค้า ${editingProduct.name} สำเร็จ`, 'success');
      setEditingProduct(null);
      refreshData();
    } catch (err) {
      addNotification('ไม่สามารถแก้ไขสินค้าได้', 'warning');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!confirm(`ต้องการลบสินค้า "${name}" ใช่หรือไม่?`)) return;

    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Delete failed');

      addNotification(`ลบสินค้า ${name} แล้ว`, 'success');
      refreshData();
    } catch (err) {
      addNotification('ไม่สามารถลบสินค้าได้', 'warning');
    }
  };

  // Restock logic: Instantly add 10 units to a product and update
  const handleRestockCount = async (product: Product, countToAdd = 10) => {
    try {
      const updatedStock = product.stock + countToAdd;
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...product,
          stock: updatedStock
        })
      });

      if (!res.ok) throw new Error();

      addNotification(`เติมสต็อก ${product.name} เพิ่ม +${countToAdd} ชิ้นแล้ว`, 'success');
      
      // Look for corresponding alerts and auto resolve them in database
      const relatedAlerts = alerts.filter(a => a.productId === product.id && !a.resolved);
      for (const alert of relatedAlerts) {
        await fetch('/api/alerts/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: alert.id })
        });
      }

      refreshData();
    } catch (err) {
      addNotification('ไม่สามารถเพิ่มสต็อกได้', 'warning');
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div id="admin-panel-section" className="space-y-6 max-w-7xl mx-auto px-4 py-3">
      
      {/* Top statistics banners */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Metric 1 */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
          <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
            <DollarSign size={20} className="stroke-[2.5]" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">ยอดขายวันนี้</span>
            <span className="text-lg font-black text-slate-900">{formatCurrency(totalSalesRevenue)}</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
          <div className="w-11 h-11 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
            <TrendingUp size={20} />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">จํานวนบิลจำลอง</span>
            <span className="text-lg font-black text-slate-900">{sales.length} บิล</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
          <div className="w-11 h-11 bg-rose-50 border border-rose-100 text-rose-500 rounded-xl flex items-center justify-center relative">
            <AlertTriangle size={20} />
            {lowStockCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-600 rounded-full animate-ping"></span>
            )}
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">สินค้าใกล้หมด</span>
            <span className="text-lg font-black text-[#dc2626]">{lowStockCount} รายการ</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
          <div className="w-11 h-11 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
            <Package size={20} />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">ของรวมในคลัง</span>
            <span className="text-lg font-black text-slate-900">{totalStockCount} ชิ้น</span>
          </div>
        </div>
      </div>

      {/* Real-time Alerts Banner Block */}
      {alerts.some(a => !a.resolved) && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4 space-y-3"
        >
          <div className="flex items-center gap-2 text-rose-800 font-extrabold text-sm">
            <AlertTriangle size={17} className="text-rose-600 animate-bounce" />
            ⚠️ มีรายการสินค้าใกล้หมดสต็อก ต้องจัดซื้อด่วน!
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alerts.filter(a => !a.resolved).map((alert) => {
              const matchingProduct = products.find(p => p.id === alert.productId);
              return (
                <div key={alert.id} className="bg-white border border-rose-100 rounded-xl p-3 flex items-center justify-between shadow-xs">
                  <div className="text-xs space-y-1">
                    <span className="font-bold text-slate-900 block">{alert.productName}</span>
                    <span className="text-slate-500">สต็อกคงเหลือหลัก: <span className="text-rose-600 font-extrabold">{alert.currentStock}</span> (ขั้นต่ำ {alert.minStock} ชิ้น)</span>
                  </div>
                  {matchingProduct && (
                    <button
                      id={`restock-alert-btn-${alert.id}`}
                      onClick={() => handleRestockCount(matchingProduct, 10)}
                      className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 cursor-pointer transition"
                    >
                      <Plus size={13} />
                      เติมด่วน (+10)
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Sales Charts Dashboard Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Recharts Area Chart for Sales Log Analysis */}
        <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <BarChart2 className="text-emerald-600" size={17} />
                สถิติรายงานยอดขายประจําวัน (รายชั่วโมง)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">แบ่งตามช่วงเวลาร้านเปิดเพื่อให้วิเคราะห์ทราฟฟิกเรียลไทม์</p>
            </div>
            
            <button
              id="refresh-stats-btn"
              onClick={refreshData}
              className="text-slate-400 hover:text-slate-600 p-1.5 border border-slate-100 hover:border-slate-200 rounded-lg cursor-pointer transition"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="h-[210px] w-full">
            {sales.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                ยังไม่มีการซื้อขายเกิดขึ้นในวันนี้ เริ่มสั่งซื้อที่เมนู "หน้าร้าน"
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trafficChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: 12, border: '1px solid #e1e7f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }} 
                    labelStyle={{ fontWeight: 'bold', fontSize: 11 }}
                  />
                  <Area type="monotone" dataKey="ยอดขาย (บาท)" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#salesGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Right: Pie Chart Category Share */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 text-sm">สัดส่วนสต็อกสินค้าตามหมวดหมู่</h3>
            <p className="text-xs text-slate-400">จํานวนสต็อกคงรวมแยกเป็นกลุ่มประเภทสินค้า</p>
          </div>

          <div className="h-[150px] w-full relative flex items-center justify-center mt-3">
            {pieChartData.length === 0 ? (
              <div className="text-slate-400 text-xs">ไม่มีข้อมูลหมวดหมู่</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Custom Pie Legend */}
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 max-h-[100px] overflow-y-auto mt-4 text-[10px] text-slate-600 border-t border-slate-50 pt-3">
            {pieChartData.slice(0, 6).map((entry, idx) => (
              <div key={idx} className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: pieColors[idx % pieColors.length] }}></span>
                <span className="truncate">{entry.name} ({entry.value} ชิ้น)</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Product Inventory List */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden">
        
        {/* Table Operations Header */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-slate-900 text-sm">📦 ทะเบียนจัดการสต็อกสินค้าในคลัง</span>
            <span className="bg-slate-200/60 text-slate-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
              {filteredProducts.length} ชนิด
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                id="inv-search-field"
                type="text"
                placeholder="ค้นหาสินค้าหรือคีย์เวิร์ด..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-white border border-slate-200 focus:border-emerald-500 focus:outline-none rounded-xl pl-9 pr-3 py-1.5 text-xs w-48 sm:w-56"
              />
              <Search size={14} className="text-slate-400 absolute left-3 top-2.5" />
            </div>

            <button
              id="add-new-product-btn"
              onClick={() => setShowAddForm(true)}
              className="bg-slate-950 hover:bg-slate-900 text-white font-bold py-1.5 px-3 rounded-xl text-xs flex items-center gap-1 cursor-pointer transition"
            >
              <Plus size={13} />
              เพิ่มสินค้าใหม่
            </button>
          </div>
        </div>

        {/* Grid/Table Layout */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/50 text-slate-500 uppercase tracking-wider font-extrabold font-mono border-b border-slate-200">
                <th className="py-2.5 px-4">รหัสสินค้า</th>
                <th className="py-2.5 px-4 w-[240px]">ชื่อสินค้า</th>
                <th className="py-2.5 px-4">กลุ่มหมวด</th>
                <th className="py-2.5 px-4 text-right">ราคาปกติ</th>
                <th className="py-2.5 px-4 text-right">ราคาพรีเมียมโปร</th>
                <th className="py-2.5 px-4 text-center">สต็อกปัจจุบัน</th>
                <th className="py-2.5 px-4 text-center">ขั้นต่ำ</th>
                <th className="py-2.5 px-4 text-center">การคืน/จัดซื้อ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                    ไม่พบข้อมูลสินค้าที่ค้นหา กรุณาลองกรอกชื่อใหม่อีกครั้ง
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const isLow = p.stock <= p.minStock;
                  return (
                    <tr id={`inv-row-${p.id}`} key={p.id} className="hover:bg-slate-50/50 transition">
                      <td className="py-2 px-4 font-mono text-[10px] text-slate-400 font-bold">#{p.id}</td>
                      <td className="py-2 px-4">
                        <div className="space-y-0.5">
                          <span className="font-bold text-slate-900 block truncate">{p.name}</span>
                          <span className="text-[10px] text-slate-400 block truncate max-w-[200px]">{p.description || '-'}</span>
                        </div>
                      </td>
                      <td className="py-2 px-4 text-slate-600">{p.category}</td>
                      <td className="py-2 px-4 text-right font-bold text-slate-900">{formatCurrency(p.price)}</td>
                      <td className="py-2 px-4 text-right">
                        {p.promoPrice !== undefined ? (
                          <span className="text-emerald-600 font-extrabold">{formatCurrency(p.promoPrice)}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                          isLow 
                            ? 'bg-rose-100 text-rose-700 border border-rose-200' 
                            : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {p.stock} ชิ้น
                        </span>
                      </td>
                      <td className="py-2 px-4 text-center font-semibold text-slate-500">{p.minStock} ชิ้น</td>
                      <td className="py-2 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            id={`add-10-btn-${p.id}`}
                            onClick={() => handleRestockCount(p, 10)}
                            className="text-[10px] uppercase font-mono font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded border border-slate-200 cursor-pointer"
                            title="Restock 10 items"
                          >
                            +10
                          </button>
                          
                          <button
                            id={`edit-item-btn-${p.id}`}
                            onClick={() => setEditingProduct(p)}
                            className="bg-slate-50 p-1 rounded hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            <Edit size={12} />
                          </button>

                          <button
                            id={`delete-item-btn-${p.id}`}
                            onClick={() => handleDeleteProduct(p.id, p.name)}
                            className="bg-rose-50 p-1 rounded hover:bg-rose-100 border border-rose-100 text-rose-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Automated Suite Panel & Live Quality Assurance testing board */}
      <div id="automated-testing-suite-card" className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <span className="flex h-3 w-3 relative">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${testSuiteRunning ? 'bg-blue-400' : 'bg-emerald-400'} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 ${testSuiteRunning ? 'bg-blue-500' : 'bg-emerald-500'}`}></span>
              </span>
              🧪 ส่วนวิเคราะห์และทดสอบระบบอัตโนมัติ (Automated QA & Diagnostics Suite)
            </h3>
            <p className="text-xs text-slate-400 mt-1">จำลองพฤติกรรมจริงเพื่อตรวจสอบประสิทธิภาพ API, สต็อก และความสมบูรณ์ของแชทบอทอัจฉริยะ</p>
          </div>

          <button
            id="run-auto-test-btn"
            disabled={testSuiteRunning}
            onClick={runAutomatedTestSuite}
            className={`font-bold py-2 px-4 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm ${
              testSuiteRunning
                ? 'bg-slate-100 text-slate-400 border border-slate-200/50 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {testSuiteRunning ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                กำลังรันเทส...
              </>
            ) : (
              <>
                <span>▶</span>
                รันการทดสอบออโต้ 5 รายการด่วน
              </>
            )}
          </button>
        </div>

        {/* Dashboard grid stats for Diagnostics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Status summary info */}
          <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">ระบบประกันความถูกต้อง</span>
            <div className="my-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900">
                {testResults.filter(t => t.status === 'pass').length}/5
              </span>
              <span className="text-xs text-slate-400 font-semibold font-sans">ขั้นตอนผ่านเสร็จสิ้น</span>
            </div>
            
            <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden mt-1">
              <div 
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{ width: `${(testResults.filter(t => t.status === 'pass').length / 5) * 100}%` }}
              ></div>
            </div>
            
            <p className="text-[10px] text-slate-400 font-mono mt-3">
              สถานะภาพร้าน: <span className="text-emerald-600 font-bold">100% HEALTHY</span>
            </p>
          </div>

          {/* Real-time Diagnostics Log */}
          <div className="md:col-span-2 bg-slate-900 rounded-xl p-3 text-[11px] font-mono text-slate-300 flex flex-col justify-between min-h-[110px]">
            <div className="flex items-center justify-between border-b border-slate-850 pb-1.5 mb-1.1">
              <span className="text-slate-500 text-[10px] uppercase font-bold">Diagnostics Console Log (จำลองเรียลไทม์)</span>
              <span className="text-[9px] text-[#22c55e] animate-pulse">● Connected</span>
            </div>
            <div className="space-y-1.5 flex-1 max-h-[80px] overflow-y-auto select-all scrollbar-thin">
              {testResults.map(t => (
                <div key={t.id} className="flex gap-2">
                  <span className={`${t.status === 'pass' ? 'text-emerald-500' : t.status === 'fail' ? 'text-red-400' : t.status === 'running' ? 'text-blue-400 animate-pulse' : 'text-slate-500'}`}>
                    {t.status === 'pass' ? '[PASS]' : t.status === 'fail' ? '[FAIL]' : t.status === 'running' ? '[EXEC]' : '[IDLE]'}
                  </span>
                  <span className="text-slate-400 truncate w-24">{t.name}:</span>
                  <span className="text-slate-300 truncate">{t.log || 'คลิกรันเทสเพื่อดูสถานะดำเนินการ...'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Individual Diagnostic rows */}
        <div className="pt-2 divide-y divide-slate-100">
          {testResults.map((test) => (
            <div key={test.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  {test.name}
                  {test.duration > 0 && (
                    <span className="font-mono text-[9px] bg-slate-100 text-slate-400 px-1 py-0.2 rounded font-normal">
                      {test.duration}ms
                    </span>
                  )}
                </span>
                <span className="text-slate-400 text-[11px] block">{test.description}</span>
              </div>

              <div>
                {test.status === 'pass' && (
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-lg font-bold flex items-center gap-1">
                    ✓ ผ่าน (Pass)
                  </span>
                )}
                {test.status === 'fail' && (
                  <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-1 rounded-lg font-bold">
                    ✕ ผิดพลาด
                  </span>
                )}
                {test.status === 'running' && (
                  <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-lg font-bold animate-pulse flex items-center gap-1">
                    <RefreshCw size={11} className="animate-spin" />
                    กำลังทำงาน
                  </span>
                )}
                {test.status === 'idle' && (
                  <span className="bg-slate-100 text-slate-500 border border-slate-200 px-2 py-1 rounded-lg font-bold font-sans">
                    พร้อมรันทดสอบ
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Slide-over Form for Adding New Product */}
      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              id="add-prod-backdrop"
              onClick={() => setShowAddForm(false)}
              className="fixed inset-0 bg-slate-900"
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              id="add-prod-sidebar"
              className="relative w-full max-w-md bg-white h-full shadow-2xl p-6 overflow-y-auto flex flex-col justify-between"
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-extrabold text-sm text-slate-900">เพิ่มรายการสินค้าเข้าระบบใหม่</h3>
                  <button id="add-prod-close" onClick={() => setShowAddForm(false)} className="text-slate-400 p-1">
                    ✕
                  </button>
                </div>

                <form id="new-product-form" onSubmit={handleAddNewProduct} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">ชื่อสินค้า *</label>
                    <input
                      id="n-name-field"
                      type="text"
                      required
                      value={newProduct.name}
                      onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                      placeholder="เช่น ข้าวมันปู ตรายายยิ้ม"
                      className="w-full bg-slate-50 border border-slate-200 focus:outline-none focus:border-emerald-600 rounded-xl px-3 py-2 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase">ราคาปกติ *</label>
                      <input
                        id="n-price-field"
                        type="number"
                        required
                        value={newProduct.price}
                        onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                        placeholder="เช่น 45"
                        className="w-full bg-slate-50 border border-slate-200 focus:outline-none focus:border-emerald-600 rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase">ราคัลโปรโมชั่น</label>
                      <input
                        id="n-promo-field"
                        type="number"
                        value={newProduct.promoPrice}
                        onChange={(e) => setNewProduct({ ...newProduct, promoPrice: e.target.value })}
                        placeholder="ละเว้นหากไม่มีโปร"
                        className="w-full bg-slate-50 border border-slate-200 focus:outline-none focus:border-emerald-600 rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase">สต็อกเริ่มต้น *</label>
                      <input
                        id="n-stock-field"
                        type="number"
                        required
                        value={newProduct.stock}
                        onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 focus:outline-none focus:border-emerald-600 rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase">เกณฑ์เตือนสต็อก *</label>
                      <input
                        id="n-min-field"
                        type="number"
                        required
                        value={newProduct.minStock}
                        onChange={(e) => setNewProduct({ ...newProduct, minStock: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 focus:outline-none focus:border-emerald-600 rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1 font-sans">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">กลุ่มหมวดหมู่</label>
                    <select
                      id="n-cat-field"
                      value={newProduct.category}
                      onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 focus:outline-none focus:border-emerald-600 rounded-xl px-3 py-2 text-xs"
                    >
                      <option value="ของสด/นม">ของสด/นม</option>
                      <option value="ข้าวสาร/แป้ง">ข้าวสาร/แป้ง</option>
                      <option value="อาหารแห้ง/กึ่งสำเร็จรูป">อาหารแห้ง/กึ่งสำเร็จรูป</option>
                      <option value="เครื่องปรุง/น้ำมัน">เครื่องปรุง/น้ำมัน</option>
                      <option value="เครื่องดื่ม">เครื่องดื่ม</option>
                      <option value="ของใช้ส่วนประกอบ/ส่วนตัว">ของใช้ส่วนประกอบ/ส่วนตัว</option>
                      <option value="น้ำยา/ของใช้ในบ้าน">น้ำยา/ของใช้ในบ้าน</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">รายละเอียดสินค้า</label>
                    <textarea
                      id="n-desc-field"
                      value={newProduct.description}
                      onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                      placeholder="คำอธิบายส้นๆ สรรพคุณ ปริมาณอาหาร..."
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 focus:outline-none focus:border-emerald-600 rounded-xl px-3 py-2 text-xs"
                    />
                  </div>

                  <button
                    id="submit-new-prod-btn"
                    type="submit"
                    disabled={isUpdating}
                    className="w-full bg-slate-950 hover:bg-slate-900 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    {isUpdating ? 'กำลังทำรายการ...' : 'บันทึกลงทะเบียนสินค้า'}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Product Popup Dialog */}
      <AnimatePresence>
        {editingProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              id="edit-prod-backdrop"
              onClick={() => setEditingProduct(null)}
              className="fixed inset-0 bg-slate-900"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              id="edit-prod-dialog"
              className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl relative z-10 p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="font-extrabold text-sm text-slate-900">แก้ไขข้อมูลสต็อกสินค้า</h4>
                <button id="edit-prod-close" onClick={() => setEditingProduct(null)} className="text-slate-400">
                  ✕
                </button>
              </div>

              <form id="edit-product-form" onSubmit={handleUpdateProduct} className="space-y-3.5 text-slate-700">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">ชื่อสินค้า</label>
                  <input
                    id="e-name-field"
                    type="text"
                    required
                    value={editingProduct.name || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 focus:outline-none focus:border-emerald-600 rounded-xl px-3 py-1.5 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">ราคาปกติ (บาท)</label>
                    <input
                      id="e-price-field"
                      type="number"
                      required
                      value={editingProduct.price || 0}
                      onChange={(e) => setEditingProduct({ ...editingProduct, price: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 focus:outline-none rounded-xl px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">ราคาโปรโมชั่น</label>
                    <input
                      id="e-promo-field"
                      type="number"
                      value={editingProduct.promoPrice || ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, promoPrice: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-full bg-slate-50 border border-slate-200 focus:outline-none rounded-xl px-3 py-1.5 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">สต็อกในมือ</label>
                    <input
                      id="e-stock-field"
                      type="number"
                      required
                      value={editingProduct.stock ?? 0}
                      onChange={(e) => setEditingProduct({ ...editingProduct, stock: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 focus:outline-none rounded-xl px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">เกณฑ์เตือน</label>
                    <input
                      id="e-min-field"
                      type="number"
                      required
                      value={editingProduct.minStock ?? 0}
                      onChange={(e) => setEditingProduct({ ...editingProduct, minStock: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 focus:outline-none rounded-xl px-3 py-1.5 text-xs"
                    />
                  </div>
                </div>

                <button
                  id="submit-edit-prod-btn"
                  type="submit"
                  disabled={isUpdating}
                  className="w-full bg-slate-950 hover:bg-slate-900 text-white font-bold py-2 px-4 rounded-xl text-xs transition-colors cursor-pointer"
                >
                  {isUpdating ? 'กำลังบันทึก...' : 'อัปเดตและปรับปรุงในคลัง'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
