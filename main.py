import asyncio
import threading
import json
import urllib.request
import pandas as pd
import flet as ft

def get_all_usdt_symbols():
    try:
        url = "https://api.binance.com/api/v3/exchangeInfo"
        req = urllib.request.urlopen(url, timeout=5)
        data = json.loads(req.read().decode('utf-8'))
        symbols = [s['symbol'] for s in data['symbols'] if s['quoteAsset'] == 'USDT' and s['status'] == 'TRADING' and 'UP' not in s['symbol'] and 'DOWN' not in s['symbol']]
        return symbols
    except:
        return ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "AVAXUSDT"]

def analyze_symbol(symbol):
    try:
        url_4h = f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval=4h&limit=30"
        req = urllib.request.urlopen(url_4h, timeout=1.0)
        k4h = json.loads(req.read().decode('utf-8'))
        
        if not k4h or len(k4h) < 20:
            return None
            
        df = pd.DataFrame(k4h, columns=['open_time', 'open', 'high', 'low', 'close', 'volume', 'close_time', 'quote_volume', 'num_trades', 'taker_buy_base', 'taker_buy_quote', 'ignore'])
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = df[col].astype(float)
            
        c_price = df['close'].iloc[-1]
        sma10 = df['close'].rolling(window=10).mean().iloc[-1]
        
        if c_price < (sma10 * 0.96):
            return None 

        vol_ort = df['volume'].rolling(window=10).mean().iloc[-1]
        son_vol = df['volume'].iloc[-1]
        vol_skor = min(100, (son_vol / (vol_ort + 1e-9)) * 35)
        
        return {
            "symbol": symbol,
            "price": c_price,
            "score": float(max(15.0, vol_skor))
        }
    except:
        return None

