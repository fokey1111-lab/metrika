
"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

function detectDateKey(headers) {
  const variants = ["datetime", "date", "time"];
  return headers.find((h) => variants.some((v) => h.toLowerCase().includes(v)));
}

function detectPriceKey(headers) {
  const priority = ["close", "adj close", "price", "last", "smh", "spx"];
  for (const p of priority) {
    const found = headers.find((h) => h.toLowerCase().includes(p));
    if (found) return found;
  }
  return headers.find((h) => !["datetime", "date", "time"].includes(h.toLowerCase()));
}

function calcMA(values, period = 200) {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    const slice = values.slice(i - period + 1, i + 1);
    return slice.reduce((s, v) => s + v, 0) / period;
  });
}

function calcReturns(rows) {
  if (!rows.length) {
    return { ytd: null, y1: null, y3: null, y5: null, y10: null };
  }

  const latest = rows[rows.length - 1];
  const latestDate = new Date(latest.date);
  const currentYear = latestDate.getFullYear();

  function findClosest(targetDate) {
    let best = null;
    let minDiff = Infinity;
    for (const row of rows) {
      const diff = Math.abs(new Date(row.date).getTime() - targetDate.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        best = row;
      }
    }
    return best;
  }

  function calcPeriodReturn(startRow) {
    if (!startRow || !latest?.price || !startRow?.price) return null;
    return ((latest.price / startRow.price) - 1) * 100;
  }

  const ytdStart = rows.find((r) => new Date(r.date).getFullYear() === currentYear);
  const oneYear = findClosest(new Date(latestDate.getFullYear() - 1, latestDate.getMonth(), latestDate.getDate()));
  const threeYears = findClosest(new Date(latestDate.getFullYear() - 3, latestDate.getMonth(), latestDate.getDate()));
  const fiveYears = findClosest(new Date(latestDate.getFullYear() - 5, latestDate.getMonth(), latestDate.getDate()));
  const tenYears = findClosest(new Date(latestDate.getFullYear() - 10, latestDate.getMonth(), latestDate.getDate()));

  return {
    ytd: calcPeriodReturn(ytdStart),
    y1: calcPeriodReturn(oneYear),
    y3: calcPeriodReturn(threeYears),
    y5: calcPeriodReturn(fiveYears),
    y10: calcPeriodReturn(tenYears),
  };
}

function recommendation(last) {
  if (!last || last.dev == null) return { action: "—", reason: "Недостаточно данных" };
  if (last.dev >= 30) return { action: "ПРОДАВАТЬ", reason: "Актив находится в зоне сильной перекупленности относительно MA200." };
  if (last.dev >= 15) return { action: "ДЕРЖАТЬ", reason: "Тренд сильный, но актив уже заметно выше своей средней." };
  if (last.dev <= 5) return { action: "ПОКУПАТЬ", reason: "Актив близко к средней или умеренно выше неё, перегрев не выражен." };
  return { action: "ДЕРЖАТЬ", reason: "Текущая картина нейтрально-позитивная без экстремального перегрева." };
}

function formatNum(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value).toFixed(digits);
}

