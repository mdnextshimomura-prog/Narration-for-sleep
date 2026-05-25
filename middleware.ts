import { NextRequest, NextResponse } from "next/server";

// 簡易ログイン保護（Basic認証）。
// APP_PASSWORD が設定されている場合のみ有効になる。
// 未設定のとき（ローカル開発など）は保護せずそのまま通す。
export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const user = process.env.APP_USER || "admin";
  const auth = req.headers.get("authorization");

  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = atob(encoded);
      const idx = decoded.indexOf(":");
      const reqUser = decoded.slice(0, idx);
      const reqPass = decoded.slice(idx + 1);
      if (reqUser === user && reqPass === password) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse("認証が必要です。", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Narration", charset="UTF-8"',
    },
  });
}

// 静的アセット以外のすべてのページ・APIに認証をかける。
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