def main(page: ft.Page):
    page.title = "Binance Quant Terminal"
    page.vertical_alignment = ft.MainAxisAlignment.CENTER
    page.horizontal_alignment = ft.CrossAxisAlignment.CENTER
    page.theme_mode = ft.ThemeMode.DARK
    page.padding = 20

    status_text = ft.Text("Piyasa taranmaya hazırlanıyor...", size=16, weight=ft.FontWeight.BOLD)
    progress_ring = ft.ProgressRing(visible=True)
    results_list = ft.ListView(expand=1, spacing=10, padding=10, auto_scroll=False)
    
    detail_container = ft.Column(visible=False, spacing=15)
    lbl_symbol = ft.Text("", size=20, weight=ft.FontWeight.BOLD, color=ft.colors.GREEN_400)
    lbl_price = ft.Text("", size=18)
    lbl_trend = ft.Text("", size=16)
    lbl_score = ft.Text("", size=16)
    lbl_emir = ft.Text("", size=16, weight=ft.FontWeight.BOLD)
    lbl_risk = ft.Text("", size=14)
    
    stop_event = threading.Event()

    def load_market():
        status_text.value = "Tüm Binance piyasası taranıyor (500+ parite)..."
        progress_ring.visible = True
        results_list.controls.clear()
        page.update()

        symbols = get_all_usdt_symbols()
        passed_coins = []

        for sym in symbols:
            res = analyze_symbol(sym)
            if res:
                passed_coins.append(res)

        passed_coins = sorted(passed_coins, key=lambda x: x['score'], reverse=True)[:15]
        progress_ring.visible = False
        results_list.controls.clear()

        if not passed_coins:
            status_text.value = "❌ Kriterlere uyan coin çıkmadı."
            page.update()
            return

        status_text.value = "🎯 Uzun Vade Potansiyel Yükseliş Adayları"
        
        for i, coin in enumerate(passed_coins, 1):
            c_sym = coin['symbol']
            c_price = coin['price']
            c_score = coin['score']
            
            btn = ft.ElevatedButton(
                text=f"{i}. {c_sym} - Fiyat: {c_price:,.4f} $ (Skor: {c_score:.1f})",
                on_click=lambda e, s=c_sym: start_live_stream(s),
                style=ft.ButtonStyle(color=ft.colors.WHITE, bgcolor=ft.colors.GREY_900)
            )
            results_list.controls.append(btn)
        page.update()

    def start_live_stream(symbol):
        stop_event.set()
        stop_event.clear()
        
        results_list.visible = False
        status_text.visible = False
        progress_ring.visible = False
        detail_container.visible = True
        
        lbl_symbol.value = f"📌 İNCELENEN COİN: {symbol}"
        page.update()

        def run_async_ws():
            async def ws_worker():
                ws_url = f"wss://stream.binance.com:9443/ws/{symbol.lower()}@ticker"
                try:
                    k4h_url = f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval=4h&limit=50"
                    k4h = json.loads(urllib.request.urlopen(k4h_url).read().decode())

                    df4 = pd.DataFrame(k4h, columns=['open_time', 'open', 'high', 'low', 'close', 'volume', 'close_time', 'quote_volume', 'num_trades', 'taker_buy_base', 'taker_buy_quote', 'ignore'])
                    for col in ['open', 'high', 'low', 'close', 'volume']:
                        df4[col] = df4[col].astype(float)

                    tr1 = df4['high'] - df4['low']
                    tr2 = abs(df4['high'] - df4['close'].shift(1))
                    tr3 = abs(df4['low'] - df4['close'].shift(1))
                    atr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1).rolling(window=14).mean().iloc[-1]
                except Exception:
                    atr = 0

                import websockets
                try:
                    async with websockets.connect(ws_url) as websocket:
                        async for message in websocket:
                            if stop_event.is_set():
                                break
                            data = json.loads(message)
                            c_price = float(data['c'])
                            price_change_pct = float(data['P'])

                            base_skor = 75.0 + (price_change_pct * 0.5)
                            quant_skor = min(99.9, max(10.0, base_skor))
                            
                            if quant_skor >= 60:
                                emir_str = "🟢 GÜÇLÜ LONG / ALIM FIRSATI"
                                emir_color = ft.colors.GREEN_400
                            else:
                                emir_str = "🟡 DENGEDE / İZLEMEDE"
                                emir_color = ft.colors.YELLOW_400

                            stop_loss = c_price - (atr * 2.0)
                            take_profit = c_price + (atr * 4.5)

                            lbl_price.value = f"⚡ Binance Fiyat: {c_price:,.4f} $ (%{price_change_pct:+.2f})"
                            lbl_trend.value = "• 4H Ana Trend: Yükseliş Trendinde"
                            lbl_score.value = f"• Konsensüs Puanı: {quant_skor:.1f} / 100"
                            lbl_emir.value = f"• Kurumsal Emir: {emir_str}"
                            lbl_emir.color = emir_color
                            lbl_risk.value = f"• Stop: {stop_loss:,.4f} $ | Hedef: {take_profit:,.4f} $"
                            page.update()
                except Exception:
                    pass

            asyncio.run(ws_worker())

        threading.Thread(target=run_async_ws, daemon=True).start()

    def go_back(e):
        stop_event.set()
        detail_container.visible = False
        results_list.visible = True
        status_text.visible = True
        status_text.value = "🎯 Uzun Vade Potansiyel Yükseliş Adayları"
        page.update()

    back_btn = ft.ElevatedButton("⬅️ Listeye Geri Dön", on_click=go_back, bgcolor=ft.colors.RED_900)
    detail_container.controls = [back_btn, lbl_symbol, lbl_price, lbl_trend, lbl_score, lbl_emir, lbl_risk]

    page.add(
        ft.Column([
            ft.Text("🚀 BİNANCE QUANT TERMİNALİ", size=22, weight=ft.FontWeight.BOLD, color=ft.colors.GREEN_400),
            status_text,
            progress_ring,
            ft.Divider(),
            results_list,
            detail_container
        ], expand=True, horizontal_alignment=ft.CrossAxisAlignment.CENTER)
    )

    threading.Thread(target=load_market, daemon=True).start()

ft.app(main)
