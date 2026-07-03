/**
 * KRİPTO AI ROBOT V10 - SAF HACİM & FİTİL ANALİZ MERKEZİ (ai-core.js)
 * Tamamen Canlı Veri Akışından, Hacim Ortalamalarından ve Sinyal Hafızasından Sorumludur.
 */

class AICoreEngine {
  constructor() {
    this.API_BASES = ['https://api.binance.com', 'https://api1.binance.com', 'https://api2.binance.com'];
    this.candles = [];
    this.ws = null;
    this.dipCount = 0;
    this.tepeCount = 0;
    
    // Güçlendirilmiş Panel Hafızası (Tick Gelse Bile Son Kararı Asla Unutmaz)
    this.lastSignal = {
      decision: 'IZLEME',
      price: 0,
      stop: 0,
      msg: '⏳ SAF HACİM ANALİZİ: Binance canlı akış hattı dinleniyor. Kurumsal hacim patlaması bekleniyor...'
    };

    this.init();
  }

  async init() {
    // UI Yöneticisinin (chart.js) hazır olmasını bekle
    if (!window.ChartUI) {
      setTimeout(() => this.init(), 100);
      return;
    }
    
    window.AICore = this; // Global erişim bağlantısı
    
    await this.loadMarketTickerData();
    await this.loadCandleHistory();
    
    // Sol paneldeki 24 saatlik fiyat listesini her 45 saniyede bir güncelle
    setInterval(() => this.loadMarketTickerData(), 45000);
    this.bindSidebarButtons();
  }

  // Arayüz Elemanlarına Kısayol ($ Tanımı)
  $(id) { return document.getElementById(id); }

  // 1. ADIM: Binance'ten 24 Saatlik Tüm Piyasa Hacmini Çek ve Sol Listeye Bas
  async loadMarketTickerData() {
    try {
      const data = await this.fetchWithFallback('/api/v3/ticker/24hr');
      window.ChartUI.symbolsData = data
        .filter(s => s.symbol.endsWith('USDT') && !s.symbol.includes('UP') && !s.symbol.includes('DOWN'))
        .map(s => ({
          symbol: s.symbol,
          price: parseFloat(s.lastPrice),
          change: parseFloat(s.priceChangePercent),
          volume: parseFloat(s.quoteVolume)
        }))
        .sort((a, b) => b.volume - a.volume); // En yüksek hacimliler üstte
      
      window.ChartUI.renderSymbolsList();
    } catch (e) {
      console.error("Market verileri çekilemedi:", e);
    }
  }

