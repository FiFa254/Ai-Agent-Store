import { useState } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  Search, 
  Grid, 
  Database, 
  FileText, 
  Calculator,
  ExternalLink
} from 'lucide-react';
import { Product, SalesLog } from '../types';
import { formatCurrency, formatDateTime } from '../utils';

interface OnlineSheetProps {
  products: Product[];
  sales: SalesLog[];
}

export default function OnlineSheet({ products, sales }: OnlineSheetProps) {
  const [activeTab, setActiveTab] = useState<'sales' | 'inventory'>('sales');
  const [sheetSearch, setSheetSearch] = useState('');

  // Calculate stats for Formula Bar
  const totalFormulaRevenue = sales.reduce((sum, s) => sum + s.total, 0);
  const totalItemsCount = products.reduce((sum, p) => sum + p.stock, 0);
  const numRows = activeTab === 'sales' ? sales.length : products.length;

  // Formula string helper for realistic formula display
  const formulaString = activeTab === 'sales'
    ? `=SUM(E2:E${sales.length + 1})`
    : `=AVERAGE(D2:D${products.length + 1})`;

  const formulaResultValue = activeTab === 'sales'
    ? formatCurrency(totalFormulaRevenue)
    : `${(totalItemsCount / products.length || 0).toFixed(1)} ชิ้น/ชนิด`;

  // CSV Exporter
  const exportToCsv = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    
    if (activeTab === 'sales') {
      csvContent += "Index,Transaction ID,Timestamp,Payment Method,Items Sold Count,Total Paid (THB)\n";
      sales.forEach((s, idx) => {
        const itemsSummary = s.items.map(it => `${it.name}(x${it.quantity})`).join('; ');
        csvContent += `${idx + 1},${s.id},"${formatDateTime(s.timestamp)}",${s.paymentMethod},${s.items.length},${s.total}\n`;
      });
    } else {
      csvContent += "Index,ID,Product Name,Category,Unit Price (THB),Promo Price (THB),Current Stock (qty),Safety Limit (qty)\n";
      products.forEach((p, idx) => {
        csvContent += `${idx + 1},${p.id},"${p.name}",${p.category},${p.price},${p.promoPrice || '-'},${p.stock},${p.minStock}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", activeTab === 'sales' ? "grocery_sales_log_sheet.csv" : "grocery_inventory_sheet.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter keys
  const filteredSales = sales.filter(s => 
    s.id.toLowerCase().includes(sheetSearch.toLowerCase()) ||
    s.items.some(i => i.name.toLowerCase().includes(sheetSearch.toLowerCase())) ||
    s.paymentMethod.toLowerCase().includes(sheetSearch.toLowerCase())
  );

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(sheetSearch.toLowerCase()) ||
    p.category.toLowerCase().includes(sheetSearch.toLowerCase()) ||
    p.id.toLowerCase().includes(sheetSearch.toLowerCase())
  );

  return (
    <div id="online-sheet-section" className="space-y-4 max-w-7xl mx-auto px-4 py-3">
      
      {/* Spreadsheet Header Controller */}
      <div className="bg-emerald-800 text-white p-4 rounded-t-2xl shadow-md border-b border-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold">
            <FileSpreadsheet size={20} />
          </div>
          <div>
            <h2 className="font-extrabold text-sm tracking-wide flex items-center gap-2">
              Google Sheets Real-time Sync Hub
              <span className="bg-green-400/20 text-green-300 text-[9px] font-mono border border-green-500/30 px-2 py-0.5 rounded-full uppercase">
                Synchronized
              </span>
            </h2>
            <p className="text-[11px] text-emerald-200 mt-0.5">ตารางวิเคราะห์ยอดขายและคลังสินค้า สานต่อคําสั่งบอร์ดคลาวด์แบบเรียลไทม์</p>
          </div>
        </div>

        {/* Action controllers */}
        <div className="flex items-center gap-2">
          {/* Tabs selectors styled like Sheets tabs */}
          <div className="bg-emerald-950/40 p-1 rounded-xl flex items-center gap-1 border border-emerald-700/30 text-xs font-semibold">
            <button
              id="sheet-sales-tab"
              onClick={() => {
                setActiveTab('sales');
                setSheetSearch('');
              }}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition ${
                activeTab === 'sales'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-emerald-100 hover:text-white'
              }`}
            >
              <FileText size={13} />
              ทะเบียนบิลยอดขาย
            </button>
            <button
              id="sheet-inventory-tab"
              onClick={() => {
                setActiveTab('inventory');
                setSheetSearch('');
              }}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all ${
                activeTab === 'inventory'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-emerald-100 hover:text-white'
              }`}
            >
              <Database size={13} />
              ทะเบียนคลังสินค้า
            </button>
          </div>

          <button
            id="csv-download-btn"
            onClick={exportToCsv}
            className="bg-yellow-400 hover:bg-yellow-500 text-slate-900 font-extrabold py-2 px-3.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-md transition"
          >
            <Download size={14} />
            ดาวน์โหลด CSV
          </button>
        </div>
      </div>

      {/* Realistic Google Sheets Command formula and Search Bar */}
      <div className="bg-slate-100 border-x border-slate-200 p-2 text-xs flex flex-wrap items-center gap-2 font-mono">
        {/* FX calculator indicator */}
        <div className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded text-[11px] text-slate-500 font-bold min-w-[70px]">
          <Calculator size={12} className="text-emerald-600" />
          <span>F(x)</span>
        </div>

        <div className="bg-white border border-slate-200 rounded px-2.5 py-1 text-slate-700 font-mono text-[11px] flex-1 min-w-[200px] flex items-center justify-between">
          <span className="text-slate-400">{formulaString}</span>
          <span className="font-bold text-slate-900 border-l border-slate-100 pl-2.5 text-xs text-emerald-700 select-all">{formulaResultValue}</span>
        </div>

        <div className="relative">
          <input
            id="sheet-filter-field"
            type="text"
            placeholder="ฟิลเตอร์ช่องเซลล์..."
            value={sheetSearch}
            onChange={(e) => setSheetSearch(e.target.value)}
            className="bg-white border border-slate-200 focus:outline-none focus:border-emerald-600 rounded px-8 py-1 text-xs w-48 font-sans"
          />
          <Search size={13} className="text-slate-400 absolute left-2.5 top-2" />
        </div>
      </div>

      {/* The Sheets Grid */}
      <div className="bg-white border border-slate-200 shadow-inner overflow-hidden rounded-b-2xl">
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-left border-collapse font-mono text-[11px]">
            <thead>
              {/* Spreadsheet letters row */}
              <tr className="bg-slate-50 text-slate-400 border-b border-slate-200 text-center select-none divide-x divide-slate-200">
                <th className="py-1 px-2 bg-slate-100 font-bold w-10">/</th>
                <th className="py-1 px-3">A</th>
                <th className="py-1 px-3">B</th>
                <th className="py-1 px-3">C</th>
                <th className="py-1 px-3">D</th>
                <th className="py-1 px-3">E</th>
                <th className="py-1 px-3">F</th>
                {activeTab === 'inventory' && <th className="py-1 px-3 animate-fade-in">G</th>}
              </tr>
              
              {/* Spreadsheet headers */}
              {activeTab === 'sales' ? (
                <tr className="bg-slate-200/50 text-slate-700 border-b border-slate-200 select-none divide-x divide-slate-200">
                  <td className="p-2 bg-slate-100 text-center font-bold text-slate-400">1</td>
                  <td className="p-2 font-bold font-sans">Transaction ID (รหัสบิล)</td>
                  <td className="p-2 font-bold font-sans">Timestamp (วันเวลาจัดซื้อ)</td>
                  <td className="p-2 font-bold font-sans">Payment Method (ช่องทาง)</td>
                  <td className="p-2 font-bold font-sans">Items Count (จํานวนชนิด)</td>
                  <td className="p-2 font-bold font-sans text-right">Total Net (ยอดชำระสุทธิ)</td>
                  <td className="p-2 font-bold font-sans">Items Detail (รายชื่อสินค้าปัดยักษ์)</td>
                </tr>
              ) : (
                <tr className="bg-slate-200/50 text-slate-700 border-b border-slate-200 select-none divide-x divide-slate-200">
                  <td className="p-2 bg-slate-100 text-center font-bold text-slate-400">1</td>
                  <td className="p-2 font-bold font-sans">Product ID (รหัสสต็อก)</td>
                  <td className="p-2 font-bold font-sans">Product Name (ชื่อสินค้า)</td>
                  <td className="p-2 font-bold font-sans">Category (กลุ่มหมวด)</td>
                  <td className="p-2 font-bold font-sans text-right">Standard Price (ราคาปกติ)</td>
                  <td className="p-2 font-bold font-sans text-right">Promo Price (ราคาโปรราคาลด)</td>
                  <td className="p-2 font-bold font-sans text-center">Current Stock (คงเหลือ)</td>
                  <td className="p-2 font-bold font-sans text-center">Safety Limit (จุดเตือนหมด)</td>
                </tr>
              )}
            </thead>
            
            {/* Spreadsheet Body */}
            <tbody>
              {activeTab === 'sales' ? (
                filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 font-sans">
                      ไม่มีแถวข้อมูลในตารางบิลประวัติขณะนี้
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((sale, idx) => (
                    <tr key={sale.id} className="divide-x divide-slate-100 border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="p-2 bg-slate-50 text-center font-bold text-slate-400 select-none">{idx + 2}</td>
                      <td className="p-2 text-slate-900 font-bold truncate max-w-[120px]" title={sale.id}>{sale.id}</td>
                      <td className="p-2 text-slate-500">{formatDateTime(sale.timestamp)}</td>
                      <td className="p-2 capitalize font-semibold text-slate-700">{sale.paymentMethod === 'promptpay' ? 'QR พร้อมเพย์' : 'เงินสดหน้าร้าน'}</td>
                      <td className="p-2 text-center text-slate-800">{sale.items.length} รายการ</td>
                      <td className="p-2 text-right font-extrabold text-emerald-700 bg-emerald-50/20">{formatCurrency(sale.total)}</td>
                      <td className="p-2 text-slate-400 text-[10px] truncate max-w-[150px]" title={sale.items.map(it => `${it.name}(x${it.quantity})`).join(', ')}>
                        {sale.items.map(it => `${it.name} (x${it.quantity})`).join(', ')}
                      </td>
                    </tr>
                  ))
                )
              ) : (
                filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-sans">
                      ไม่มีสต็อกสินค้าในตารางคลังขณะนี้
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p, idx) => (
                    <tr key={p.id} className="divide-x divide-slate-100 border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="p-2 bg-slate-50 text-center font-bold text-slate-400 select-none">{idx + 2}</td>
                      <td className="p-2 text-slate-500 font-bold">{p.id}</td>
                      <td className="p-2 text-slate-950 font-bold">{p.name}</td>
                      <td className="p-2 text-slate-500">{p.category}</td>
                      <td className="p-2 text-right text-slate-800 font-semibold">{formatCurrency(p.price)}</td>
                      <td className="p-2 text-right">
                        {p.promoPrice !== undefined ? (
                          <span className="text-emerald-700 font-black">{formatCurrency(p.promoPrice)}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className={`p-2 text-center font-bold font-mono ${p.stock <= p.minStock ? 'text-red-600 bg-red-50' : 'text-emerald-700'}`}>
                        {p.stock} ชิ้น
                      </td>
                      <td className="p-2 text-center text-slate-400">{p.minStock} ชิ้น</td>
                    </tr>
                  ))
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Online sheet info footer strip card */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3 font-sans">
        <span className="flex items-center gap-1.5 leading-none">
          <Grid size={13} className="text-slate-400" />
          แถวข้อมูลทะเบียนซิงค์เสร็จสิ้น <span>({numRows + 1} แถวรวมหัวข้อ)</span>
        </span>
        <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-bold">
          <ExternalLink size={11} />
          จำลองฐานข้อมูล Firestore Cloud อัตโนมัติ เพื่อรักษาข้อมูลอย่างมีเสถียรภาพสูงสุด
        </span>
      </div>

    </div>
  );
}
