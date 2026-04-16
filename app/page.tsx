"use client";
import { useState } from "react";
import * as XLSX from "xlsx";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function Page() {
  const [data, setData] = useState([]);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);

    const key = Object.keys(json[0]).find(k =>
      k.toLowerCase().includes("close") ||
      k.toLowerCase().includes("smh") ||
      k.toLowerCase().includes("spx")
    );

    const parsed = json.map(r => ({
      date: r.DateTime || r.Date,
      price: Number(r[key])
    })).filter(r => r.price);

    parsed.sort((a,b)=> new Date(a.date)-new Date(b.date));

    const ma = parsed.map((_,i)=>{
      if(i<199) return null;
      return parsed.slice(i-199,i+1).reduce((s,v)=>s+v.price,0)/200;
    });

    const final = parsed.map((r,i)=>{
      const dev = ma[i] ? (r.price-ma[i])/ma[i]*100 : null;
      let signal = "HOLD";
      if(dev>30) signal="SELL";
      else if(dev<5) signal="BUY";
      return {...r,ma:ma[i],dev,signal};
    });

    setData(final);
  };

  const last = data[data.length-1];

  return (
    <div style={{padding:20}}>
      <h1>Overbought Calculator</h1>
      <p>Разработал Владимир Фокейчев</p>

      <input type="file" onChange={handleFile}/>

      {last && (
        <>
          <p>Цена: {last.price}</p>
          <p>MA200: {last.ma?.toFixed(2)}</p>
          <p>Deviation: {last.dev?.toFixed(2)}%</p>
          <p>Рекомендация: {last.signal}</p>
        </>
      )}

      {data.length>0 && (
        <div style={{width:"100%",height:400}}>
          <ResponsiveContainer>
            <LineChart data={data}>
              <XAxis dataKey="date" hide/>
              <YAxis/>
              <Tooltip/>
              <Line dataKey="price" stroke="#000" dot={false}/>
              <Line dataKey="ma" stroke="#ff7300" dot={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
