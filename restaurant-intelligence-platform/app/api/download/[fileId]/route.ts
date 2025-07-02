import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const { fileId } = params
    
    // In a real implementation, you would look up the file metadata in a database
    // For now, we'll try to find it in the uploads directory
    const uploadDir = join(process.cwd(), 'public', 'uploads')
    
    // This is a simplified approach - in production, use a database
    const files = await import('fs/promises').then(fs => fs.readdir(uploadDir))
    const matchingFile = files.find(file => file.includes(fileId))
    
    if (!matchingFile) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }

    const filepath = join(uploadDir, matchingFile)
    
    if (!existsSync(filepath)) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }

    const fileBuffer = await readFile(filepath)
    const extension = matchingFile.split('.').pop()
    
    // Determine content type
    const contentTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      pdf: 'application/pdf',
      mp4: 'video/mp4',
      webm: 'video/webm',
      csv: 'text/csv',
      txt: 'text/plain',
    }

    const contentType = contentTypes[extension || ''] || 'application/octet-stream'

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${matchingFile}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json(
      { error: 'Download failed' },
      { status: 500 }
    )
  }
}