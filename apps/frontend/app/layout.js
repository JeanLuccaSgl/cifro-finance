import "./globals.css";

export const metadata = {
  title: "Cifro — seu dinheiro, à frente",
  description: "Um jeito simples de ver o mês atual e o próximo antes de gastar.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
