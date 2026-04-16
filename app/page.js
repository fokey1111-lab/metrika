'use client';

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Download, Thermometer, TrendingUp, AlertTriangle } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  AreaChart,
  Area,
  Legend
} from 'recharts';

function Card({ title, children }) {
  return (
    <div className="card">
      {title ? <div className="card-header"><div className="card-title">{title}</div></div> : null}
      <div className="card-content">{children}</div>
    </div>
  );
}

function calcSMA(values, period = 200) {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    const slice = values.slice(i - period + 1, i + 1);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
  });
}

function calcRSI(values, period = 14) {
  if (values.length < period + 1) return Array(values.length).fill(null);
  const out = Array(values.length).fill(null);
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function formatDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().slice(0, 10);
}

function fmt(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return '—';
  return Number(value).toFixed(digits);
}

function sampleRows() {
  const rows = [];
  let price = 100;
  const start = new Date('2022-01-03');
  for (let i = 0; i < 850; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const cycle = Math.sin(i / 40) * 1.2 + Math.sin(i / 9) * 0.35;
    const trend = i < 500 ? 0.18 : i < 720 ? 0.28 : 0.1;
    const shock = i > 710 && i < 770 ? 0.65 : 0;
    price = Math.max(20, price * (1 + (cycle + trend + shock) / 100));
    rows.push({ DateTime: d.toISOString().slice(0, 10), SMH: Number(price.toFixed(2)) });
  }
  return rows;
}

function detectDateKey(headers) {
  const lower = headers.map(h => String(h).trim().toLowerCase());
  const idx = lower.findIndex(h => h.includes('date') || h.includes('time'));
  return idx >= 0 ? headers[idx] : headers[0];
}

function detectNumericKeys(rows, headers, dateKey) {
  return headers.filter((key) => {
    if (key === dateKey) return false;
    let checked = 0;
    let numeric = 0;
    for (const row of rows) {
      const v = row[key];
      if (v == null || v === '') continue;
      checked += 1;
      if (!Number.isNaN(Number(v))) numeric += 1;
      if (checked >= 25) break;
    }
    return checked > 0 && numeric / checked >= 0.8;
  });
}

function getSignal(deviation, rsi, s) {
  if (deviation == null || rsi == null) return 'NO DATA';
  if (deviation >= s.extremeDeviation || rsi >= s.extremeRsi) return 'EXTREME';
  if (deviation >= s.overboughtDeviation || rsi >= s.overboughtRsi) return 'OVERBOUGHT';
  if (deviation >= s.warmDeviation || rsi >= s.warmRsi) return 'WARM';
  return 'NORMAL';
}

function badgeClass(signal) {
  if (signal === 'EXTREME') return 'badge badge-extreme';
  if (signal === 'OVERBOUGHT') return 'badge badge-overbought';
  if (signal === 'WARM') return 'badge badge-warm';
  return 'badge badge-normal';
}

