import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { 
  Activity, 
  Newspaper, 
  CheckCircle2, 
  XCircle,
  RefreshCw, 
  ChevronUp, 
  ChevronDown, 
  Brain,
  History
} from 'lucide-react';

const socket = io('http://localhost:5000');

const companyNames = {
  AAPL: 'Apple Inc.',
  TSLA: 'Tesla Inc.',
  GOOGL: 'Alphabet Inc.',
  AMZN: 'Amazon Inc.',
  MSFT: 'Microsoft Corp.',
  NVDA: 'Nvidia Corp.',
  META: 'Meta Platforms',
  NFLX: 'Netflix Inc.',
  AMD: 'Advanced Micro Devices',
  COIN: 'Coinbase Global'
};

// SVG Sparkline Component
function Sparkline({ history, isUp }) {
  if (!history || history.length < 2) {
    return (
      <div className="h-6 flex items-center justify-center text-[10px] text-[#B2B5BE] font-sans font-medium">
        Awaiting ticks
      </div>
    );
  }
  
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min === 0 ? 1 : max - min;
  
  const points = history.map((price, idx) => {
    const x = (idx * (100 / (history.length - 1))).toFixed(1);
    const y = (26 - ((price - min) / range) * 18 - 4).toFixed(1);
    return `${x},${y}`;
  }).join(' ');
  
  const strokeColor = isUp ? '#089981' : '#F23645';

  return (
    <svg className="w-full h-6 overflow-visible" viewBox="0 0 100 26" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

// Detailed Area Chart Component
function DetailedChart({ history, isUp }) {
  if (!history || history.length < 2) {
    return (
      <div className="h-36 flex items-center justify-center text-xs text-[#B2B5BE] font-sans font-medium border border-[rgba(255,255,255,0.08)] rounded-[12px] bg-[#161616]/40">
        Awaiting live ticks to draw chart...
      </div>
    );
  }
  
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min === 0 ? 1 : max - min;
  
  const points = history.map((price, idx) => {
    const x = (idx * (300 / (history.length - 1))).toFixed(1);
    const y = (120 - ((price - min) / range) * 94 - 13).toFixed(1);
    return `${x},${y}`;
  }).join(' ');
  
  const strokeColor = isUp ? '#089981' : '#F23645';
  const fillColorId = isUp ? 'chart-fill-green' : 'chart-fill-red';
  const fillPoints = `0,120 ${points} 300,120`;

  return (
    <svg className="w-full h-36 overflow-visible font-sans" viewBox="0 0 300 120" preserveAspectRatio="none">
      <defs>
        <linearGradient id="chart-fill-green" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#089981" stopOpacity="0.10"/>
          <stop offset="100%" stopColor="#089981" stopOpacity="0.00"/>
        </linearGradient>
        <linearGradient id="chart-fill-red" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F23645" stopOpacity="0.10"/>
          <stop offset="100%" stopColor="#F23645" stopOpacity="0.00"/>
        </linearGradient>
      </defs>
      
      {/* Gridlines */}
      <line x1="0" y1="30" x2="300" y2="30" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" strokeDasharray="2,4" />
      <line x1="0" y1="60" x2="300" y2="60" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" strokeDasharray="2,4" />
      <line x1="0" y1="90" x2="300" y2="90" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" strokeDasharray="2,4" />
      
      {/* Subtle Area Gradient Under the Curve */}
      <polygon fill={`url(#${fillColorId})`} points={fillPoints} />
      
      {/* Line polyline */}
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="2.0"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedStock, setSelectedStock] = useState(null);
  
  const [stocks, setStocks] = useState({});
  const [priceHistory, setPriceHistory] = useState({
    AAPL: [], TSLA: [], GOOGL: [], AMZN: [], MSFT: [], NVDA: [], META: [], NFLX: [], AMD: [], COIN: []
  });
  const [flashStates, setFlashStates] = useState({});
  const [leaderboard, setLeaderboard] = useState([]);
  
  // Headline Submissions
  const [headline, setHeadline] = useState('');
  const [ticker, setTicker] = useState('AAPL');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [headlineLogs, setHeadlineLogs] = useState([]);
  
  // Connections Health Check
  const [socketConnected, setSocketConnected] = useState(false);
  const [dbHealth, setDbHealth] = useState({ api: 'checking', redis: 'checking', mongo: 'checking' });

  const fetchLeaderboard = () => {
    fetch('http://localhost:5000/api/leaderboard')
      .then(res => res.json())
      .then(res => setLeaderboard(res.data || []))
      .catch(err => console.error("Error fetching leaderboard:", err));
  };

  const checkHealth = () => {
    fetch('http://localhost:5000/health')
      .then(res => res.json())
      .then(data => {
        setDbHealth({
          api: 'healthy',
          redis: data.redis.includes('Connected') ? 'healthy' : 'error',
          mongo: data.mongo === 'Connected' ? 'healthy' : 'error'
        });
      })
      .catch(() => {
        setDbHealth({ api: 'error', redis: 'error', mongo: 'error' });
      });
  };

  useEffect(() => {
    // 1. Fetch initial states
    fetch('http://localhost:5000/api/stocks')
      .then(res => res.json())
      .then(res => {
        const initialPrices = {};
        const initialHistory = {};
        res.data.forEach(s => {
          initialPrices[s.ticker] = s.price;
          initialHistory[s.ticker] = [s.price];
        });
        setStocks(initialPrices);
        setPriceHistory(prev => {
          const updated = { ...prev };
          Object.keys(initialHistory).forEach(t => {
            updated[t] = initialHistory[t];
          });
          return updated;
        });
      })
      .catch(err => console.error("Error fetching initial stocks:", err));

    // 2. Fetch initial leaderboard
    fetchLeaderboard();

    // 3. Fetch initial news history log
    fetch('http://localhost:5000/api/news')
      .then(res => res.json())
      .then(res => {
        const historyData = (res.data || []).map(item => ({
          ...item,
          id: item._id || item.id,
          status: 'completed'
        }));
        setHeadlineLogs(historyData);
      })
      .catch(err => console.error("Error fetching news history:", err));

    // 4. Check health and setup polling
    checkHealth();
    const healthInterval = setInterval(checkHealth, 15000);

    // 5. Socket connection states
    socket.on('connect', () => {
      console.log('⚡ Socket connected successfully to backend server!');
      setSocketConnected(true);
    });
    socket.on('disconnect', (reason) => {
      console.warn('🔌 Socket disconnected from backend server:', reason);
      setSocketConnected(false);
    });
    socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error on frontend:', error);
    });
    if (socket.connected) {
      console.log('⚡ Socket already connected on initialization');
      setSocketConnected(true);
    }

    // 6. Listen to real-time stock updates
    socket.on('price_update', (data) => {
      console.log(`📈 Received live price update: ${data.ticker} = $${data.price}`);
      const currentPrice = parseFloat(data.price);
      
      setStocks(prev => {
        const prevPrice = prev[data.ticker];
        if (prevPrice !== undefined) {
          const direction = currentPrice > prevPrice ? 'up' : currentPrice < prevPrice ? 'down' : null;
          if (direction) {
            setFlashStates(prevFlash => ({
              ...prevFlash,
              [data.ticker]: { direction, timestamp: Date.now() }
            }));
          }
        }
        return { ...prev, [data.ticker]: currentPrice };
      });

      setPriceHistory(prev => {
        const history = prev[data.ticker] || [];
        const updated = history.length === 0 ? [currentPrice] : [...history, currentPrice].slice(-30); // Keep up to 30 ticks
        return { ...prev, [data.ticker]: updated };
      });
    });

    // 7. Listen to real-time sentiment updates
    socket.on('sentiment_update', (data) => {
      console.log(`🧠 Received live sentiment update for ${data.ticker}:`, data);
      
      setHeadlineLogs(prev => {
        const index = prev.findIndex(log => log.headline === data.headline && log.ticker === data.ticker && log.status !== 'completed');
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = { ...updated[index], ...data, status: 'completed' };
          return updated;
        }
        const alreadyExists = prev.some(log => log.id === data.id || log._id === data.id || (log.headline === data.headline && log.ticker === data.ticker));
        if (alreadyExists) return prev;

        return [{ ...data, status: 'completed' }, ...prev].slice(0, 20);
      });

      // Instantly refresh the leaderboard
      fetchLeaderboard();
    });

    // 8. Poll leaderboard every 5 seconds (as per existing requirements)
    const leaderboardInterval = setInterval(fetchLeaderboard, 5000);

    return () => {
      socket.off('price_update');
      socket.off('sentiment_update');
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      clearInterval(leaderboardInterval);
      clearInterval(healthInterval);
    };
  }, []);

  const analyzeNews = async (e) => {
    e.preventDefault();
    if (!headline.trim()) return;

    setIsAnalyzing(true);
    const submissionId = Date.now();
    const newLog = {
      id: submissionId,
      ticker,
      headline,
      timestamp: new Date().toLocaleTimeString(),
      status: 'analyzing'
    };

    setHeadlineLogs(prev => [newLog, ...prev]);

    try {
      const response = await fetch('http://localhost:5000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, headline })
      });
      const data = await response.json();
      
      if (data.success) {
        setHeadlineLogs(prev => prev.map(log => 
          log.id === submissionId ? { ...log, status: 'queued', jobId: data.jobId } : log
        ));
      } else {
        setHeadlineLogs(prev => prev.map(log => 
          log.id === submissionId ? { ...log, status: 'failed' } : log
        ));
      }
    } catch (err) {
      console.error(err);
      setHeadlineLogs(prev => prev.map(log => 
        log.id === submissionId ? { ...log, status: 'failed' } : log
      ));
    } finally {
      setHeadline('');
      setIsAnalyzing(false);
    }
  };

  const maxAbsScore = Math.max(...leaderboard.map(item => Math.abs(item.score)), 5);

  // Deep-dive drawer values
  const drawerHistory = selectedStock ? priceHistory[selectedStock] : [];
  const drawerStockPrice = selectedStock ? stocks[selectedStock] : null;
  const drawerFirstPrice = drawerHistory[0] || drawerStockPrice;
  const drawerChange = drawerStockPrice && drawerFirstPrice ? drawerStockPrice - drawerFirstPrice : 0;
  const drawerPercentChange = drawerFirstPrice ? ((drawerChange / drawerFirstPrice) * 100).toFixed(2) : '0.00';
  const drawerIsUp = drawerChange >= 0;
  const drawerNews = headlineLogs.filter(log => log.ticker === selectedStock);

  // AI Sentiment Leaderboard Component (Horizontal strip format)
  const renderLeaderboard = () => {
    return (
      <div className="bg-[#131313] p-5 rounded-xl border border-[rgba(255,255,255,0.08)] shadow-lg w-full">
        <h2 className="text-[17px] font-bold uppercase tracking-[0.01em] text-[#B2B5BE] mb-4 flex items-center gap-2 leading-relaxed">
          <Brain className="text-[#2962ff] w-5 h-5" /> AI Sentiment Leaderboard
        </h2>

        {leaderboard.length === 0 ? (
          <div className="py-4 text-center text-[#B2B5BE] text-sm leading-relaxed">
            No sentiment data yet. Submit headlines!
          </div>
        ) : (
          <div className="flex flex-row gap-4 overflow-x-auto pb-2.5 select-none scrollbar-thin scrollbar-thumb-white/10">
            {leaderboard.map((item) => {
              const score = item.score;
              const isPositive = score > 0;
              const isNegative = score < 0;
              
              const barWidth = Math.min(100, (Math.abs(score) / maxAbsScore) * 100);
              
              return (
                <div 
                  key={item.ticker} 
                  onClick={() => setSelectedStock(item.ticker)}
                  className="flex-shrink-0 w-[220px] bg-[#161616] px-[18px] py-[16px] rounded-lg border border-[rgba(255,255,255,0.08)] hover:border-slate-500 cursor-pointer flex flex-col justify-between select-none"
                >
                  {/* Ticker & Company Block */}
                  <div className="flex justify-between items-start leading-relaxed">
                    <div className="truncate pr-1">
                      <span className="text-[16px] font-bold text-white block leading-none">{item.ticker}</span>
                      <span className="text-[13.6px] text-[#B2B5BE]/80 truncate block mt-1.5 leading-none">{companyNames[item.ticker]}</span>
                    </div>
                  </div>

                  {/* Sentiment Score & Progress Bar Row with 12px gap (mt-3) */}
                  <div className="space-y-2.5 mt-3">
                    <div className="flex justify-between items-baseline leading-none">
                      <span className="text-[11px] text-[#B2B5BE]/70 font-semibold uppercase tracking-wider">Score</span>
                      <span className={`text-[15.2px] font-bold ${
                        isPositive ? 'text-[#089981]' :
                        isNegative ? 'text-[#F23645]' :
                        'text-slate-400'
                      }`}>
                        {isPositive ? '+' : ''}{score.toFixed(2)}
                      </span>
                    </div>

                    {/* Thicker 6px progress bar container spanning full width of the chip */}
                    <div className="h-[6px] w-full bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden flex relative">
                      <div className="absolute inset-y-0 left-1/2 w-0.5 bg-[rgba(255,255,255,0.12)] z-10"></div>
                      
                      {/* Left (Negative) */}
                      <div className="w-1/2 flex justify-end">
                        {isNegative && (
                          <div 
                            style={{ width: `${barWidth}%` }} 
                            className="h-full bg-[#F23645] rounded-l-full"
                          ></div>
                        )}
                      </div>

                      {/* Right (Positive) */}
                      <div className="w-1/2">
                        {isPositive && (
                          <div 
                            style={{ width: `${barWidth}%` }} 
                            className="h-full bg-[#089981] rounded-r-full"
                          ></div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black text-[#d1d4dc] p-4 md:p-8 relative font-sans">
      
      {/* Top TradingView-Style Navigation Bar */}
      <header className="flex items-center justify-between py-5 mb-8 bg-black border-b border-[rgba(255,255,255,0.08)] sticky top-0 z-30 select-none">
        <div className="flex items-center gap-10">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M3 17l6-6 4 4 8-8" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="21" cy="7" r="1" fill="currentColor"/>
            </svg>
            <span className="font-bold text-[19px] text-white tracking-tight leading-relaxed">StockPulse AI</span>
          </div>
          
          {/* Tabs - font-size: 0.9rem-0.95rem (15px) */}
          <nav className="flex items-center gap-6 text-[15px] font-semibold">
            <button 
              onClick={() => { setActiveTab('dashboard'); setSelectedStock(null); }}
              className={`pb-1.5 transition-colors duration-200 leading-relaxed ${
                activeTab === 'dashboard' 
                  ? 'text-white' 
                  : 'text-[#B2B5BE] hover:text-white'
              }`}
            >
              Dashboard
            </button>
            <button 
              onClick={() => { setActiveTab('news'); setSelectedStock(null); }}
              className={`pb-1.5 transition-colors duration-200 leading-relaxed ${
                activeTab === 'news' 
                  ? 'text-white' 
                  : 'text-[#B2B5BE] hover:text-white'
              }`}
            >
              AI News Center
            </button>
          </nav>
        </div>

        {/* Network Connections - font-size: 0.9rem-0.95rem (15px) */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-[12px] py-[5px] rounded-full bg-[rgba(255,255,255,0.06)] text-[15px] font-semibold text-[#B2B5BE] border-none leading-relaxed" title={socketConnected ? "Connection is live" : "Connection offline"}>
            <span className={`w-1.5 h-1.5 rounded-full ${socketConnected ? 'bg-[#089981] animate-pulse' : 'bg-[#F23645]'}`}></span>
            <span>LIVE</span>
          </div>

          <div className="flex items-center gap-1.5 px-[12px] py-[5px] rounded-full bg-[rgba(255,255,255,0.06)] text-[15px] font-semibold text-[#B2B5BE] border-none leading-relaxed" title={dbHealth.api === 'healthy' && dbHealth.redis === 'healthy' && dbHealth.mongo === 'healthy' ? "All backend systems fully operational" : "Backend systems degradation detected"}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              dbHealth.api === 'healthy' && dbHealth.redis === 'healthy' && dbHealth.mongo === 'healthy'
                ? 'bg-[#089981]' : 'bg-[#F23645]'
            }`}></span>
            <span className="hidden md:inline">SYSTEMS OPERATIONAL</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full animate-fade-in">
        {activeTab === 'dashboard' ? (
          /* ================================================================= */
          /* DASHBOARD VIEW                                                    */
          /* ================================================================= */
          <div className="w-full">
            
            {/* 10-Stock WATCHLIST grid taking full width */}
            <div className="bg-[#131313] p-5 rounded-xl border border-[rgba(255,255,255,0.08)] shadow-lg">
              <div className="flex items-center justify-between mb-5">
                {/* Section title: text-[17px] font-bold leading-relaxed */}
                <h2 className="text-[17px] font-bold uppercase tracking-[0.01em] text-[#B2B5BE] flex items-center gap-2 leading-relaxed">
                  <Activity className="text-[#2962ff] w-5 h-5" /> Market Watchlist
                </h2>
                
                <div className="flex items-center gap-1.5 px-[12px] py-[5px] rounded-full bg-[rgba(255,255,255,0.06)] text-[15px] font-semibold text-[#089981] leading-relaxed">
                  <span className="w-1.5 h-1.5 bg-[#089981] rounded-full animate-pulse"></span>
                  <span>LIVE STREAMING</span>
                </div>
              </div>

              {/* Grid columns widened dynamically */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Object.entries(stocks).map(([ticker, price]) => {
                  const history = priceHistory[ticker] || [];
                  const firstPrice = history[0] || price;
                  const change = price - firstPrice;
                  const percentChange = firstPrice !== 0 ? ((change / firstPrice) * 100).toFixed(2) : '0.00';
                  const isUp = change >= 0;
                  
                  const flash = flashStates[ticker];
                  const flashClass = flash && (Date.now() - flash.timestamp < 1000)
                    ? (flash.direction === 'up' ? 'animate-flash-up' : 'animate-flash-down')
                    : '';

                  return (
                    <div 
                      key={ticker} 
                      onClick={() => setSelectedStock(ticker)}
                      className={`bg-[#161616] p-5 rounded-xl border border-[rgba(255,255,255,0.08)] flex flex-col justify-between cursor-pointer transition-all duration-200 hover:border-slate-500 hover:shadow-[0_1px_2px_rgba(0,0,0,0.4)] ${flashClass}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="leading-snug">
                          {/* Ticker: 1rem (16px), font-weight: 700 */}
                          <span className="text-[16px] font-bold text-white">{ticker}</span>
                          {/* Company name: 0.85rem (13.6px) */}
                          <p className="text-[13.6px] text-[#B2B5BE]/80 font-medium truncate max-w-[130px] mt-0.5">{companyNames[ticker] || 'Stock Asset'}</p>
                        </div>
                        
                        {/* Change badges: 0.85rem (13.6px) */}
                        <div className={`flex items-center gap-0.5 px-2 py-0.5 rounded text-[13.6px] font-semibold leading-relaxed ${
                          isUp ? 'bg-[#089981]/10 text-[#089981]' : 'bg-[#F23645]/10 text-[#F23645]'
                        }`}>
                          {isUp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          <span>{percentChange}%</span>
                        </div>
                      </div>

                      <div className="flex items-end justify-between mt-5">
                        {/* Price: 1.875rem (30px), font-weight: 700 */}
                        <span className="text-[30px] font-bold text-white tracking-tight leading-none">
                          ${price.toFixed(2)}
                        </span>
                        
                        <div className="w-20 bg-black/20 p-1 rounded border border-[rgba(255,255,255,0.08)]">
                          <Sparkline history={history} isUp={isUp} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        ) : (
          /* ================================================================= */
          /* AI NEWS CENTER VIEW (Horizontal Strip & Single-Column Layout)     */
          /* ================================================================= */
          <div className="space-y-6 max-w-[1600px] mx-auto px-2 md:px-4">
            
            {/* Horizontal Leaderboard strip at the top */}
            {renderLeaderboard()}

            {/* Submission Form */}
            <div className="bg-[#131313] p-5 rounded-xl border border-[rgba(255,255,255,0.08)] shadow-lg">
              <h2 className="text-[17px] font-bold uppercase tracking-[0.01em] text-[#B2B5BE] mb-1 flex items-center gap-2 leading-relaxed">
                <Newspaper className="text-[#2962ff] w-5 h-5" /> Submit Headline for AI Sentiment
              </h2>
              <p className="text-[13.6px] text-[#B2B5BE] mb-6 font-medium leading-relaxed">
                Submit a financial headline and our AI engine will analyze its market sentiment in real time.
              </p>

              <form onSubmit={analyzeNews} className="space-y-4">
                <div className="flex flex-col md:flex-row gap-3">
                  {/* Select Ticker */}
                  <div className="relative md:w-48">
                    <select 
                      className="w-full bg-[#161616] border border-[rgba(255,255,255,0.08)] text-[#d1d4dc] px-4 py-2.5 rounded-[8px] focus:outline-none focus:border-[#2962ff] text-sm font-semibold appearance-none cursor-pointer"
                      value={ticker} 
                      onChange={e => setTicker(e.target.value)}
                    >
                      {Object.keys(companyNames).map(t => (
                        <option key={t} value={t}>{t} - {companyNames[t]}</option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>

                  {/* Input text */}
                  <input 
                    type="text"
                    className="flex-1 bg-[#161616] border border-[rgba(255,255,255,0.08)] text-white placeholder-[#4c525e] px-4 py-2.5 rounded-[8px] focus:outline-none focus:border-[#2962ff] text-sm" 
                    placeholder="Enter financial headline (e.g. 'Nvidia reveals groundbreaking chips at keynote')..." 
                    value={headline} 
                    onChange={e => setHeadline(e.target.value)}
                    disabled={isAnalyzing}
                  />

                  {/* Submit */}
                  <button 
                    type="submit"
                    className="bg-[#2962ff] text-white font-semibold text-sm px-5 py-2.5 rounded-[8px] hover:bg-[#1e53e5] active:bg-[#1546cb] focus:outline-none transition-colors disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap border-none"
                    disabled={isAnalyzing || !headline.trim()}
                  >
                    {isAnalyzing ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Analyzing...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Brain className="w-4 h-4" />
                        Analyze Sentiment
                      </span>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Global submissions feed */}
            <div className="bg-[#131313] p-5 rounded-xl border border-[rgba(255,255,255,0.08)] shadow-lg">
              <h2 className="text-[17px] font-bold uppercase tracking-[0.01em] text-[#B2B5BE] mb-4 flex items-center gap-2 leading-relaxed">
                <History className="text-[#2962ff] w-5 h-5" /> Recent Sentiment Analysis Logs
              </h2>

              {headlineLogs.length === 0 ? (
                <div className="py-8 text-center text-[#B2B5BE] text-sm font-medium leading-relaxed">
                  No submissions have been recorded yet.
                </div>
              ) : (
                <div className="space-y-3.5 pr-1">
                  {headlineLogs.map((log) => {
                    const isCompleted = log.status === 'completed';
                    const showScore = isCompleted && log.score !== undefined;
                    const isPositive = log.score > 0;
                    const isNegative = log.score < 0;

                    return (
                      <div 
                        key={log.id || log._id} 
                        className="bg-[#161616] p-5 rounded-xl border border-[rgba(255,255,255,0.08)] hover:border-slate-700 transition-all space-y-2.5"
                      >
                        <div className="flex justify-between items-center leading-relaxed">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[13.6px] font-semibold text-white bg-black px-1.5 py-0.5 rounded border border-[rgba(255,255,255,0.08)]">
                              {log.ticker}
                            </span>
                            <span className="text-[10px] text-[#B2B5BE] font-medium">
                              {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'Just now'}
                            </span>
                          </div>
                          
                          {log.status === 'analyzing' && (
                            <span className="text-[#2962ff] text-[13.6px] flex items-center gap-1 font-semibold">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Analyzing...
                            </span>
                          )}
                          {log.status === 'queued' && (
                            <span className="text-amber-500 text-[13.6px] flex items-center gap-1 font-semibold animate-pulse">
                              <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" /> Processing
                            </span>
                          )}
                          {log.status === 'failed' && (
                            <span className="text-[#F23645] text-[13.6px] flex items-center gap-1 font-semibold">
                              <XCircle className="w-3.5 h-3.5 text-[#F23645]" /> Failed
                            </span>
                          )}
                          {isCompleted && showScore && (
                            <span className={`px-2 py-0.5 rounded font-bold text-[13.6px] ${
                              isPositive ? 'bg-[#089981]/10 text-[#089981]' :
                              isNegative ? 'bg-[#F23645]/10 text-[#F23645]' :
                              'bg-slate-800 text-slate-400'
                            }`}>
                              {isPositive ? '+' : ''}{log.score}
                            </span>
                          )}
                        </div>
                        
                        <p className="text-[16px] font-semibold text-slate-100 leading-[1.45]">
                          "{log.headline}"
                        </p>

                        {isCompleted && log.explanation && (
                          <div className="bg-black/40 p-3.5 rounded border border-[rgba(255,255,255,0.08)] mt-1.5">
                            <p className="text-[#B2B5BE] text-[14.4px] leading-[1.45]">
                              <span className="text-[#2962ff] font-semibold">💡 AI Explanation:</span> {log.explanation}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}
      </main>

      {/* Backdrop for closing drawer when clicking outside */}
      {selectedStock && (
        <div 
          onClick={() => setSelectedStock(null)}
          className="fixed inset-0 bg-black/60 z-40 transition-opacity"
        />
      )}

      {/* Slide-out Stock Deep-Dive Drawer */}
      <div 
        className={`fixed top-0 right-0 h-full w-full md:w-[460px] bg-[#131313] border-l border-[rgba(255,255,255,0.08)] shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          selectedStock ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {selectedStock && (
          <>
            {/* Drawer Header */}
            <div className="p-5 border-b border-[rgba(255,255,255,0.08)] flex items-center justify-between bg-black/10">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[16px] text-white bg-black px-1.5 py-0.5 rounded border border-[rgba(255,255,255,0.08)] leading-none">{selectedStock}</span>
                  <span className="text-[13.6px] text-[#B2B5BE] font-medium leading-none">{companyNames[selectedStock]}</span>
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-[30px] font-bold text-white tracking-tight leading-none">
                    ${stocks[selectedStock]?.toFixed(2) || '0.00'}
                  </span>
                  <span className={`text-[13.6px] font-semibold flex items-center leading-none ${
                    drawerIsUp ? 'text-[#089981]' : 'text-[#F23645]'
                  }`}>
                    {drawerIsUp ? '+' : ''}{drawerPercentChange}%
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setSelectedStock(null)}
                className="text-[#B2B5BE] hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Drawer Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Detailed Performance Chart */}
              <div className="bg-[#161616] p-5 rounded-xl border border-[rgba(255,255,255,0.08)]">
                <h3 className="text-[13.6px] font-bold uppercase tracking-[-0.01em] text-[#B2B5BE] mb-4">Price Performance</h3>
                <DetailedChart history={drawerHistory} isUp={drawerIsUp} />
                <div className="flex justify-between items-center text-[10px] text-[#B2B5BE] font-medium mt-3 border-t border-[rgba(255,255,255,0.08)] pt-2.5">
                  <span>Session Min: ${Math.min(...drawerHistory, 0).toFixed(2)}</span>
                  <span>Session Max: ${Math.max(...drawerHistory, 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Stock-specific AI sentiment list */}
              <div>
                <h3 className="text-[13.6px] font-bold uppercase tracking-[-0.01em] text-[#B2B5BE] mb-3">AI Sentiment Timeline</h3>
                {drawerNews.length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-[rgba(255,255,255,0.08)] rounded-xl text-[#B2B5BE] text-xs">
                    No sentiment news recorded for {selectedStock} yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {drawerNews.map((log) => {
                      const isPositive = log.score > 0;
                      const isNegative = log.score < 0;
                      return (
                        <div key={log.id || log._id} className="bg-[#161616] p-4 rounded-xl border border-[rgba(255,255,255,0.08)] space-y-2.5">
                          <div className="flex justify-between items-center leading-relaxed">
                            <span className="text-[10px] text-[#B2B5BE] font-medium">
                              {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'Just now'}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[13.6px] font-bold ${
                              isPositive ? 'bg-[#089981]/10 text-[#089981]' :
                              isNegative ? 'bg-[#F23645]/10 text-[#F23645]' :
                              'bg-slate-800 text-[#B2B5BE]'
                            }`}>
                              {isPositive ? '+' : ''}{log.score}
                            </span>
                          </div>
                          <p className="text-[16px] font-semibold text-slate-200 leading-[1.45]">
                            "{log.headline}"
                          </p>
                          {log.explanation && (
                            <p className="text-[#B2B5BE] text-[14.4px] border-t border-[rgba(255,255,255,0.08)] pt-1.5 leading-[1.45]">
                              <span className="text-[#2962ff] font-semibold">💡 AI Explanation:</span> {log.explanation}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
}