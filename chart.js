/**
 * KRİPTO AI ROBOT V10 - GRAFİK VE UI YÖNETİCİSİ (chart.js)
 * Sadece Grafik Çizimi, Ekran Boyut Takibi ve Sembol Listesi Arayüzünden Sorumludur.
 */

class ChartManager {
  constructor() {
    this.chart = null;
    this.candleSeries = null;
    this.volumeSeries = null;
    this.activeSymbol = 'BTCUSDT';
    this.activeInterval = '15m';
    this.activeTab = 'USDT';
    this.symbolsData = [];
    
    this.initElements();
    this.initChart();
    this.bindEvents();
  }

  // Arayüz elemanlarını bağlama
  initElements() {
    this.dom = {
      chartContainer: document.getElementById('tv_chart_container'),
      coinList: document.getElementById('coinScrollList'),
      searchInp: document.getElementById('pariteSearch'),
      activeSymbolTitle: document.getElementById('uiActiveSymbol'),
      engineStatus: document.getElementById('engineStatusText'),
      lastUpdate: document.getElementById('uiLastUpdate'),
      lastCandle: document.getElementById('uiCandleTime')
    };
  }

  // TradingView Lightweight Charts Kurulumu
  initChart() {
    if (!this.dom.chartContainer || typeof LightweightCharts === 'undefined') {
      console.error("Grafik kütüphanesi veya konteyner bulunamadı.");
      return;
    }

    // Grafik nesnesini oluşturma
    this.chart = LightweightCharts.createChart(this.dom.chartContainer, {
      layout: {
        background: { type: 'solid', color: '#04080f' },
        textColor: '#6b7f99',
        fontSize: 11,
        fontFamily: "'Inter', sans-serif"
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false }
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: '#182235', width: 1, style: 1 },
        horzLine: { color: '#182235', width: 1, style: 1 }
      },
      rightPriceScale: {
        borderColor: '#182235',
        autoScale: true,
        alignLabels: true
      },
      timeScale: {
        borderColor: '#182235',
        timeVisible: true,
        secondsVisible: false
      }
    });

    // Mum Serisi (Candlestick) Tanımlama
    this.candleSeries = this.chart.addCandlestickSeries({
      upColor: '#0ecb81',
      downColor: '#f6465d',
      borderUpColor: '#0ecb81',
      borderDownColor: '#f6465d',
      wickUpColor: '#0ecb81',
      wickDownColor: '#f6465d'
    });

    // Hacim Serisi (Histogram) Tanımlama
    this.volumeSeries = this.chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume'
    });

    // Hacim grafiğini alt tarafa sıkıştırma (%18 alan kaplasın)
    this.chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0
      },
      visible: false
    });

    // Otomatik Boyutlandırma (Responsive)
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || !this.chart) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        this.chart.resize(width, height);
      }
    });
    resizeObserver.observe(this.dom.chartContainer);
  }

  // Olay Dinleyicileri (Filtreler ve Arama)
  bindEvents() {
    // Arama Kutusu Filtresi
    if (this.dom.searchInp) {
      this.dom.searchInp.addEventListener('input', () => this.renderSymbolsList());
    }

    // Sekme Geçişleri (USDT / BTC / TÜMÜ)
    document.querySelectorAll('.filter-tabs .tab-trigger').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-tabs .tab-trigger').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        
        this.activeTab = e.target.id.replace('tab-', '');
        this.renderSymbolsList();
      });
    });

    // Zaman Dilimi Seçimi (Timeframes)
    document.querySelectorAll('.timeframe-selector .tf-selector-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.timeframe-selector .tf-selector-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        this.activeInterval = e.target.dataset.tf;
        this.dom.activeSymbolTitle.innerHTML = `${this.activeSymbol} <span>${this.activeInterval}</span>`;
        
        // Tetikleyici: Yapay zeka motoruna zaman dilimi değişimini haber ver
        if (window.AICore && typeof window.AICore.changeTimeframe === 'function') {
          window.AICore.changeTimeframe(this.activeInterval);
        }
      });
    });

    // Sol Listeden Parite Seçimi
    if (this.dom.coinList) {
      this.dom.coinList.addEventListener('click', (e) => {
        const row = e.target.closest('.coin-item-row');
        if (!row) return;
        
        this.activeSymbol = row.dataset.symbol;
        this.dom.activeSymbolTitle.innerHTML = `${this.activeSymbol} <span>${this.activeInterval}</span>`;
        
        // Aktif satır stilini güncelle
        document.querySelectorAll('.coin-item-row').forEach(r => r.classList.remove('active'));
        row.classList.add('active');
        
        // Tetikleyici: Yapay zeka motoruna yeni pariteye geçmesini söyle
        if (window.AICore && typeof window.AICore.switchSymbol === 'function') {
          window.AICore.switchSymbol(this.activeSymbol);
        }
      });
    }
  }

  // Fiyat Ondalık Hassasiyeti Hesaplama
  getPrecision(price) {
    if (price < 0.001) return 6;
    if (price < 0.1) return 5;
    if (price < 1) return 4;
    if (price < 10) return 3;
    return 2;
  }

  // Sayıları Türk Lirası/Avrupa formatında düzenli basma
  formatNumber(val, decimals = 2) {
    if (!Number.isFinite(val)) return '-';
    return val.toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  // Sol Paneldeki Coin Listesini Arayüze Basma
  renderSymbolsList() {
    if (!this.dom.coinList) return;
    
    const query = this.dom.searchInp ? this.dom.searchInp.value.toUpperCase() : '';
    
    const filtered = this.symbolsData.filter(s => {
      const matchQuery = !query || s.symbol.includes(query);
      if (this.activeTab === 'USDT') return s.symbol.endsWith('USDT') && matchQuery;
      if (this.activeTab === 'BTC') return s.symbol.endsWith('BTC') && matchQuery;
      return matchQuery;
    }).slice(0, 35); // Performans için ilk 35 coini listele

    this.dom.coinList.innerHTML = filtered.map(s => {
      const p = this.getPrecision(s.price);
      const isUp = s.change >= 0;
      return `
        <div class="coin-item-row ${s.symbol === this.activeSymbol ? 'active' : ''}" data-symbol="${s.symbol}">
          <div class="coin-name-cell">🔶 ${s.symbol}</div>
          <div class="coin-price-cell">$${this.formatNumber(s.price, p)}</div>
          <div class="coin-change-cell ${isUp ? 'up-text' : 'down-text'}">${isUp ? '+' : ''}${s.change.toFixed(2)}%</div>
        </div>
      `;
    }).join('');
  }

  // Motor Durum Mesajını Güncelleme
  updateStatus(msg, isConnected = true) {
    if (!this.dom.engineStatus) return;
    this.dom.engineStatus.textContent = msg.toUpperCase();
    const pulse = document.querySelector('.status-pulse-dot');
    if (pulse) {
      pulse.style.backgroundColor = isConnected ? 'var(--green)' : 'var(--red)';
      pulse.style.boxShadow = isConnected ? '0 0 8px var(--green)' : '0 0 8px var(--red)';
    }
  }
}

// Global pencereye bağlayarak başlatma
window.addEventListener('DOMContentLoaded', () => {
  window.ChartUI = new ChartManager();
});
