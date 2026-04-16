export const metadata = {
  title: "Overbought Calculator",
  description: "Калькулятор перекупленности активов из Excel",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", background: "#f5f7fb" }}>
        {children}
      </body>
    </html>
  );
}
