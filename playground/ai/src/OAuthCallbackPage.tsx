import { useEffect } from 'react'
import { onMcpAuthorization } from 'use-mcp'

export default function OAuthCallbackPage() {
  useEffect(() => {
    onMcpAuthorization()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Authenticating...</h1>
        <p className="text-gray-600 mb-2">Please wait while we complete your authentication.</p>
        <p className="text-sm text-gray-500">This window should close automatically.</p>
      </div>
    </div>
  )
}