export default function Page() {
  const [rows, setRows] = useState(sampleRows());
  const [fileName, setFileName] = useState('Built-in sample');
  const [error, setError] = useState('');
  const [selectedSheet, setSelectedSheet] = useState('');
  const [sheets, setSheets] = useState([]);
  const [sheetDataMap, setSheetDataMap] = useState({});
  const [dateKey, setDateKey] = useState('');
  const [assetKey, setAssetKey] = useState('');
  const [settings, setSettings] = useState({
    warmDeviation: 10,
    overboughtDeviation: 20,
    extremeDeviation: 30,
    warmRsi: 60,
    overboughtRsi: 70,
    extremeRsi: 80
  });

  const currentRows = useMemo(() => {
    if (selectedSheet && sheetDataMap[selectedSheet]) return sheetDataMap[selectedSheet];
    return rows;
  }, [rows, selectedSheet, sheetDataMap]);

  const headers = useMemo(() => Object.keys(currentRows?.[0] || {}), [currentRows]);
  const numericKeys = useMemo(() => detectNumericKeys(currentRows || [], headers, dateKey || detectDateKey(headers)), [currentRows, headers, dateKey]);

  const prepared = useMemo(() => {
    if (!currentRows?.length) return null;
    const resolvedDateKey = dateKey || detectDateKey(headers);
    const resolvedAssetKey = assetKey || numericKeys[0] || headers.find(h => h !== resolvedDateKey);
    if (!resolvedDateKey || !resolvedAssetKey) return { error: 'Не удалось определить столбцы даты и цены актива.' };

    const cleaned = currentRows
      .map((row) => ({ date: row[resolvedDateKey], close: Number(row[resolvedAssetKey]) }))
      .filter((row) => row.date != null && row.date !== '' && !Number.isNaN(row.close))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (cleaned.length < 30) return { error: 'Недостаточно данных. Нужно хотя бы 30 строк с датой и ценой.' };

    const closes = cleaned.map(r => r.close);
    const ma200 = calcSMA(closes, 200);
    const rsi14 = calcRSI(closes, 14);

    const enriched = cleaned.map((row, i) => {
      const deviation = ma200[i] ? ((row.close - ma200[i]) / ma200[i]) * 100 : null;
      const signal = getSignal(deviation, rsi14[i], settings);
      return {
        date: formatDate(row.date),
        close: row.close,
        ma200: ma200[i],
        deviation,
        rsi14: rsi14[i],
        signal,
        overboughtLevel: settings.overboughtDeviation,
        extremeLevel: settings.extremeDeviation,
        warmLevel: settings.warmDeviation
      };
    });

    const latest = enriched[enriched.length - 1];
    const stats = {
      warm: enriched.filter(r => r.signal === 'WARM').length,
      overbought: enriched.filter(r => r.signal === 'OVERBOUGHT').length,
      extreme: enriched.filter(r => r.signal === 'EXTREME').length,
    };
    return { enriched, latest, stats, assetName: resolvedAssetKey, dateName: resolvedDateKey };
  }, [currentRows, headers, dateKey, assetKey, numericKeys, settings]);

  const chartData = useMemo(() => prepared?.enriched?.slice(-350) || [], [prepared]);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const map = {};
      workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        map[sheetName] = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
      });
      const firstSheet = workbook.SheetNames[0] || '';
      setSheets(workbook.SheetNames);
      setSheetDataMap(map);
      setSelectedSheet(firstSheet);
      const firstRows = map[firstSheet] || [];
      setRows(firstRows);
      const firstHeaders = Object.keys(firstRows[0] || {});
      const guessedDate = detectDateKey(firstHeaders);
      const guessedNumeric = detectNumericKeys(firstRows, firstHeaders, guessedDate);
      setDateKey(guessedDate || '');
      setAssetKey(guessedNumeric[0] || '');
    } catch (e) {
      setError('Не удалось прочитать файл. Проверь формат .xlsx/.xls и структуру таблицы.');
    }
  }

  function downloadSample() {
    const ws = XLSX.utils.json_to_sheet(sampleRows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, 'sample_asset_input.xlsx');
  }

  return (
    <div className="container">
      <div className="row" style={{justifyContent:'space-between', alignItems:'flex-end', marginBottom: 20}}>
        <div>
          <h1 className="section-title">Universal Overbought Calculator</h1>
          <div className="muted" style={{marginTop:8, maxWidth:900}}>
            Загружай любые данные активов в формате вроде <b>DateTime + SPX</b>, <b>Date + Gold</b>, <b>Date + BTC</b> или несколько столбцов сразу. Сайт сам найдёт дату и числовые колонки, а при необходимости даст выбрать нужный актив вручную.
          </div>
        </div>
        <button className="btn" onClick={downloadSample}><Download size={16} /> Скачать пример Excel</button>
      </div>

      <div className="grid grid-2" style={{marginBottom:16}}>
        <Card title="Загрузка Excel">
          <label htmlFor="file-upload" className="label-upload">
            <Upload size={34} />
            <div style={{fontWeight:700, marginTop:8}}>Выберите Excel-файл</div>
            <div className="small" style={{marginTop:4}}>Поддерживаются .xlsx и .xls</div>
          </label>
          <input id="file-upload" type="file" accept=".xlsx,.xls" onChange={handleFile} style={{display:'none'}} />
          <div style={{marginTop:14}} className="small">Текущий источник: {fileName}</div>
          <div style={{marginTop:8}} className="small">Поддерживаемый формат: одна колонка даты и одна или несколько числовых колонок активов.</div>
          {error ? <div className="alert" style={{marginTop:12}}><AlertTriangle size={16} style={{verticalAlign:'middle', marginRight:8}} />{error}</div> : null}
          {prepared?.error ? <div className="alert" style={{marginTop:12}}><AlertTriangle size={16} style={{verticalAlign:'middle', marginRight:8}} />{prepared.error}</div> : null}
        </Card>

        <Card title="Распознавание данных">
          <div className="grid grid-3">
            <div>
              <div className="small">Sheet</div>
              <select className="select" value={selectedSheet} onChange={(e) => {
                const next = e.target.value;
                setSelectedSheet(next);
                const nextRows = sheetDataMap[next] || [];
                const nextHeaders = Object.keys(nextRows[0] || {});
                const guessedDate = detectDateKey(nextHeaders);
                const guessedNumeric = detectNumericKeys(nextRows, nextHeaders, guessedDate);
                setDateKey(guessedDate || '');
                setAssetKey(guessedNumeric[0] || '');
              }}>
                {sheets.length ? sheets.map(name => <option key={name} value={name}>{name}</option>) : <option>Data</option>}
              </select>
            </div>
            <div>
              <div className="small">Date column</div>
              <select className="select" value={dateKey || ''} onChange={(e) => setDateKey(e.target.value)}>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <div className="small">Asset column</div>
              <select className="select" value={assetKey || ''} onChange={(e) => setAssetKey(e.target.value)}>
                {(numericKeys.length ? numericKeys : headers.filter(h => h !== dateKey)).map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>
          <div className="small" style={{marginTop:12}}>Найденные числовые колонки: {numericKeys.join(', ') || 'не найдены'}</div>
        </Card>
      </div>

      <div className="grid grid-3" style={{marginBottom:16}}>
        <Card title="Пороговые значения deviation %">
          <div className="grid grid-3">
            {['warmDeviation','overboughtDeviation','extremeDeviation'].map((key) => (
              <div key={key}>
                <div className="small">{key}</div>
                <input className="input" type="number" value={settings[key]} onChange={(e) => setSettings(prev => ({...prev, [key]: Number(e.target.value)}))} />
              </div>
            ))}
          </div>
        </Card>
        <Card title="Пороговые значения RSI">
          <div className="grid grid-3">
            {['warmRsi','overboughtRsi','extremeRsi'].map((key) => (
              <div key={key}>
                <div className="small">{key}</div>
                <input className="input" type="number" value={settings[key]} onChange={(e) => setSettings(prev => ({...prev, [key]: Number(e.target.value)}))} />
              </div>
            ))}
          </div>
        </Card>
        <Card title="Логика сигнала">
          <div className="small">Warm: deviation или RSI выше первого уровня</div>
          <div className="small" style={{marginTop:8}}>Overbought: deviation ≥ ключевого уровня или RSI ≥ 70</div>
          <div className="small" style={{marginTop:8}}>Extreme: deviation ≥ экстремального уровня или RSI ≥ 80</div>
        </Card>
      </div>

      {prepared?.latest && !prepared?.error ? (
        <>
          <div className="grid grid-5" style={{marginBottom:16}}>
            <Card>
              <div className="small"><TrendingUp size={14} style={{verticalAlign:'middle', marginRight:6}} /> Актив</div>
              <div className="kpi">{prepared.assetName}</div>
            </Card>
            <Card>
              <div className="small">Last Price</div>
              <div className="kpi">{fmt(prepared.latest.close)}</div>
            </Card>
            <Card>
              <div className="small">MA200</div>
              <div className="kpi">{fmt(prepared.latest.ma200)}</div>
            </Card>
            <Card>
              <div className="small">Deviation %</div>
              <div className="kpi">{fmt(prepared.latest.deviation)}%</div>
            </Card>
            <Card>
              <div className="small"><Thermometer size={14} style={{verticalAlign:'middle', marginRight:6}} /> Signal</div>
              <div style={{marginTop:12}}><span className={badgeClass(prepared.latest.signal)}>{prepared.latest.signal}</span></div>
            </Card>
          </div>

          <div className="grid grid-2" style={{marginBottom:16}}>
            <Card title={`Price vs MA200 — ${prepared.assetName}`}>
              <div style={{width:'100%', height:360}}>
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" minTickGap={32} />
                    <YAxis domain={["auto", "auto"]} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="close" name={prepared.assetName} dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="ma200" name="MA200" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="История перекупленности">
              <div style={{width:'100%', height:360}}>
                <ResponsiveContainer>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" minTickGap={32} />
                    <YAxis domain={["auto", "auto"]} />
                    <Tooltip />
                    <Legend />
                    <ReferenceLine y={settings.warmDeviation} label="Warm" />
                    <ReferenceLine y={settings.overboughtDeviation} label="Overbought" />
                    <ReferenceLine y={settings.extremeDeviation} label="Extreme" />
                    <Area type="monotone" dataKey="deviation" name="Deviation %" strokeWidth={2} fillOpacity={0.25} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="row small" style={{marginTop:10}}>
                <span><span className="legend-dot" style={{background:'#eab308'}}></span> Warm: {prepared.stats.warm}</span>
                <span><span className="legend-dot" style={{background:'#f97316'}}></span> Overbought: {prepared.stats.overbought}</span>
                <span><span className="legend-dot" style={{background:'#ef4444'}}></span> Extreme: {prepared.stats.extreme}</span>
              </div>
            </Card>
          </div>

          <Card title="Последние 25 строк расчёта">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>{prepared.assetName}</th>
                    <th>MA200</th>
                    <th>Deviation %</th>
                    <th>RSI14</th>
                    <th>Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {prepared.enriched.slice(-25).reverse().map((row, idx) => (
                    <tr key={idx}>
                      <td>{row.date}</td>
                      <td>{fmt(row.close)}</td>
                      <td>{fmt(row.ma200)}</td>
                      <td>{fmt(row.deviation)}%</td>
                      <td>{fmt(row.rsi14)}</td>
                      <td><span className={badgeClass(row.signal)}>{row.signal}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