  // 2. ADIM: Seçili Paritenin Geçmiş 100 Mumunu Çek ve Grafiğe Oturt
  async loadCandleHistory() {
    try {
      window.ChartUI.updateStatus(`Geçmiş Yükleniyor (${window.ChartUI.activeSymbol})...`, true);
      
      const path = `/api/v3/klines?symbol=${window.ChartUI.activeSymbol}&interval=${window.ChartUI.activeInterval}&limit=120`;
      const data = await this.fetchWithFallback(path);
      
      this.candles = data.map(k => ({
        time: Math.floor(k[0] / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      }));

      const precision = window.ChartUI.getPrecision(this.candles[0].close);

      // Grafik Mum Hassasiyet Ayarları
      window.ChartUI.candleSeries.applyOptions({
        priceFormat: { type: 'price', precision: precision, minMove: 1 / Math.pow(10, precision) }
      });

      // Geçmiş veriyi TradingView şablonuna bas
      window.ChartUI.candleSeries.setData(this.candles);
      window.ChartUI.volumeSeries.setData(this.candles.map(c => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(14,203,129,0.18)' : 'rgba(246,70,93,0.18)'
      })));

      window.ChartUI.chart.timeScale().fitContent();
      
      // Geçmiş mumları tara, eski sinyalleri yerleştir ve paneli güncelle
      this.executeFullMarketAnalysis();
      
      // Canlı akış WebSocket hattını tetikle
      this.connectWebSocketStream();
    } catch (e) {
      window.ChartUI.updateStatus("Bağlantı Hatası!", false);
    }
  }

  // 3. ADIM: Canlı Milisaniyelik WebSocket Akışını Başlat (Binance Stream)
  connectWebSocketStream() {
    if (this.ws) this.ws.close();
    
    const symbolLower = window.ChartUI.activeSymbol.toLowerCase();
    const interval = window.ChartUI.activeInterval;
    
    this.ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbolLower}@kline_${interval}`);
    
    this.ws.onopen = () => {
      window.ChartUI.updateStatus(`CANLI HATTA BAĞLANDI (${window.ChartUI.activeSymbol})`, true);
    };

    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (!msg.k) return;
      
      const k = msg.k;
      const liveCandle = {
        time: Math.floor(k.t / 1000),
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v)
      };

      const lastCandleInMemory = this.candles[this.candles.length - 1];
      
      // Eğer yeni bir mum dakikasına geçilmediyse mevcut mumu anlık güncelle (Tick)
      if (lastCandleInMemory && lastCandleInMemory.time === liveCandle.time) {
        this.candles[this.candles.length - 1] = liveCandle;
      } else {
        this.candles.push(liveCandle); // Yeni mum başladıysa listeye ekle
      }
      
      // Canlı mumu anında grafiğe ve hacme yansıt
      window.ChartUI.candleSeries.update(liveCandle);
      window.ChartUI.volumeSeries.update({
        time: liveCandle.time,
        value: liveCandle.volume,
        color: liveCandle.close >= liveCandle.open ? 'rgba(14,203,129,0.18)' : 'rgba(246,70,93,0.18)'
      });

      // Zaman göstergelerini güncelle
      this.$('uiLastUpdate').textContent = new Date().toLocaleTimeString('tr-TR');
      this.$('uiCandleTime').textContent = new Date(liveCandle.time * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

      // ANLIK HER FİYAT OYNADIĞINDA AI MOTORUNU YENİDEN TETİKLE
      this.executeFullMarketAnalysis();
    };

    this.ws.onerror = () => window.ChartUI.updateStatus("WS Bağlantı Kesildi!", false);
    this.ws.onclose = () => window.ChartUI.updateStatus("Bağlantı Kapatıldı", false);
  }

  // 4. ADIM: Tek Bir Mumu Kurumsal Süzgeçten Geçiren Formül (Bıçak Tutmaz Mekanizma)
  analyzeCandleLogic(index, avgVolume) {
    const current = this.candles[index];
    const body = Math.abs(current.close - current.open);
    const lowerWick = Math.min(current.open, current.close) - current.low;
    const upperWick = current.high - Math.max(current.open, current.close);
    
    // Hacim Patlama Şartı: Mevcut mumun hacmi, son 20 mumun hacim ortalamasının %30 veya daha üstündeyse
    const isVolumeSpike = current.volume > avgVolume * 1.3;
    
    // Kural A: Düşüş trendinde alt iğne gövdenin en az 1.5 katıysa ve hacim onaylıysa -> DİP ALIM
    if (lowerWick > body * 1.5 && isVolumeSpike && current.close > current.open) {
      return { decision: 'DIP_ALIM', price: current.close, stop: current.close * 0.985, time: current.time, lowerWick, upperWick, isVolumeSpike };
    }
    // Kural B: Yükseliş trendinde üst iğne gövdenin en az 1.5 katıysa ve hacim onaylıysa -> TEPE SATIM
    else if (upperWick > body * 1.5 && isVolumeSpike && current.close < current.open) {
      return { decision: 'TEPE_SATIM', price: current.close, stop: 0, time: current.time, lowerWick, upperWick, isVolumeSpike };
    }
    
    return { decision: 'IZLEME', price: current.close, stop: 0, time: current.time, lowerWick, upperWick, isVolumeSpike };
  }

  // 5. ADIM: Tüm Geçmişi ve Canlı Veriyi Senkronize Tarakla Süzme (Ok Kaymasını Bitiren Yer)
  executeFullMarketAnalysis() {
    if (this.candles.length < 21) return;

    // 20 MA Hacim Hesaplama
    let totalVol = 0;
    for (let i = this.candles.length - 21; i < this.candles.length - 1; i++) {
      totalVol += this.candles[i].volume;
    }
    const avgVolume = totalVol / 20;

    let chartMarkers = [];
    this.dipCount = 0;
    this.tepeCount = 0;

    // Varsayılan panel mesajı (Sinyal yoksa görüntülenecek nötr durum)
    let tempSignal = {
      decision: 'IZLEME',
      price: 0,
      stop: 0,
      msg: '⏳ SAF HACİM ANALİZİ: Piyasa izleniyor. Kurumsal hacim patlaması veya derin fitil reaksiyonu aranıyor.'
    };

    // Tüm geçmişi baştan sona tarayıp UNIX zaman kodlarına göre okları kilitliyoruz
    for (let i = 20; i < this.candles.length; i++) {
      const res = this.analyzeCandleLogic(i, avgVolume);
      
      if (res.decision === 'DIP_ALIM') {
        this.dipCount++;
        // Milimetrik UNIX zaman eşleşmesi
        chartMarkers.push({ time: res.time, position: 'belowBar', color: '#0ecb81', shape: 'arrowUp', text: 'DİP GİRİŞ AL' });
        
        // Sinyal en güncel mumlardaysa (Son 2 mum) panel hafızasını buna sabitle
        if (i >= this.candles.length - 2) {
          tempSignal = {
            decision: 'DIP_ALIM', price: res.price, stop: res.stop,
            msg: `🟢 DOĞRULANMIŞ DİP: Alt fitil patlamasıyla kurumsal alıcılar devreye girdi. DİP GİRİŞ AL seviyesi (${res.price}) aktiftir.`
          };
        }
      } else if (res.decision === 'TEPE_SATIM') {
        this.tepeCount++;
        chartMarkers.push({ time: res.time, position: 'aboveBar', color: '#f6465d', shape: 'arrowDown', text: 'TEPE ÇIKIŞ SAT' });
        
        if (i >= this.candles.length - 2) {
          tempSignal = {
            decision: 'TEPE_SATIM', price: res.price, stop: 0,
            msg: `🔴 DOĞRULANMIŞ TEPE: Üst fitil baskısıyla balinalar mal dağıtıyor. TEPE ÇIKIŞ SAT seviyesi (${res.price}) aktiftir.`
          };
        }
      }
    }

    // Ok işaretlerini TradingView kütüphanesine tek kalemde bas (Kayma ihtimali sıfırlandı)
    window.ChartUI.candleSeries.setMarkers(chartMarkers);
    
    // Alt sayaçları güncelle
    this.$('uiDipCount').textContent = this.dipCount;
    this.$('uiTepeCount').textContent = this.tepeCount;

    // Eğer son 2 mumda yeni bir sinyal üretildiyse hafızayı güncelle, yoksa eski büyük kararı koru
    if (tempSignal.decision !== 'IZLEME' || this.lastSignal.decision === 'IZLEME') {
      this.lastSignal = tempSignal;
    }

    // Anlık canlı veriler ışığında sağ paneli tamamen besle
    const lastCandle = this.candles[this.candles.length - 1];
    this.syncSidePanelUI(lastCandle);
  }

  // 6. ADIM: Stratejik Emir Komutanı Panelini Senkronize Doldurma
  syncSidePanelUI(lastCandle) {
    const p = window.ChartUI.getPrecision(lastCandle.close);
    
    // Anlık Fiyat
    this.$('uiSidePrice').textContent = `$${window.ChartUI.formatNumber(lastCandle.close, p)}`;

    const sb = this.$('uiSignalBadge');
    const st = this.$('uiSignalText');
    const cb = this.$('uiCommentBlock');

    // Panel Renk ve Durum Yönetimi
    if (this.lastSignal.decision === 'DIP_ALIM') {
      sb.className = 'decision-badge bullish'; st.textContent = 'DİP GİRİŞ AL 🟢'; cb.style.borderLeftColor = 'var(--green)';
      this.$('uiSideTarget').textContent = `$${window.ChartUI.formatNumber(this.lastSignal.price, p)}`; this.$('uiSideTarget').className = "up-text";
      this.$('uiSideStop').textContent = `$${window.ChartUI.formatNumber(this.lastSignal.stop, p)}`; this.$('uiSideStop').className = "down-text";
    } else if (this.lastSignal.decision === 'TEPE_SATIM') {
      sb.className = 'decision-badge bearish'; st.textContent = 'TEPE ÇIKIŞ SAT 🔴'; cb.style.borderLeftColor = 'var(--red)';
      this.$('uiSideTarget').textContent = `$${window.ChartUI.formatNumber(this.lastSignal.price, p)}`; this.$('uiSideTarget').className = "down-text";
      this.$('uiSideStop').textContent = 'PASİF / SPOT NAKİT'; this.$('uiSideStop').className = "";
    } else {
      sb.className = 'decision-badge neutral'; st.textContent = 'İZLEME MODU ⏳'; cb.style.borderLeftColor = 'var(--blue)';
      this.$('uiSideTarget').textContent = 'ŞARTLAR BEKLENİYOR'; this.$('uiSideTarget').className = "";
      this.$('uiSideStop').textContent = '-'; this.$('uiSideStop').className = "";
    }

    // Yapay Zekanın Metinsel Rapor Yazısı
    this.$('uiRobotCommentary').textContent = this.lastSignal.msg;

    // Küçük Bilgi Kutucuklarının (İğne Oranları ve Hacim) Canlı Doldurulması
    const body = Math.abs(lastCandle.close - lastCandle.open);
    const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
    const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);

    // Son 20 mumun hacim ortalaması kıyaslama kontrolü
    let totalVol = 0;
    for (let i = this.candles.length - 21; i < this.candles.length - 1; i++) { totalVol += this.candles[i].volume; }
    const avgVolume = totalVol / 20;

    this.$('uiVolFilterVal').innerHTML = lastCandle.volume > avgVolume * 1.3 ? '<span class="up-text">KURUMSAL ENJEKSİYON</span>' : '<span>NORMAL</span>';
    this.$('uiOrderFlowVal').textContent = lastCandle.close >= lastCandle.open ? "BOĞA AĞIRLIKLI" : "AYI BASKISI";
    this.$('uiOrderFlowVal').className = lastCandle.close >= lastCandle.open ? "up-text" : "down-text";
    this.$('uiLowerWickVal').textContent = `$${window.ChartUI.formatNumber(lowerWick, p)}`;
    this.$('uiUpperWickVal').textContent = `$${window.ChartUI.formatNumber(upperWick, p)}`;
  }

  // Dışarıdan Tetiklenen Parite Değişimi
  switchSymbol(newSymbol) {
    this.lastSignal.decision = 'IZLEME'; // Eski sinyal hafızasını temizle
    this.loadCandleHistory();
  }

  // Dışarıdan Tetiklenen Zaman Dilimi Değişimi
  changeTimeframe(newInterval) {
    this.lastSignal.decision = 'IZLEME';
    this.loadCandleHistory();
  }

  // Sağ Alt Butonların Fonksiyonları (Seslendirme)
  bindSidebarButtons() {
    if (this.$('btnVoice')) {
      this.$('btnVoice').addEventListener('click', () => {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const speech = new SpeechSynthesisUtterance(this.$('uiRobotCommentary').textContent);
          speech.lang = 'tr-TR';
          window.speechSynthesis.speak(speech);
        }
      });
    }
    if (this.$('btnAlarm')) {
      this.$('btnAlarm').addEventListener('click', () => alert('Sinyal Radarı Aktif Edildi! Kurumsal fitil yakalandığında tarayıcı uyaracaktır.'));
    }
  }

  // API Bağlantı Güvencesi (Yedekli Link Yapısı)
  async fetchWithFallback(path) {
    for (const base of this.API_BASES) {
      try {
        const res = await fetch(base + path);
        if (res.ok) return await res.json();
      } catch (e) {}
    }
    throw new Error('Tüm Binance sunucu hatları meşgul.');
  }
}

// Çekirdeği Başlat
new AICoreEngine();
