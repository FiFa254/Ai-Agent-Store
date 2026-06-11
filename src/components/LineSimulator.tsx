import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Menu, 
  User, 
  Sparkles, 
  Package, 
  Tag, 
  Compass, 
  Grid,
  Search,
  Volume2,
  Image as ImageIcon,
  Smile,
  PlusCircle,
  Clock,
  MoreHorizontal
} from 'lucide-react';
import { Message, Product } from '../types';
import { formatCurrency } from '../utils';

interface LineSimulatorProps {
  products: Product[];
  refreshData: () => void;
  addNotification: (msg: string, type: 'success' | 'warning') => void;
}

export default function LineSimulator({ products, refreshData, addNotification }: LineSimulatorProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'l_1',
      sender: 'bot',
      text: 'ยินดีต้อนรับสู่ LINE Official Account ของ "ร้านโชห่วยยุคใหม่ พี่ชำใจดี" ค่ะ! 📢\n\nพี่ยินดีดูแลตรวจเช็กสต็อกสินค้า แนะนำเมนูอัจฉริยะ หรือแสดงโปรล่าสุดให้ทราบทันทีโดยตรงจากฐานข้อมูลหลังร้าน คุยกับ AI ได้เลยค่ะ!',
      timestamp: new Date().toISOString()
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleLineSendMessage = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    const userMsg: Message = {
      id: `l_user_${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: messages.slice(-6)
        })
      });

      if (!response.ok) throw new Error();

      const resData = await response.json();

      const botMsg: Message = {
        id: `l_bot_${Date.now()}`,
        sender: 'bot',
        text: resData.reply,
        timestamp: new Date().toISOString(),
        type: 'text'
      };

      if (resData.detectedCartItems && resData.detectedCartItems.length > 0) {
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

      // If active promotional cards recommended
      if (resData.recommendPromotions && resData.recommendPromotions.length > 0) {
        const promoDetails = resData.recommendPromotions
          .map((item: any) => products.find(p => p.id === item.productId))
          .filter(Boolean);

        if (promoDetails.length > 0) {
          setMessages(prev => [...prev, {
            id: `l_promo_${Date.now()}`,
            sender: 'bot',
            text: 'พี่แนะนำสินค้าโปรโมชั่นลดราคาพิเศษสุดคุ้มในระบบขณะนี้ค่ะ!',
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
      setMessages(prev => [...prev, {
        id: `l_err_${Date.now()}`,
        sender: 'bot',
        text: 'ขอประทานโทษด้วยค่ะ การเชื่อมต่อคลังหลังร้าน LINE OA ขัดข้องกรุณาลองพิมพ์ใหม่อีกครั้งนะคะ',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  // Click on the smart Line Quick Rich Menus
  const handleRichMenuClick = (menuType: string) => {
    addNotification(`คลิกเมนู LINE Quick Reply: ${menuType}`, 'success');
    
    if (menuType === 'promo') {
      handleLineSendMessage('เช็กรายการโปรโมชั่นและส่วนลดเด็ดๆ ในระบบตอนนี้หน่อยค่ะ');
    } else if (menuType === 'stocks') {
      handleLineSendMessage('มีของอะไรในสต็อกแนะนำบ้างคะ ช่วยรายงานสต็อกให้ที');
    } else if (menuType === 'tomyum') {
      handleLineSendMessage('อยากทำต้มยำกุ้งกินเย็นนี้ ช่วยดึงส่วนผสมใส่ตะกร้าให้หน่อยค่ะ');
    }
  };

  return (
    <div id="line-simulator-section" className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center max-w-7xl mx-auto px-4 py-3">
      
      {/* Visual Instruction card - Left Column */}
      <div className="space-y-5">
        <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="text-3xl">🟢</span>
            <div>
              <h3 className="font-extrabold text-slate-800 text-sm"> LINE OA Live Simulator</h3>
              <p className="text-xs text-slate-500 mt-1">สมาร์ทโฟนจําลองการเชื่อมต่อสต็อกคลาวด์ผ่าน LINE Chat API</p>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed font-sans">
            ผู้ซื้อมักสั่งของผ่าน Line ทางร้านจึงพัฒนา <b>LINE OA 🤖</b> ระบบใหม่นี้ขึ้นเพื่อช่วยให้ลูกค้าสามารถคุยเช็กสต็อก แนะนำราคาและ
            <b>ดึงของใส่บิลสรุปยอดอัตโนมัติ (Detected Cart Items)</b> ได้ด้วยระบบ AI อัจฉริยะ 
          </p>

          <div className="space-y-2 border-t border-emerald-100 pt-3.5 text-xs text-slate-600">
            <div className="font-bold text-slate-800">💡 สิ่งที่คุณทดสอบเล่นได้ในจำลอง LINE OA:</div>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>พิมพ์: <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">"ข้าวมะลิเหลืออยู่กี่ถุง"</span> เพื่อตรวจสอบสต็อกในคลัง</li>
              <li>พิมพ์: <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">"บะหมี่ 5 ถุง และสบู่เดทตอล 2 ก้อน"</span> เพื่อจำลองดึงบิลและสรุปยอด</li>
              <li>คลิก <b>"Rich Menu สีเขียวด้านล่าง"</b> ของโทรศัพท์ เพื่อสั่งความรวดเร็ว</li>
            </ul>
          </div>
        </div>

        {/* Sync telemetry information indicator */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-bold text-sm">⚡</div>
          <p className="text-[11px] text-slate-500 leading-snug">
            วิทยากร: AI จะสแกนคลังสินค้าเรียลไทม์ 10 ชนิดในหลังบ้านทันทีเมื่อตรวจสอบความถูกต้อง ไม่มีขั้นตอนล่าช้าเลย!
          </p>
        </div>
      </div>

      {/* LINE OA Smartphone Mockup - Right Column */}
      <div className="flex justify-center">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-[340px] h-[580px] bg-[#06141d] rounded-[3rem] p-3.5 shadow-2xl border-4 border-slate-800/90 relative flex flex-col overflow-hidden"
        >
          {/* Smartphone top camera pill notch */}
          <div className="absolute top-5 left-1/2 -translate-x-1/2 w-24 h-4 bg-slate-900 rounded-full z-30 flex items-center justify-center gap-1">
            <div className="w-1.5 h-1.5 bg-slate-600 rounded-full"></div>
            <div className="w-8 h-1 bg-slate-800 rounded-full"></div>
          </div>

          {/* Screen Content area */}
          <div className="flex-1 bg-[#849fc3] rounded-[2.3rem] flex flex-col justify-between overflow-hidden relative border border-slate-900/50">
            
            {/* LINE Header */}
            <div className="bg-[#2a3a4c] text-white py-2.5 px-3.5 pt-7 flex items-center justify-between shadow-md relative z-10">
              <div className="flex items-center gap-2">
                <span className="text-slate-300 font-bold text-xs">❮</span>
                <div className="w-7 h-7 bg-green-500 text-slate-900 rounded-lg flex items-center justify-center font-extrabold text-[12px]">
                  Smart
                </div>
                <div>
                  <h4 className="font-bold text-[12px] truncate max-w-[120px]">โชห่วยยุคใหม่ AI OA</h4>
                  <p className="text-[9px] text-green-400">● มีเจ้าหน้าที่ AI บิลเร็ว</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2.5 text-slate-300">
                <Search size={14} />
                <Menu size={14} />
              </div>
            </div>

            {/* Chat Messages flow area */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3.5 pb-20 select-text">
              {messages.map((m) => (
                <div key={m.id} className={`flex items-start gap-2 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.sender === 'bot' && (
                    <div className="w-6 h-6 bg-green-500 text-slate-900 rounded-md flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-1">
                      🤖
                    </div>
                  )}

                  <div className="flex flex-col max-w-[80%]">
                    {/* Message Bubble styled like Line App bubbles */}
                    <div 
                      className={`rounded-2xl px-3 py-2 text-xs shadow-xs relative ${
                        m.sender === 'user'
                          ? 'bg-[#5bf45b] text-slate-900 rounded-tr-none'
                          : 'bg-white text-slate-800 rounded-tl-none'
                      }`}
                    >
                      {/* Triangle pointer indicator */}
                      <span className={`absolute top-0 w-0 h-0 border-[5px] border-transparent ${
                        m.sender === 'user' 
                          ? 'right-[-5px] border-l-[#5bf45b] border-t-[#5bf45b]' 
                          : 'left-[-5px] border-r-white border-t-white'
                      }`} />

                      <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>

                      {/* Line Receipt Message design */}
                      {m.type === 'receipt' && m.receiptData && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-100 bg-slate-50 rounded-xl p-2.5 text-slate-800">
                          <div className="text-[10px] font-bold text-slate-500 mb-1">🤖 LINE บิลสรุปยอดอัตโนมัติ</div>
                          <div className="space-y-1 text-[10px]">
                            {m.receiptData.items.map((it, idx) => (
                              <div key={idx} className="flex justify-between">
                                <span>{it.name} x{it.qty}</span>
                                <span className="font-semibold">{formatCurrency(it.price * it.qty)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 pt-1 border-t border-slate-200 flex justify-between font-extrabold text-[11px] text-emerald-700">
                            <span>รวมทั้งหมด:</span>
                            <span>{formatCurrency(m.receiptData.total)}</span>
                          </div>
                          <p className="text-[8px] text-slate-400 mt-1.5 text-center lowercase">ระบบสั่งพิมพ์สลิปและปรับสต็อกเรียบร้อยแล้วค่ะ</p>
                        </div>
                      )}

                      {/* Line Promo Carousel design */}
                      {m.type === 'promo' && m.promoData && (
                        <div className="mt-2.5 space-y-2">
                          {m.promoData.map((pr, idx) => (
                            <div key={idx} className="bg-amber-50 border border-amber-100 rounded-lg p-2 text-slate-800 space-y-1">
                              <span className="font-bold text-[10px] text-amber-800 block truncate">{pr.name}</span>
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] text-slate-400 line-through">{formatCurrency(pr.originalPrice)}</span>
                                <span className="text-[10px] font-bold text-emerald-600">{formatCurrency(pr.promoPrice)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* Timestamp below line bubble */}
                    <span className="text-[8px] text-slate-500/90 mt-0.5 self-start px-0.5">
                      {new Date(m.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex items-center gap-1 bg-white/75 rounded-full px-2.5 py-1 w-fit text-[9px] text-slate-500 animate-pulse">
                  <span>●</span><span>●</span><span>●</span>
                  <span>AI กำลังตรวจสต็อก...</span>
                </div>
              )}
              <div ref={scrollRef} />
            </div>

            {/* Bottom Keyboard & Rich-Menus panel */}
            <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col">
              
              {/* Quick Action Rich-Menus button bar */}
              <div className="grid grid-cols-3 bg-[#1e2531] border-t border-slate-700/60 text-white text-[10px] font-semibold text-center select-none py-1.5 shadow-inner">
                <button
                  id="rich-menu-promo"
                  onClick={() => handleRichMenuClick('promo')}
                  className="flex flex-col items-center justify-center gap-0.5 py-1 hover:bg-slate-800 border-r border-slate-800 cursor-pointer"
                >
                  <Tag size={13} className="text-yellow-400" />
                  <span>ดูโปรขายดี</span>
                </button>
                <button
                  id="rich-menu-stocks"
                  onClick={() => handleRichMenuClick('stocks')}
                  className="flex flex-col items-center justify-center gap-0.5 py-1 hover:bg-slate-800 border-r border-slate-800 cursor-pointer"
                >
                  <Package size={13} className="text-emerald-400" />
                  <span>รายงานสต็อก</span>
                </button>
                <button
                  id="rich-menu-tomyum"
                  onClick={() => handleRichMenuClick('tomyum')}
                  className="flex flex-col items-center justify-center gap-0.5 py-1 hover:bg-slate-800 cursor-pointer"
                >
                  <Compass size={13} className="text-sky-400 animate-pulse" />
                  <span>ของทำต้มยำ</span>
                </button>
              </div>

              {/* LINE Standard Input Panel */}
              <form
                id="line-chat-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleLineSendMessage(input);
                }}
                className="bg-white px-2 py-1.5 flex items-center gap-1.5 border-t border-slate-200"
              >
                <div className="text-slate-400 flex items-center gap-1 text-[11px] font-bold">
                  <span>+</span>
                  <span>📷</span>
                </div>
                
                <input
                  id="line-chat-input"
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="ถามเช็กสต็อกสินค้าทันที..."
                  className="flex-1 bg-slate-50 border border-slate-200 focus:outline-none focus:border-green-500 rounded-lg px-2.5 py-1 text-xs"
                />
                
                <button
                  id="line-chat-send"
                  type="submit"
                  disabled={!input.trim()}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    input.trim() ? 'bg-green-500 text-slate-900' : 'text-slate-300'
                  }`}
                >
                  <Send size={12} />
                </button>
              </form>

            </div>

          </div>
        </motion.div>
      </div>

    </div>
  );
}
