import { NextRequest, NextResponse } from 'next/server'
import { MediaGenerator } from '@/lib/integrations/media-generator'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, ...options } = body

    // Initialize media generator with API keys from environment
    const generator = new MediaGenerator({
      openaiApiKey: process.env.OPENAI_API_KEY,
      googleApiKey: process.env.GOOGLE_API_KEY,
      stabilityApiKey: process.env.STABILITY_API_KEY,
      replicateApiKey: process.env.REPLICATE_API_KEY,
    })

    let result
    
    switch (type) {
      case 'image':
        result = await generator.generateImage(options)
        break
        
      case 'video':
        result = await generator.generateVideo(options)
        break
        
      case 'audio':
      case 'tts':
        result = await generator.generateTextToSpeech(options)
        break
        
      case 'marketing':
        result = await generator.generateMarketingContent(options)
        break
        
      case 'enhance':
        result = await generator.enhanceImage(options.imageUrl, options)
        break
        
      default:
        return NextResponse.json(
          { error: 'Invalid media type' },
          { status: 400 }
        )
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    })
  } catch (error) {
    console.error('Media generation error:', error)
    return NextResponse.json(
      { error: 'Media generation failed' },
      { status: 500 }
    )
  }
}