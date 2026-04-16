import './globals.css';

export const metadata = {
  title: 'Overbought Calculator',
  description: 'Universal overbought calculator for any asset uploaded from Excel.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
