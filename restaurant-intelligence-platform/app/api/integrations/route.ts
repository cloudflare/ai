import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Redirect to the list endpoint
  return NextResponse.redirect(new URL('/api/integrations/list', request.url))
}