export default function Page() {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  const processed = useMemo(() => {
    if (!rows.length) return { data: [], last: null, returns: null, assetName: "Актив" };

    const headers = Object.keys(rows[0] || {});
    const dateKey = detectDateKey(headers);
    const priceKey = detectPriceKey(headers);

    if (!dateKey || !priceKey) {
      return { data: [], last: null, returns: null, assetName: "Актив", error: "Не удалось определить столбцы даты и цены." };
    }

    const parsed = rows
      .map((r) => ({
        date: r[dateKey],
        price: Number(r[priceKey]),
      }))
      .filter((r) => r.date && !Number.isNaN(r.price));

    parsed.sort((a, b) => new Date(a.date) - new Date(b.date));

    const prices = parsed.map((r) => r.price);
    const ma200 = calcMA(prices, 200);

    const data = parsed.map((r, i) => {
      const ma = ma200[i];
      const dev = ma ? ((r.price - ma) / ma) * 100 : null;
      return {
        ...r,
        ma200: ma,
        dev,
      };
    });

    const last = data[data.length - 1] || null;
    const returns = calcReturns(data);
    return { data, last, returns, assetName: priceKey, error: "" };
  }, [rows]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(firstSheet, { defval: null });
      if (!json.length) {
        setError("Файл пустой или не содержит данных.");
        setRows([]);
        return;
      }
      setRows(json);
    } catch (err) {
      setError("Не удалось прочитать Excel-файл.");
      setRows([]);
    }
  }

  const rec = recommendation(processed.last);

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <div style={{ background: "#111827", color: "#fff", borderRadius: 18, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 32, fontWeight: 700 }}>Overbought Calculator</div>
        <div style={{ marginTop: 8, color: "#cbd5e1" }}>Калькулятор разработал Владимир Фокейчев</div>
      </div>

      <div style={{ background: "#fff", borderRadius: 18, padding: 20, boxShadow: "0 6px 24px rgba(0,0,0,0.06)", marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Загрузка Excel</div>
        <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} />
        {fileName ? <div style={{ marginTop: 10, color: "#475569" }}>Файл: {fileName}</div> : null}
        {error ? <div style={{ marginTop: 10, color: "#b91c1c" }}>{error}</div> : null}
        {processed.error ? <div style={{ marginTop: 10, color: "#b91c1c" }}>{processed.error}</div> : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
        {[
          ["Актив", processed.assetName || "—"],
          ["Цена", formatNum(processed.last?.price)],
          ["MA200", formatNum(processed.last?.ma200)],
          ["Deviation %", processed.last?.dev == null ? "—" : `${formatNum(processed.last?.dev)}%`],
          ["Рекомендация", rec.action],
        ].map(([title, value]) => (
          <div key={title} style={{ background: "#fff", borderRadius: 18, padding: 18, boxShadow: "0 6px 24px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 14, color: "#64748b" }}>{title}</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 18, padding: 20, boxShadow: "0 6px 24px rgba(0,0,0,0.06)", marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Комментарий</div>
        <div style={{ color: "#334155" }}>{rec.reason}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 20 }}>
        {[
          ["С начала года", processed.returns?.ytd],
          ["За 1 год", processed.returns?.y1],
          ["За 3 года", processed.returns?.y3],
          ["За 5 лет", processed.returns?.y5],
          ["За 10 лет", processed.returns?.y10],
        ].map(([title, value]) => (
          <div key={title} style={{ background: "#fff", borderRadius: 18, padding: 18, boxShadow: "0 6px 24px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 14, color: "#64748b" }}>{title}</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>
              {value == null ? "—" : `${formatNum(value)}%`}
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 18, padding: 20, boxShadow: "0 6px 24px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>График: цена и MA200</div>
        <div style={{ width: "100%", height: 480 }}>
          <ResponsiveContainer>
            <LineChart data={processed.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" hide />
              <YAxis domain={["auto", "auto"]} />
              <Tooltip />
              <Line type="monotone" dataKey="price" stroke="#111827" dot={false} strokeWidth={2} name="Цена" />
              <Line type="monotone" dataKey="ma200" stroke="#f97316" dot={false} strokeWidth={2} name="MA200" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 18, padding: 20, boxShadow: "0 6px 24px rgba(0,0,0,0.06)", marginTop: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>История перекупленности (Deviation %)</div>
        <div style={{ width: "100%", height: 380 }}>
          <ResponsiveContainer>
            <LineChart data={processed.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" hide />
              <YAxis />
              <Tooltip />
              <ReferenceLine y={15} stroke="#f59e0b" strokeDasharray="4 4" />
              <ReferenceLine y={30} stroke="#dc2626" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="dev" stroke="#2563eb" dot={false} strokeWidth={2} name="Deviation %" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </main>
  );
}
