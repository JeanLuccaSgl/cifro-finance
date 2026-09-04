import "./globals.css";
import { SessionProvider } from "./providers";

export const metadata = {
  title: "Cifro — seu dinheiro, à frente",
  description: "Um jeito simples de ver o mês atual e o próximo antes de gastar.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#060a17",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body><SessionProvider>{children}</SessionProvider></body>
    </html>
  );
}
