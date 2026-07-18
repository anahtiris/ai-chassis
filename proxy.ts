import { NextResponse } from 'next/server'
import { auth } from '@/auth'

// Route guard for everything under /admin. As of Next.js 16, this file
// (renamed from middleware.ts) runs on the Node.js runtime rather than the
// Edge runtime — see docs/decisions.md "Auth: Auth.js (v5)" for why that
// matters here and what it changed versus the original project's
// Edge-only constraint.
export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isAdminRoute = req.nextUrl.pathname.startsWith('/admin')
  const isLoginRoute = req.nextUrl.pathname === '/admin/login'

  if (isAdminRoute && !isLoginRoute && !isLoggedIn) {
    const loginUrl = new URL('/admin/login', req.nextUrl.origin)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/admin/:path*'],
}
