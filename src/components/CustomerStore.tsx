import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShoppingBag, 
  Sparkles, 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  ArrowRight, 
  Send, 
  QrCode, 
  BadgeAlert, 
  CheckCircle, 
  Check,
  ChevronRight,
  Package,
  Bookmark,
  Store,
  Lightbulb
} from 'lucide-react';
import { Product, CartItem, Message } from '../types';
import { formatCurrency, formatDateTime, generatePromptPayQrSvg } from '../utils';

interface CustomerStoreProps {
  products: Product[];
  refreshProducts: () => void;
  onNewSale: () => void;
  addNotification: (msg: string, type: 'success' | 'warning') => void;
}

export default function CustomerStore({ 
  products, 
  refreshProducts, 
  onNewSale, 
  addNotification 
}: CustomerStoreProps) {
  // Navigation & filter categories
  const categories = ['ทั้งหมด', 'ของสด/นม', 'ข้าวสาร/แป้ง', 'อาหารแห้ง/กึ่งสำเร็จรูป', 'เครื่องปรุง/น้ำมัน', 'เครื่องดื่ม', 'ของใช้ในบ้าน/ส่วนตัว'];
  const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด');
  
  // Shopping Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  
  // Checkout & Payment states
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'promptpay' | 'cash'>('promptpay');
  const [checkoutResult, setCheckoutResult] = useState<any>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // AI Chat states
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: 'สวัสดีค่ะพี่ชำใจดี ยินดีต้อนรับค่ะ! วันนี้มีข้าวหอมมะลิและแชมพูลดราคาเป็นพิเศษนะคะ อยากให้ช่วยเช็กสต็อกสินค้าตัว哪 หรือมีคำถามอะไรสอบถามได้เลยค่ะ 😊',
      timestamp: new Date().toISOString(),
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Quick Chat Suggestion prompts
  const quickPrompts = [
    { label: 'มีโปรโมชั่นอะไรบ้าง?', text: 'วันนี้พี่ยังมีโค้ดส่วนลดหรือสินค้าโปรโมชั่นชิ้นไหนที่แนะบ้างคะ?' },
    { label: 'แนะนำทำต้มยำโป๊ะแตก', text: 'อยากทำเมนูต้มยำกุ้งแกงส้ม มีวัตถุดิอะไรบ้าง แนะนำให้หน่อยค่ะ' },
    { label: 'มีข้าวสารในสต็อกไหม?', text: 'ข้าวหอมมะลิตอนนี้หมดหรือยังคะ เหลือสต็อกกี่ชิ้น?' },
  ];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiTyping]);

  // Sync Products list
  const filteredProducts = selectedCategory === 'ทั้งหมด' 
    ? products 
    : products.filter(p => p.category === selectedCategory || (selectedCategory === 'ของใช้ในบ้าน/ส่วนตัว' && (p.category === 'ของใช้ส่วนประกอบ/ส่วนตัว' || p.category === 'น้ำยา/ของใช้ในบ้าน')));

  // Adding product to cart
  const addToCart = (product: Product, quantity = 1) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        const newQty = Math.min(product.stock, existing.quantity + quantity);
        if (newQty === existing.quantity) {
          addNotification(`สินค้า ${product.name} สูงสุดเท่าสต็อกที่มีอยู่แล้ว`, 'warning');
          return prev;
        }
        addNotification(`เพิ่ม ${product.name} ลงตะกร้าแล้ว`, 'success');
        return prev.map(item => item.product.id === product.id ? { ...item, quantity: newQty } : item);
      }
      addNotification(`เพิ่ม ${product.name} ลงตะกร้าแล้ว`, 'success');
      return [...prev, { product, quantity: Math.min(product.stock, quantity) }];
    });
  };

  const updateCartQty = (productId: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.product.id === productId) {
          const matchedProd = products.find(p => p.id === productId);
          const maxStock = matchedProd ? matchedProd.stock : 99;
          const newQty = Math.max(1, Math.min(maxStock, item.quantity + delta));
          return { ...item, quantity: newQty };
        }
        return item;
      });
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
    addNotification('นำสินค้าออกจากตะกร้าแล้ว', 'success');
  };

  const cartTotal = cart.reduce((total, item) => {
    const price = item.product.promoPrice !== undefined ? item.product.promoPrice : item.product.price;
    return total + (price * item.quantity);
  }, 0);

  // Send message to server-side AI Agent
  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    const userMsg: Message = {
      id: `msg_${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsAiTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: messages.slice(-8) // Send a snapshot of history
        })
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const resData = await response.json();
      
      const botMsg: Message = {
        id: `msg_${Date.now()}_bot`,
        sender: 'bot',
        text: resData.reply,
        timestamp: new Date().toISOString(),
        type: 'text'
      };

      // Process automatic cart injection if Gemini detected explicit purchase request
      if (resData.detectedCartItems && resData.detectedCartItems.length > 0) {
        resData.detectedCartItems.forEach((item: any) => {
          const matchedProduct = products.find(p => p.id === item.productId);
          if (matchedProduct) {
            addToCart(matchedProduct, item.quantity);
          }
        });
        
        botMsg.type = 'receipt';
        botMsg.receiptData = {
          items: resData.detectedCartItems.map((item: any) => {
            const prod = products.find(p => p.id === item.productId);
            return {
              name: prod?.name || 'สินค้า',
              qty: item.quantity,
              price: prod ? (prod.promoPrice ?? prod.price) : 0
            };
          }),
          total: resData.detectedCartItems.reduce((acc: number, item: any) => {
            const prod = products.find(p => p.id === item.productId);
            const actualPrice = prod ? (prod.promoPrice ?? prod.price) : 0;
            return acc + (actualPrice * item.quantity);
          }, 0)
        };
      }

      setMessages(prev => [...prev, botMsg]);

      // If promotional recommendation is triggered by AI
      if (resData.recommendPromotions && resData.recommendPromotions.length > 0) {
        const promoDetails = resData.recommendPromotions
          .map((item: any) => products.find(p => p.id === item.productId))
          .filter(Boolean);

        if (promoDetails.length > 0) {
          setMessages(prev => [...prev, {
            id: `msg_${Date.now()}_promo`,
            sender: 'bot',
            text: 'พี่แนะนำสินค้าโปรโมชั่นพิเศษเหล่านี้ช่วงนี้ลดราคาคุ้มมากเลยค่ะ!',
            type: 'promo',
            timestamp: new Date().toISOString(),
            promoData: promoDetails.map((p: any) => ({
              id: p.id,
              name: p.name,
              originalPrice: p.price,
              promoPrice: p.promoPrice ?? p.price,
              description: p.description
            }))
          }]);
        }
      }

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: `msg_${Date.now()}_error`,
        sender: 'bot',
        text: 'ขออภัยนะคะสัญญาณขัดข้องชั่วครู่ ไม่สามารถติดต่อ AI ได้ ลองพิมพ์ทวนใหม่อีกครั้งค่ะ 🙏',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsAiTyping(false);
    }
  };

  // Checkout process
  const triggerCheckout = async () => {
    if (cart.length === 0) return;
    
    setIsProcessingPayment(true);
    setCheckoutModalOpen(true);
    setPaymentSuccess(false);

    try {
      const checkoutItems = cart.map(item => ({
        productId: item.product.id,
        quantity: item.quantity
      }));

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: checkoutItems,
          paymentMethod
        })
      });

      if (!res.ok) {
        const errDetails = await res.json();
        throw new Error(errDetails.error || 'Checkout checkout failed');
      }

      const checkoutData = await res.json();
      setCheckoutResult(checkoutData.sale);

      if (paymentMethod === 'cash') {
        // Cash payment immediately succeeds
        setTimeout(() => {
          setIsProcessingPayment(false);
          setPaymentSuccess(true);
          setCart([]);
          onNewSale();
          refreshProducts();
          addNotification('สั่งซื้อสินค้าด้วยเงินสดเสร็จสิ้น!', 'success');
        }, 1500);
      } else {
        // QR code waiting
        setIsProcessingPayment(false);
      }
    } catch (err: any) {
      setIsProcessingPayment(false);
      setCheckoutModalOpen(false);
      addNotification(err.message || 'ตรวจพบบางส่วนไม่ถูกต้อง กรุณาลองใหม่', 'warning');
    }
  };

  // Simulated QR scan confirmation
  const confirmQrCodePayment = () => {
    setIsProcessingPayment(true);
    setTimeout(() => {
      setIsProcessingPayment(false);
      setPaymentSuccess(true);
      setCart([]);
      onNewSale();
      refreshProducts();
      addNotification('ชำระเงินผ่าน PromptPay QR Code สำเร็จแล้ว!', 'success');
    }, 2000);
  };

  // Build svg path for dynamic QR code image
  const qrSvgDetails = checkoutResult ? generatePromptPayQrSvg(checkoutResult.total) : null;

  return (
    <div id="customer-store-section" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start h-full max-w-7xl mx-auto px-4 py-3">
      
      {/* Catalog Grid Area - Left Column */}
      <div className="lg:col-span-7 space-y-6">
        
        {/* Banner with Promo */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-radial from-slate-900 to-slate-950 text-white rounded-2xl p-5 shadow-xl relative overflow-hidden border border-slate-800"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 rounded-full blur-2xl"></div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 bg-yellow-500/25 border border-yellow-500/30 text-yellow-300 px-2 py-0.5 rounded-full text-xs font-semibold w-fit mb-2">
                <Sparkles size={13} />
                โปรโมชั่นสัปดาห์นี้
              </div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">ร้านโชห่วยยุคใหม่ อัจฉริยะ 🤖</h1>
              <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                สต็อกอัปเดตเรียลไทม์ ชำระเงินด้วย QR Code ทันที และมีแชทบอทช่วยแนะนำสินค้า คัดสรรวัตถุดิบแม่นยำ
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ShoppingBag size={48} className="text-yellow-400 opacity-80" />
            </div>
          </div>
        </motion.div>

        {/* Category selector */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {categories.map((cat, idx) => (
            <button
              id={`cat-btn-${idx}`}
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredProducts.map((p) => {
              const isLowStock = p.stock <= p.minStock;
              const hasPromo = p.promoPrice !== undefined;
              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  id={`product-card-${p.id}`}
                  key={p.id}
                  className="bg-white rounded-2xl border border-slate-200/85 shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col justify-between relative"
                >
                  {/* Badges overlay */}
                  <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
                    {hasPromo && (
                      <span className="bg-yellow-400 text-slate-900 px-2.5 py-0.5 rounded-full text-xs font-bold shadow-sm">
                        ลดราคาพิเศษ
                      </span>
                    )}
                    {isLowStock && (
                      <span className="bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1">
                        <BadgeAlert size={12} />
                        เหลือแกะกล่อง {p.stock}
                      </span>
                    )}
                  </div>

                  <div>
                    {/* Render a beautiful placeholder category header */}
                    <div className="h-28 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 overflow-hidden mb-3 relative">
                      <Package className="text-slate-300 w-12 h-12" />
                      <span className="absolute bottom-2 right-2 text-[10px] font-mono text-slate-400 bg-white border border-slate-100 px-1.5 py-0.5 rounded bg-opacity-90">
                        {p.category}
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-800 text-sm leading-snug line-clamp-1">{p.name}</h3>
                    <p className="text-slate-500 text-xs mt-1 min-h-8 line-clamp-2">{p.description || 'ไม่มีรายละเอียดสินค้า'}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex flex-col">
                      {hasPromo ? (
                        <>
                          <span className="text-xs text-slate-400 line-through">{formatCurrency(p.price)}</span>
                          <span className="text-lg font-extrabold text-emerald-600">{formatCurrency(p.promoPrice!)}</span>
                        </>
                      ) : (
                        <span className="text-lg font-extrabold text-slate-900">{formatCurrency(p.price)}</span>
                      )}
                    </div>

                    <button
                      id={`add-cart-btn-${p.id}`}
                      disabled={p.stock <= 0}
                      onClick={() => addToCart(p)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        p.stock <= 0
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm'
                      }`}
                    >
                      <Plus size={14} />
                      {p.stock <= 0 ? 'หมดชั่วคราว' : 'หยิบใส่ตะกร้า'}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* AI Assistant Chat Panel - Right Column */}
      <div className="lg:col-span-5 flex flex-col h-[600px] border border-slate-200 rounded-2xl bg-slate-50 shadow-sm overflow-hidden">
        
        {/* Chat UI Header */}
        <div className="bg-slate-900 text-white py-3.5 px-4 flex items-center justify-between shadow">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-emerald-500 text-slate-900 rounded-xl flex items-center justify-center font-bold relative animate-pulse">
              🤖
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 border-2 border-slate-900 rounded-full"></span>
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-wide">พี่ชำใจดี </h3>
              <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                <span>●</span> AI ตรวจเช็กสต็อกและแนะนำโปร
              </p>
            </div>
          </div>

          <button 
            id="view-cart-btn-header"
            onClick={() => setShowCartDrawer(true)}
            className="bg-slate-800 hover:bg-slate-700 p-2 rounded-xl text-yellow-300 flex items-center gap-1.5 transition cursor-pointer relative"
          >
            <ShoppingCart size={17} />
            {cart.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">
                {cart.reduce((s, c) => s + c.quantity, 0)}
              </span>
            )}
          </button>
        </div>

        {/* Message Container streams */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={msg.id || i} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
              <div 
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm text-sm ${
                  msg.sender === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-none'
                    : 'bg-white text-slate-800 rounded-bl-none border border-slate-100'
                }`}
              >
                <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                
                {/* Embedded Structured Prompt Cards inside chat bubbles */}
                {msg.type === 'receipt' && msg.receiptData && (
                  <div className="mt-3 pt-3 border-t border-slate-100 bg-slate-50 rounded-xl p-3 text-slate-800">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-slate-700 mb-2">
                      <Bookmark size={13} />
                      รายการสรุปจากพี่ชำ
                    </div>
                    <div className="space-y-1.5 text-xs">
                      {msg.receiptData.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>{it.name} x{it.qty}</span>
                          <span className="font-semibold">{formatCurrency(it.price * it.qty)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-200 flex justify-between font-bold text-sm">
                      <span>ยอดสุทธิ:</span>
                      <span className="text-emerald-700">{formatCurrency(msg.receiptData.total)}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2 text-center">สินค้าทั้งหมดได้เพิ่มลงตะกร้าให้แล้วค่ะ 🛒</p>
                  </div>
                )}

                {msg.type === 'promo' && msg.promoData && (
                  <div className="mt-3 space-y-2.5">
                    {msg.promoData.map((promo, idx) => (
                      <div key={idx} className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-2.5 text-slate-800 shadow-sm flex flex-col gap-1.5">
                        <div className="text-xs font-bold text-amber-800">{promo.name}</div>
                        <div className="text-[11px] text-slate-600 leading-snug">{promo.description}</div>
                        <div className="flex items-center justify-between mt-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] line-through text-slate-400">{formatCurrency(promo.originalPrice)}</span>
                            <span className="text-xs font-bold text-emerald-600">{formatCurrency(promo.promoPrice)}</span>
                          </div>
                          <button
                            id={`ai-promo-add-btn-${idx}`}
                            onClick={() => {
                              const found = products.find(p => p.id === (promo as any).id);
                              if (found) addToCart(found);
                            }}
                            className="bg-amber-500 hover:bg-amber-600 text-slate-900 border-none rounded-lg px-2 py-1 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <ShoppingCart size={11} />
                            ดึงเข้าตะกร้า
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 px-1">
                {new Date(msg.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}

          {isAiTyping && (
            <div className="flex items-center gap-1.5 text-slate-400 text-xs scale-90 self-start">
              <span className="animate-bounce">●</span>
              <span className="animate-bounce [animation-delay:0.2s]">●</span>
              <span className="animate-bounce [animation-delay:0.4s]">●</span>
              <span>พี่ชำกำลังคนหาข้อมูลสินค้า...</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Suggested templates */}
        <div className="p-2.5 bg-slate-100 flex items-center gap-1.5 overflow-x-auto scrollbar-none border-t border-slate-200">
          <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider flex items-center gap-1 whitespace-nowrap">
            <Lightbulb size={12} className="text-yellow-500" />
            คำค้นหาง่ายๆ:
          </span>
          {quickPrompts.map((q, idx) => (
            <button
              id={`chat-prompt-${idx}`}
              key={idx}
              onClick={() => handleSendMessage(q.text)}
              className="px-2.5 py-1 text-[11px] bg-white border border-slate-200 text-slate-700 rounded-full hover:bg-slate-50 transition cursor-pointer whitespace-nowrap shadow-xs"
            >
              {q.label}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form 
          id="ai-chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage(inputValue);
          }}
          className="bg-white p-3 border-t border-slate-200 flex items-center gap-2"
        >
          <input
            id="chat-input-field"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="พิมพ์ถามของในสต็อก, โปรโมชั่น, ค้นหาอะไรดี..."
            className="flex-1 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none rounded-xl px-3 py-2 text-sm"
          />
          <button
            id="chat-submit-btn"
            type="submit"
            disabled={!inputValue.trim()}
            className={`p-2.5 rounded-xl flex items-center justify-center transition cursor-pointer ${
              inputValue.trim()
                ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Send size={16} />
          </button>
        </form>
      </div>

      {/* Cart Drawer layout - Animated overlay slide */}
      <AnimatePresence>
        {showCartDrawer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              id="cart-drawer-backdrop"
              onClick={() => setShowCartDrawer(false)}
              className="fixed inset-0 bg-black z-40"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              id="cart-drawer"
              className="fixed right-0 top-0 bottom-0 w-full sm:w-96 bg-white shadow-2xl z-50 flex flex-col justify-between"
            >
              <div>
                {/* Header */}
                <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <ShoppingCart className="text-emerald-600" size={18} />
                    ตะกร้าสินค้าของคุณ ({cart.reduce((s, c) => s + c.quantity, 0)})
                  </h3>
                  <button 
                    id="close-cart-btn"
                    onClick={() => setShowCartDrawer(false)}
                    className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* Items List */}
                <div className="p-4 space-y-4 max-h-[calc(100vh-270px)] overflow-y-auto">
                  {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-3">
                      <ShoppingBag size={48} className="stroke-1 text-slate-300" />
                      <p className="text-sm">ไม่มีสินค้าในตะกร้า เริ่มซื้อของกันเลย!</p>
                      <button
                        id="explore-shop-btn"
                        onClick={() => setShowCartDrawer(false)}
                        className="text-xs text-emerald-600 font-semibold underline cursor-pointer"
                      >
                        ปิดหน้านี้เพื่อเลือกซื้อสินค้า
                      </button>
                    </div>
                  ) : (
                    cart.map((item) => {
                      const truePrice = item.product.promoPrice ?? item.product.price;
                      return (
                        <div key={item.product.id} className="flex items-start gap-3 border-b border-slate-100 pb-3">
                          <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100 flex-shrink-0 text-slate-500">
                            📦
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-slate-800 text-xs truncate">{item.product.name}</h4>
                            <p className="text-[11px] text-emerald-600 font-bold mt-0.5">{formatCurrency(truePrice)}</p>
                            
                            <div className="flex items-center gap-2 mt-2">
                              <button
                                id={`cart-minus-${item.product.id}`}
                                onClick={() => updateCartQty(item.product.id, -1)}
                                className="w-6 h-6 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 cursor-pointer"
                              >
                                <Minus size={11} />
                              </button>
                              <span className="text-xs font-semibold w-5 text-center text-slate-800">{item.quantity}</span>
                              <button
                                id={`cart-plus-${item.product.id}`}
                                onClick={() => updateCartQty(item.product.id, 1)}
                                className="w-6 h-6 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 cursor-pointer"
                              >
                                <Plus size={11} />
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <span className="font-bold text-slate-950 text-xs">
                              {formatCurrency(truePrice * item.quantity)}
                            </span>
                            <button
                              id={`cart-remove-${item.product.id}`}
                              onClick={() => removeFromCart(item.product.id)}
                              className="text-slate-400 hover:text-rose-500 p-1 cursor-pointer transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Footer Total & Checkout */}
              {cart.length > 0 && (
                <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-4 shadow-inner">
                  <div className="space-y-1.5 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>ยอดราคารวม</span>
                      <span className="font-semibold text-slate-800">{formatCurrency(cartTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>ภาษีมูลค่าเพิ่ม (VAT 7%)</span>
                      <span className="text-slate-400">คำนวณรวมแล้ว</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-200 text-sm font-bold text-slate-900">
                      <span>ยอดชำระทั้งสิ้น:</span>
                      <span className="text-emerald-700 text-base">{formatCurrency(cartTotal)}</span>
                    </div>
                  </div>

                  {/* Payment Method Selectors */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      id="opt-pay-qr"
                      type="button"
                      onClick={() => setPaymentMethod('promptpay')}
                      className={`py-2 px-3 border rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                        paymentMethod === 'promptpay'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <QrCode size={14} />
                      PromptPay QR
                    </button>
                    <button
                      id="opt-pay-cash"
                      type="button"
                      onClick={() => setPaymentMethod('cash')}
                      className={`py-2 px-3 border rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                        paymentMethod === 'cash'
                          ? 'border-slate-800 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Store size={14} />
                      เงินสดหน้าร้าน
                    </button>
                  </div>

                  <button
                    id="submit-checkout-btn"
                    onClick={triggerCheckout}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/15"
                  >
                    <span>สั่งซื้อและจ่ายเงินทันที</span>
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Checkout / PromptPay QR Modal */}
      <AnimatePresence>
        {checkoutModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              id="modal-backdrop"
              onClick={() => {
                if (!isProcessingPayment) setCheckoutModalOpen(false);
              }}
              className="fixed inset-0 bg-slate-950"
            />

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              id="payment-modal-card"
              className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative z-10 border border-slate-100 flex flex-col"
            >
              {/* Top PromptPay Branding header */}
              <div className="bg-[#002f6c] text-white py-4 px-6 flex flex-col items-center justify-center text-center relative">
                <h3 className="font-extrabold text-sm tracking-wider uppercase">Thai QR Payment</h3>
                <div className="mt-1 flex items-center gap-1 text-[11px] bg-sky-900/40 border border-sky-400/20 px-2.5 py-0.5 rounded-full font-medium">
                  💳 พร้อมเพย์ (PromptPay)
                </div>
                {!isProcessingPayment && !paymentSuccess && (
                  <button
                    id="close-modal-btn"
                    onClick={() => setCheckoutModalOpen(false)}
                    className="absolute top-3 right-4 text-slate-300 hover:text-white font-semibold"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Modal Body */}
              <div className="p-6 text-center flex flex-col items-center justify-center">
                {isProcessingPayment ? (
                  <div className="py-12 space-y-4">
                    <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="text-sm font-semibold text-slate-600">กำลังทำรายการ บันทึกยอดขายและปรับปรุงสต็อก...</p>
                  </div>
                ) : paymentSuccess ? (
                  <div className="py-8 space-y-4 flex flex-col items-center animate-fade-in">
                    <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                      <CheckCircle size={40} className="stroke-2" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-slate-900">ชำระเงินสำเร็จแล้ว! 🎉</h4>
                      <p className="text-xs text-slate-500 mt-1">ยอดโอนสำเร็จสุทธิ {formatCurrency(checkoutResult?.total || 0)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 text-left w-full text-xs text-slate-700 space-y-1">
                      <div>บิลเลขที่: <span className="font-mono font-bold text-slate-800">{checkoutResult?.id}</span></div>
                      <div>วันเวลา: <span>{checkoutResult && formatDateTime(checkoutResult.timestamp)}</span></div>
                      <div>ช่องทาง: <span className="capitalize font-semibold text-slate-900">{checkoutResult?.paymentMethod === 'promptpay' ? 'พร้อมเพย์ QR' : 'เงินสด'}</span></div>
                    </div>
                    <button
                      id="close-success-btn"
                      onClick={() => setCheckoutModalOpen(false)}
                      className="w-full bg-slate-950 hover:bg-slate-900 text-white font-bold py-2.5 px-4 rounded-xl text-xs cursor-pointer transition-colors"
                    >
                      กลับไปหน้าหลัก
                    </button>
                  </div>
                ) : (
                  // Displaying authentic static payload-generated QR pattern
                  <div className="space-y-4 w-full">
                    <div className="space-y-1">
                      <span className="text-xs text-slate-500">จดทะเบียนในชื่อ: พี่ยามดี ร้านของชำด่วน</span>
                      <h2 className="text-2xl font-extrabold text-slate-900">{formatCurrency(checkoutResult?.total || 0)}</h2>
                    </div>

                    {/* Highly authentic PromptPay QR Container */}
                    <div className="relative border-4 border-[#002f6c] p-4 rounded-2xl bg-white shadow-inner max-w-[210px] mx-auto flex flex-col items-center justify-center">
                      {qrSvgDetails && (
                        <svg 
                          viewBox="0 0 25 25" 
                          className="w-full h-full stroke-none" 
                          style={{ shapeRendering: 'crispEdges' }}
                        >
                          <path d={qrSvgDetails.svgPath} fill="#0d1b2a" />
                        </svg>
                      )}
                      <div className="absolute inset-0 m-auto w-10 h-10 bg-white border border-slate-200 rounded flex items-center justify-center overflow-hidden">
                        <span className="text-[10px] font-bold text-[#002f6c]">TH QR</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs text-slate-500">แสกนภาพ QR Code ด้านบนเพื่อส่งยอดและจำลองการจ่ายเงิน</p>
                      
                      <button
                        id="confirm-pay-qr-btn"
                        onClick={confirmQrCodePayment}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/10"
                      >
                        <Check size={14} />
                        จำลองสแกนจ่ายสำเร็จ (กดเพื่อแจ้งบิล)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
